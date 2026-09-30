import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTLE_TTL_MS } from "./lock-ttl";

/**
 * P2cy — the settle freeze's lifetime, restated in SQL, pinned to the one the app computes.
 *
 * `20260929000000_p2dd_p2cy_line_guards.sql` taught the three cart-line RPCs to refuse under a
 * FRESH settlement, and "fresh" is `settle_at > now() - interval '10 minutes'` — a second copy of
 * `SETTLE_TTL_MS`, which `assertCartMember`, the settlement claim and the split door all read. Move
 * the constant and nothing reddened: the app would call a 12-minute-old freeze abandoned and let a
 * diner in, while the RPC still refused them — or, shortened, the RPC would let an add ride a live
 * Terminal charge the app still called frozen.
 *
 * PARSED, not scanned (LEARNINGS #60): comments are stripped by a tokenizer that keeps string
 * literals intact, the definition is the LAST `create function` for each RPC in apply order (a
 * mention in a comment defines nothing), and the interval is read from the one `if … then raise
 * exception 'cart is being paid'` — the candidate chosen by what it DOES, not where it sits.
 * Absence and ambiguity both fail; so does a literal-dead conjunct (`if false and …`), which would
 * keep the number while shipping no freeze. Every other `settle_at`-vs-`now()` comparison in the
 * body must agree too, so a second, divergent window cannot hide beside the guarded one.
 *
 * ⚠️ This reads outside `apps/qr`, so it is turbo-cache-exposed (the trap `tax.test.ts` names):
 * `apps/qr/turbo.json` declares `supabase/migrations/**` as a `test` input so a migration-only edit
 * re-runs it instead of replaying a cached green.
 */

const MIGRATIONS = join(__dirname, "..", "..", "..", "supabase", "migrations");
const RPCS = [
  "mms_cart_item_insert_if_open",
  "mms_cart_item_inc_qty",
  "mms_cart_item_set_qty_if_open",
] as const;

/** Drop `--` and (nesting) block comments; copy quoted literals and identifiers through intact. */
function stripSqlComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    const n = sql[i + 1];
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) throw new Error(`unterminated ${c} at offset ${i}`);
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "-" && n === "-") {
      const eol = sql.indexOf("\n", i);
      i = eol < 0 ? sql.length : eol;
    } else if (c === "/" && n === "*") {
      let depth = 1;
      let j = i + 2;
      while (depth > 0) {
        if (j >= sql.length) throw new Error(`unterminated block comment at offset ${i}`);
        const pair = sql.slice(j, j + 2);
        if (pair === "/*") depth++;
        else if (pair === "*/") depth--;
        j += pair === "/*" || pair === "*/" ? 2 : 1;
      }
      out += " ";
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

type Migration = { name: string; text: string };

/** The body of the LAST definition of `fn` across `files` (already in apply order), or null. */
function lastDefinition(files: Migration[], fn: string): { file: string; body: string } | null {
  const head = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${fn}\\s*\\(`,
    "gi",
  );
  let found: { file: string; body: string } | null = null;
  for (const { name, text } of files) {
    const sql = stripSqlComments(text);
    for (const m of sql.matchAll(head)) {
      const open = /\$([A-Za-z_]*)\$/.exec(sql.slice(m.index));
      if (!open) throw new Error(`${name}: ${fn} has no dollar-quoted body`);
      const from = m.index + open.index + open[0].length;
      const to = sql.indexOf(open[0], from);
      if (to < 0) throw new Error(`${name}: ${fn}'s body is not closed by ${open[0]}`);
      found = { file: name, body: sql.slice(from, to) };
    }
  }
  return found;
}

const FRESH = /\b\w*settle_at\s*>\s*now\(\)\s*-\s*interval\s*'(\d+)\s+minutes?'/gi;

/** Minutes in the ONE freeze predicate — the `if` whose branch raises 'cart is being paid'. */
function freezeMinutes(body: string): number {
  const ifs = [
    ...body.matchAll(
      /\bif\b((?:(?!\bthen\b)[^;])*)\bthen\s+raise\s+exception\s+'cart is being paid'/gi,
    ),
  ];
  if (ifs.length !== 1) throw new Error(`expected ONE freeze refusal, found ${ifs.length}`);
  const cond = ifs[0]![1]!;
  if (/\bfalse\b|\b1\s*=\s*0\b/i.test(cond))
    throw new Error(`the freeze predicate is dead: ${cond}`);
  const intervals = [...cond.matchAll(/\binterval\b/gi)].length;
  const fresh = [...cond.matchAll(FRESH)];
  if (intervals !== 1 || fresh.length !== 1) {
    throw new Error(`expected ONE \`settle_at > now() - interval 'N minutes'\`: ${cond.trim()}`);
  }
  return Number(fresh[0]![1]);
}

