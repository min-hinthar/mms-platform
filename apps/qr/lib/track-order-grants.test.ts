import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * M309 — the diner's `qr_orders` reads must name only columns the database GRANTS them.
 *
 * Since 20261018120000_m309_order_read_scope.sql, `authenticated` holds a COLUMN-level select on
 * `qr_orders` — every column but `receipt_email` / `receipt_sent_at` — instead of a table-level one.
 * That is fail-closed: a column added to `qr_orders` later is not diner-readable until a migration
 * grants it, and a diner read naming it fails with 42501. Every vitest suite mocks the database, so
 * the first place that failure would show is production — the live /track read (`TRACK_ORDER_SELECT`)
 * erroring for every diner. And the inverse edit — a diner select that names `receipt_email` — would
 * be refused the same way: the address is the earner's, read by the service role in lib/receipt.ts.
 *
 * So this suite PARSES both sides (LEARNINGS #60 — never a substring scan):
 *   · the SQL: the column list of the LATEST migration's `grant select ( … ) on public.qr_orders to
 *     authenticated`, comments stripped (the SQL side — supabase/tests/m309_order_read_scope_test.sql
 *     — proves that list is what the database holds: every column but the two);
 *   · the TS: every `.from("qr_orders").select(…)` whose receiver is bound, in its own scope, to a
 *     DINER client (`browserClient()`, `serverClient(…)`, `sessionClient(…)` — RLS and column
 *     privileges apply), its select string evaluated (a literal, or `TRACK_ORDER_SELECT` read from
 *     lib/track-order.ts's own export).
 * FAIL-CLOSED on what it cannot classify (the blind pass on #364): EVERY `.from("qr_orders")` in
 * lib/, app/ and components/ must resolve to a diner factory (checked above) or to the service role —
 * `serviceClient(…)` bound in scope, or a parameter typed `ReturnType<typeof serviceClient>` (directly
 * or through a same-file `type` alias) — and anything else (a `useMemo` binding, a destructured or
 * chained receiver, an untyped parameter) fails the suite instead of being skipped. Staff are
 * `authenticated` too, so this is also the check that no staff `.from("qr_orders")` rides a staff JWT.
 * And every literal EMBED of `qr_orders(…)` / `qr_orders!hint(…)` in a select string, on any client,
 * names only granted columns (never `*`).
 * NOT PARSED (the capped pass over #364's fix commits; none of these exists in the app today):
 * Realtime `postgres_changes` subscriptions, RPCs, a non-literal `.from(…)` argument, spread
 * (`...qr_orders(…)`) and FK-column (`order:order_id(…)`) embeds, a `let` client reassigned between
 * kinds, and a diner client passed to a parameter typed as the service client (the factories share
 * one client type, so `tsc` would not refuse it). A new read in one of those shapes is reviewed by hand.
 */
const QR = join(__dirname, "..");
const REPO = join(QR, "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");
const DINER_FACTORIES = new Set(["browserClient", "serverClient", "sessionClient"]);
const SERVICE_FACTORY = "serviceClient";
/** The ONLY files that may read `qr_orders` on a diner (RLS) client — Codex on #364: a staff read
 *  added on `serverClient()` would otherwise pass as a "diner read". A new diner read is added here
 *  on purpose, with the review that it is a diner's. */
const DINER_READ_FILES = ["lib/order-kitchen-read.ts", "lib/useOrderStatus.ts"];
const SERVICE_TYPE = `ReturnType<typeof ${SERVICE_FACTORY}>`;
const WITHHELD = ["receipt_email", "receipt_sent_at"];

function parse(file: string) {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

/** Strip SQL comments (`--` to end of line, `/* … *\/`), keeping string literals intact enough for a
 *  grant statement (which carries none). */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** The authenticated column grant on qr_orders, from the latest migration that states one. */
function grantedColumns(): { file: string; cols: Set<string> } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let found: { file: string; cols: Set<string> } | null = null;
  const re = /grant\s+select\s*\(([^)]*)\)\s*on\s+(?:table\s+)?public\.qr_orders\s+to\s+([^;]*);/gi;
  for (const f of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS, f), "utf8"));
    const hits = [...sql.matchAll(re)].filter((m) =>
      (m[2] ?? "").split(",").some((g) => g.trim().toLowerCase() === "authenticated"),
    );
    if (hits.length > 1) throw new Error(`${f}: more than one authenticated grant on qr_orders`);
    const hit = hits[0];
    if (hit)
      found = {
        file: f,
        cols: new Set(
          (hit[1] ?? "")
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
        ),
      };
  }
  if (!found) throw new Error("no `grant select (…) on public.qr_orders to authenticated` found");
  return found;
}

/** The top-level column names a PostgREST select string names (embeds `rel(...)` excluded, an
 *  `alias:col` read as `col`, a `col::cast` as `col`). `*` is returned as itself. */
