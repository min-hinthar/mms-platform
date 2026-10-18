import { readdirSync, readFileSync, statSync } from "node:fs";
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
 * Limit: a diner client handed to a helper as a PARAMETER is not followed. None is today — every
 * other `qr_orders` read is on the service role, which keeps its table-level grant.
 */
const QR = join(__dirname, "..");
const REPO = join(QR, "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");
const DINER_FACTORIES = new Set(["browserClient", "serverClient", "sessionClient"]);
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

/** The initializer callee a name is bound to in the nearest enclosing scope, or null (a parameter,
 *  an import, anything else). */
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
    if (
      ts.isFunctionLike(n) &&
      n.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === name)
    )
      return null;
  }
  return null;
}

type DinerRead = { file: string; line: number; select: string };

/** Every `<diner client>.from("qr_orders").select(<arg>)` in the app. */
function dinerOrderReads(): DinerRead[] {
  const out: DinerRead[] = [];
  const track = trackOrderSelect();
  for (const file of [
    ...sourceFiles(join(QR, "lib")),
    ...sourceFiles(join(QR, "app")),
    ...sourceFiles(join(QR, "components")),
  ]) {
    const sf = parse(file);
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "from" &&
        ts.isIdentifier(n.expression.expression) &&
        n.arguments.length === 1 &&
        ts.isStringLiteralLike(n.arguments[0]!) &&
        (n.arguments[0] as ts.StringLiteralLike).text === "qr_orders"
      ) {
        const factory = boundFactory(n, n.expression.expression.text);
        if (factory && DINER_FACTORIES.has(factory)) {
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
  return out;
}

describe("M309 — diner qr_orders reads name only granted columns", () => {
  const grant = grantedColumns();
  const reads = dinerOrderReads();

  it("the grant withholds the receipt address and its stamp", () => {
    for (const c of WITHHELD) expect(grant.cols.has(c), `${grant.file} grants ${c}`).toBe(false);
  });

  it("finds the diner reads it exists to check (never vacuous)", () => {
    const files = new Set(reads.map((r) => r.file));
    expect(files.has("lib/useOrderStatus.ts")).toBe(true);
    expect(files.has("lib/order-kitchen-read.ts")).toBe(true);
  });

  it("every diner select names only granted columns", () => {
    const misses = reads.flatMap((r) =>
      topLevelColumns(r.select)
        .filter((c) => !grant.cols.has(c))
        .map((c) => `${r.file}:${r.line} names ${c} (not granted by ${grant.file})`),
    );
    expect(misses).toEqual([]);
  });

  it("parses PostgREST select strings: embeds excluded, alias and cast unwrapped", () => {
    expect(topLevelColumns("id,a:b,c::text,items(x,y),d")).toEqual(["id", "b", "c", "d"]);
    expect(topLevelColumns("*")).toEqual(["*"]);
  });
});