/** Every `…settle_at <op> now() - interval '…'` in the body, as minutes (NaN when not minutes). */
function everyWindow(body: string): number[] {
  return [...body.matchAll(/\b\w*settle_at\s*[<>]=?\s*now\(\)\s*-\s*interval\s*'([^']*)'/gi)].map(
    (m) => {
      const n = /^\s*(\d+)\s+minutes?\s*$/i.exec(m[1]!);
      return n ? Number(n[1]) : Number.NaN;
    },
  );
}

const migrations: Migration[] = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, text: readFileSync(join(MIGRATIONS, name), "utf8") }));

describe("the SQL settle freeze matches SETTLE_TTL_MS", () => {
  for (const fn of RPCS) {
    it(`${fn}: its live freeze window is SETTLE_TTL_MS`, () => {
      const def = lastDefinition(migrations, fn);
      expect(def, `${fn} is defined by no migration`).not.toBeNull();
      expect(freezeMinutes(def!.body) * 60_000).toBe(SETTLE_TTL_MS);
      const windows = everyWindow(def!.body);
      expect(windows.length).toBeGreaterThan(0);
      expect(windows.map((m) => m * 60_000)).toEqual(windows.map(() => SETTLE_TTL_MS));
    });
  }
});

describe("the guard itself — what it must refuse, and what must not satisfy it", () => {
  const fn = "mms_cart_item_inc_qty";
  const def = (freeze: string, extra = "") =>
    `create or replace function public.${fn}(p_id uuid) returns void language plpgsql as $$
     declare v_settle_at timestamptz;
     begin
       if p_id is null then raise exception 'invalid quantity'; end if;
       ${freeze}
       ${extra}
     end $$;`;
  const REAL = `if v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then
         raise exception 'cart is being paid' using errcode = 'P0001';
       end if;`;
  const at = (m: number) => REAL.replace("10 minutes", `${m} minutes`);

  it("binds to the LAST migration in apply order, and a comment defines nothing", () => {
    const files = [
      { name: "1_a.sql", text: def(at(10)) },
      { name: "2_b.sql", text: def(at(12)) },
      {
        name: "3_c.sql",
        text: `-- create or replace function public.${fn}(p_id uuid) … '99 minutes'`,
      },
    ];
    const got = lastDefinition(files, fn);
    expect(got?.file).toBe("2_b.sql");
    expect(freezeMinutes(got!.body)).toBe(12);
  });

  it("reads the shipped predicate, not a commented-out one beside it", () => {
    const body = lastDefinition(
      [{ name: "x.sql", text: def(`-- ${at(99).replace(/\n/g, " ")}\n${REAL}`) }],
      fn,
    )!.body;
    expect(freezeMinutes(body)).toBe(10);
  });

  it("refuses absence, ambiguity, a dead predicate and a non-minute window", () => {
    const body = (freeze: string, extra = "") =>
      lastDefinition([{ name: "x.sql", text: def(freeze, extra) }], fn)!.body;
    expect(() => freezeMinutes(body(""))).toThrow(/ONE freeze refusal, found 0/);
    expect(() => freezeMinutes(body(REAL, REAL))).toThrow(/ONE freeze refusal, found 2/);
    expect(() =>
      freezeMinutes(body(REAL.replace("if v_settle_at", "if false and v_settle_at"))),
    ).toThrow(/dead/);
    expect(() => freezeMinutes(body(REAL.replace("'10 minutes'", "'600 seconds'")))).toThrow(
      /ONE `settle_at/,
    );
  });

  it("sees a second, divergent window elsewhere in the body", () => {
    const extra = `perform 1 where v_settle_at > now() - interval '12 minutes';`;
    const body = lastDefinition([{ name: "x.sql", text: def(REAL, extra) }], fn)!.body;
    expect(freezeMinutes(body)).toBe(10);
    expect(everyWindow(body)).toEqual([10, 12]);
  });
});