function topLevelColumns(select: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  const flush = () => {
    const t = cur.trim();
    cur = "";
    if (!t || t.includes("(")) return; // an embedded resource is another table's grant
    const name = (t.includes(":") && !t.includes("::") ? t.slice(t.indexOf(":") + 1) : t).split(
      "::",
    )[0];
    out.push((name ?? "").trim());
  };
  for (const ch of select) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) flush();
    else cur += ch;
  }
  flush();
  return out;
}

/** TRACK_ORDER_SELECT's shipped value, read from its declaration (a single string literal by design). */
function trackOrderSelect(): string {
  const sf = parse(join(QR, "lib", "track-order.ts"));
  const vals: string[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "TRACK_ORDER_SELECT" &&
      n.initializer &&
      ts.isStringLiteralLike(n.initializer)
    )
      vals.push(n.initializer.text);
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(sf);
  if (vals.length !== 1)
    throw new Error(`TRACK_ORDER_SELECT: expected one literal, found ${vals.length}`);
  return vals[0]!;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      sourceFiles(p, acc);
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

/** A parameter's declared type, an alias of the service client when the file declares one. */
function isServiceType(sf: ts.SourceFile, type: ts.TypeNode | undefined): boolean {
  if (!type) return false;
  const text = type.getText(sf).replace(/\s+/g, "");
  if (text === SERVICE_TYPE.replace(/\s+/g, "")) return true;
  if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName) || type.typeArguments)
    return false;
  const alias = type.typeName.text;
  return sf.statements.some(
    (s) =>
      ts.isTypeAliasDeclaration(s) &&
      s.name.text === alias &&
      s.type.getText(sf).replace(/\s+/g, "") === SERVICE_TYPE.replace(/\s+/g, ""),
  );
}

/** The initializer callee a name is bound to in the nearest enclosing scope; SERVICE_FACTORY for a
 *  parameter typed as the service client; null for anything else (an untyped parameter, an import, a
 *  non-call initializer). */
function boundFactory(at: ts.Node, name: string): string | null {
  for (let n: ts.Node | undefined = at.parent; n; n = n.parent) {
    const stmts =
      ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) ? n.statements : undefined;
    if (stmts)
      for (const s of stmts) {
        if (!ts.isVariableStatement(s)) continue;
        for (const d of s.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || d.name.text !== name || !d.initializer) continue;
          let init: ts.Expression = d.initializer;
          if (ts.isAwaitExpression(init)) init = init.expression;
          if (ts.isCallExpression(init) && ts.isIdentifier(init.expression))
            return init.expression.text;
          return null;
        }
      }
    if (ts.isFunctionLike(n)) {
      const p = n.parameters.find((q) => ts.isIdentifier(q.name) && q.name.text === name);
      if (p) return isServiceType(at.getSourceFile(), p.type) ? SERVICE_FACTORY : null;
    }
  }
  return null;
}

type DinerRead = { file: string; line: number; select: string };
type Scan = { reads: DinerRead[]; unclassified: string[]; embeds: DinerRead[]; service: number };

function appFiles(): string[] {
  return [
    ...sourceFiles(join(QR, "lib")),
    ...sourceFiles(join(QR, "app")),
    ...sourceFiles(join(QR, "components")),
  ];
}

/** The column lists of every `qr_orders(…)` / `qr_orders!hint(…)` embed in a select string, read
 *  to its BALANCED close paren (a nested embed inside it stays in the list, and `topLevelColumns`
 *  skips it). An unbalanced embed throws — refused, never skipped. */
function embeddedOrderColumns(select: string): string[] {
  const out: string[] = [];
  for (const m of select.matchAll(/(?:^|[,(\s:])qr_orders(?:![\w]+)?\s*\(/g)) {
    const open = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let i = open;
    for (; i < select.length && depth > 0; i++) {
      if (select[i] === "(") depth += 1;
      if (select[i] === ")") depth -= 1;
    }
    if (depth !== 0) throw new Error(`unbalanced qr_orders embed in select: ${select}`);
    out.push(select.slice(open, i - 1));
  }
  return out;
}

/** Every `.from("qr_orders")` in the app, classified, plus every embed of `qr_orders(…)`. */
function scanOrderReads(files: string[] = appFiles()): Scan {
  const out: DinerRead[] = [];
  const unclassified: string[] = [];
  const embeds: DinerRead[] = [];
  let service = 0;
  const track = trackOrderSelect();
  for (const file of files) {
    const sf = parse(file);
    const at = (n: ts.Node) =>
      `${relative(QR, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    const visit = (n: ts.Node) => {
      if (ts.isStringLiteralLike(n))
        for (const cols of embeddedOrderColumns(n.text))
          embeds.push({
            file: relative(QR, file),
            line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
            select: cols,
          });
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "from" &&
        n.arguments.length === 1 &&
        ts.isStringLiteralLike(n.arguments[0]!) &&
        (n.arguments[0] as ts.StringLiteralLike).text === "qr_orders"
      ) {
        const recv = n.expression.expression;
        const factory = ts.isIdentifier(recv) ? boundFactory(n, recv.text) : null;
        if (factory === SERVICE_FACTORY) service += 1;
        else if (!factory || !DINER_FACTORIES.has(factory))
          unclassified.push(`${at(n)} — receiver \`${recv.getText(sf)}\``);
        else {
          const sel = n.parent;
          const call = sel?.parent;
          if (
            !sel ||
            !call ||
            !ts.isPropertyAccessExpression(sel) ||
            sel.name.text !== "select" ||
            !ts.isCallExpression(call)
          )
            throw new Error(`${relative(REPO, file)}: a diner qr_orders read with no .select()`);
          const arg = call.arguments[0];
          let select: string;
          if (arg && ts.isStringLiteralLike(arg)) select = arg.text;
          else if (arg && ts.isIdentifier(arg) && arg.text === "TRACK_ORDER_SELECT") select = track;
          else
            throw new Error(
              `${relative(REPO, file)}: a diner qr_orders select this guard cannot evaluate`,
            );
          out.push({
            file: relative(QR, file),
            line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
            select,
          });
        }
      }
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
  }
  return { reads: out, unclassified, embeds, service };
}

describe("M309 — diner qr_orders reads name only granted columns", () => {
  const grant = grantedColumns();
  const scan = scanOrderReads();
  const reads = scan.reads;

  it("the grant withholds the receipt address and its stamp", () => {
    for (const c of WITHHELD) expect(grant.cols.has(c), `${grant.file} grants ${c}`).toBe(false);
  });

  it("diner-client qr_orders reads sit only in the allowlisted diner files (never vacuous)", () => {
    expect([...new Set(reads.map((r) => r.file))].sort()).toEqual(DINER_READ_FILES);
  });

  it("every diner select names only granted columns", () => {
    const misses = reads.flatMap((r) =>
      topLevelColumns(r.select)
        .filter((c) => !grant.cols.has(c))
        .map((c) => `${r.file}:${r.line} names ${c} (not granted by ${grant.file})`),
    );
    expect(misses).toEqual([]);
  });

  it("every qr_orders read is on a client it can classify — a diner factory or the service role", () => {
    expect(scan.unclassified).toEqual([]);
    expect(scan.service).toBeGreaterThan(0); // never vacuous
  });

  it("every embed of qr_orders(…) names only granted columns, on any client", () => {
    const misses = scan.embeds.flatMap((e) =>
      topLevelColumns(e.select)
        .filter((c) => !grant.cols.has(c))
        .map((c) => `${e.file}:${e.line} embeds qr_orders(${c})`),
    );
    expect(scan.embeds.length).toBeGreaterThan(0); // feedback.ts and refunds.ts embed it today
    expect(misses).toEqual([]);
  });

  it("refuses the receivers it cannot classify, and reads the service-typed parameter", () => {
    const dir = mkdtempSync(join(tmpdir(), "m309-guard-"));
    const f = join(dir, "probe.ts");
    writeFileSync(
      f,
      [
        "type Db = ReturnType<typeof serviceClient>;",
        'function a(db: Db) { return db.from("qr_orders").select("*"); }',
        'function b(db) { return db.from("qr_orders").select("id"); }',
        'function c() { const supa = useMemo(() => browserClient(), []); return supa.from("qr_orders").select("*"); }',
        'async function d(x) { return (await serverClient(x)).from("qr_orders").select("*"); }',
        'function e() { const { supa } = ctx(); return supa.from("qr_orders").select("*"); }',
        'const E = "id,qr_orders(receipt_email)";',
        'const N = "id,qr_orders(table_number,qr_order_items(id),receipt_sent_at)";',
      ].join("\n"),
    );
    try {
      const probe = scanOrderReads([f]);
      expect(probe.service).toBe(1);
      // The lines of b · c · d · e: an untyped parameter, a useMemo binding, a chained receiver and a
      // destructured one.
      expect(probe.unclassified.map((u) => u.split(" — ")[0]!.split(":").pop())).toEqual([
        "3",
        "4",
        "5",
        "6",
      ]);
      expect(probe.embeds.map((e) => e.select)).toEqual([
        "receipt_email",
        "table_number,qr_order_items(id),receipt_sent_at",
      ]);
      expect(topLevelColumns(probe.embeds[1]!.select)).toEqual(["table_number", "receipt_sent_at"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses PostgREST select strings: embeds excluded, alias and cast unwrapped", () => {
    expect(topLevelColumns("id,a:b,c::text,items(x,y),d")).toEqual(["id", "b", "c", "d"]);
    expect(topLevelColumns("*")).toEqual(["*"]);
  });
});
