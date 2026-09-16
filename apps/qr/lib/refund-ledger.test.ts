import { describe, expect, it } from "vitest";
import {
  cashRefundedCents,
  latestRefundByOrder,
  readLedgerSince,
  type LedgerRow,
} from "./refund-ledger";

/**
 * M218 · M219 — the two answers both screens take from ONE ledger read, pinned as values.
 *
 * `cashRefundedCents` is a money figure a manager counts the till against, so the case that matters
 * is the MIXED day: a card refund in the same ledger must not move it by a cent.
 */
const row = (o: Partial<LedgerRow> & { orderId: string }): LedgerRow => ({
  orderItemId: null,
  amountCents: 0,
  tender: "card",
  createdAt: "2026-09-16T18:00:00.000Z",
  ...o,
});

describe("latestRefundByOrder", () => {
  it("keeps the LATEST instant per order, whatever order the rows arrive in", () => {
    // ⚠️ THE LATEST ROW MUST NOT BE THE LAST ROW, or a "last one wins" reducer passes this case by
    // coincidence — which is exactly what the first draft did, and `verify:slice` caught it as a
    // SURVIVING mutant. Order a's newest instant (18:09) arrives in the MIDDLE; an older row
    // follows it.
    const latest = latestRefundByOrder([
      row({ orderId: "a", createdAt: "2026-09-16T18:05:00.000Z" }),
      row({ orderId: "b", createdAt: "2026-09-16T18:01:00.000Z" }),
      row({ orderId: "a", createdAt: "2026-09-16T18:09:00.000Z" }),
      row({ orderId: "a", createdAt: "2026-09-16T18:02:00.000Z" }),
    ]);
    expect(latest.get("a")).toBe("2026-09-16T18:09:00.000Z");
    expect(latest.get("b")).toBe("2026-09-16T18:01:00.000Z");
    expect(latest.size).toBe(2);
  });

  it("is empty for an empty ledger — a day with no refunds names no orders", () => {
    expect(latestRefundByOrder([]).size).toBe(0);
  });
});

describe("cashRefundedCents — what left the DRAWER", () => {
  it("sums the cash rows and ignores the card ones", () => {
    const cents = cashRefundedCents([
      row({ orderId: "a", tender: "cash", amountCents: 1105 }),
      row({ orderId: "b", tender: "card", amountCents: 9999 }),
      row({ orderId: "c", tender: "cash", amountCents: 250 }),
    ]);
    // A reducer that ignored `tender` would answer 11354 here; the till would read long by the card
    // refund, with nothing on screen to explain it.
    expect(cents).toBe(1355);
  });

  it("is zero when every refund went back through the processor", () => {
    expect(
      cashRefundedCents([
        row({ orderId: "a", tender: "card", amountCents: 500 }),
        row({ orderId: "b", tender: "card", amountCents: 700 }),
      ]),
    ).toBe(0);
  });

  it("is zero for an empty ledger", () => {
    expect(cashRefundedCents([])).toBe(0);
  });
});

/**
 * M219 — the PAGING itself, because a loop that stops after one page is the same silent-subset
 * defect one layer down. PostgREST answers max-rows with `error` null, so nothing upstream can tell
 * a capped page from a complete one; only asking for the next page can.
 *
 * The fake serves 1500 rows, which is the point: at 1000 per page a single-page read returns 1000 of
 * them and looks perfectly healthy.
 *
 * Below it, a tiny PostgREST `or=` evaluator, so the fake honours WHATEVER filter the code ships rather than
 * pattern-matching the one this test expects. Terms are `col.op."value"`, OR-joined at the top
 * level, with `and(...)` groups — the shape PostgREST's `or` parameter actually takes.
 *
 * This is the difference between a test that pins a STRING and one that pins the SEEK: a filter
 * that forgets the tie-break is still a perfectly well-formed string, and only evaluating it
 * against tied rows shows what it drops.
 */
function splitTerms(filter: string): string[] {
  const terms: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= filter.length; i += 1) {
    const c = filter[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (i === filter.length || (c === "," && depth === 0)) {
      terms.push(filter.slice(start, i));
      start = i + 1;
    }
  }
  return terms;
}

type Served = { id: string; created_at: string } & Record<string, unknown>;

const OPS: Record<string, (a: string, b: string) => boolean> = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  eq: (a, b) => a === b,
};

function predicate(term: string): (r: Served) => boolean {
  if (term.startsWith("and(")) {
    const parts = splitTerms(term.slice(4, -1)).map(predicate);
    return (r) => parts.every((p) => p(r));
  }
  const m = /^([a-z_]+)\.([a-z]+)\."(.*)"$/.exec(term);
  if (m === null) throw new Error(`fake ledger: unparsable filter term ${term}`);
  const [, col, op, value] = m as unknown as [string, string, string, string];
  const fn = OPS[op];
  if (fn === undefined) throw new Error(`fake ledger: unsupported operator ${op}`);
  return (r) => fn(String(r[col]), value);
}

/**
 * The fake ledger. 1500 rows ordered by `(created_at, id)`, served a page at a time to whatever
 * cursor filter the code hands it.
 *
 * ⚠️ TWO ROWS SHARE AN INSTANT ACROSS THE PAGE BOUNDARY (indices 999 and 1000). That is the whole
 * fixture: `created_at` is not unique, so a seek of `created_at > <last seen>` alone SKIPS the
 * second of a tied pair, and a day quietly loses a refund at every page edge. Only the composite
 * `(created_at, id)` seek carries both across.
 *
 * There is deliberately no `range` method: a regression to offset paging is a TypeError here, not a
 * silently-different answer.
 */
function fakeDb(
  total: number,
  opts: { failOnPage?: number; failWith?: { page: number; code: string } } = {},
) {
  const all: Served[] = Array.from({ length: total }, (_, i) => ({
    id: `r${String(i).padStart(5, "0")}`,
    order_id: `o${i}`,
    order_item_id: null,
    amount_cents: 1,
    tender: i % 2 === 0 ? "cash" : "card",
    // Index 1000 ties with 999 — the straddled boundary.
    created_at: new Date(Date.UTC(2026, 8, 16) + (i === 1000 ? 999 : i) * 1000).toISOString(),
  }));
  const seeks: string[] = [];
  const selects: string[] = [];
  // ⚠️ THE FAKE PROJECTS. A row carries `tender` in the fixture, so a fake that returned whole rows
  // would hand it back even to the select that never asked — and the pre-migration case would pass
  // without the fallback doing anything.
  let cols: string[] = [];
  let cursor: ((r: Served) => boolean) | null = null;
  let asks = 0;
  const api = {
    select: (c: string) => {
      selects.push(c);
      cols = c.split(",");
      return api;
    },
    gte: () => api,
    or: (f: string) => {
      seeks.push(f);
      const preds = splitTerms(f).map(predicate);
      cursor = (r) => preds.some((p) => p(r));
      return api;
    },
    order: () => api,
    limit: (n: number) => {
      const seek = cursor;
      const page = (seek === null ? all : all.filter(seek))
        .slice(0, n)
        .map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])) as Served);
      const failing = opts.failOnPage === asks;
      const coded = opts.failWith?.page === asks ? opts.failWith.code : null;
      asks += 1;
      cursor = null;
      if (coded !== null)
        return Promise.resolve({
          data: null,
          error: { code: coded, message: `column mms_refunds.tender does not exist` },
        });
      return Promise.resolve(
        failing
          ? { data: null, error: { message: "ledger unreadable" } }
          : { data: page, error: null },
      );
    },
  };
  return { from: () => api, seeks, selects, asks: () => asks };
}

describe("readLedgerSince — the read is COMPLETE or it is null", () => {
  it("keeps seeking past the last row it saw: 1500 rows, not the first 1000", async () => {
    const db = fakeDb(1500);
    const rows = await readLedgerSince(db as never, "2026-09-16T00:00:00.000Z");
    expect(rows).not.toBeNull();
    // 1500, not 1499: row 1000 SHARES row 999's instant across the page boundary, so this count is
    // also the tie-break's falsification. A seek of `created_at > <last seen>` alone answers 1499
    // here and loses a real refund at every page edge; the composite `(created_at, id)` seek is the
    // only filter that carries the tied row over.
    expect(rows!.length).toBe(1500);
    // Every row exactly once — a cursor that went BACKWARDS would answer 1500 with a duplicate.
    expect(new Set(rows!.map((r) => r.orderId)).size).toBe(1500);
    // Two asks: a full page, then a short one that ends it.
    expect(db.asks()).toBe(2);
    // ⚠️ The second ask seeks past the LAST ROW SEEN, not to an offset. An offset cursor shifts when
    // a row commits between pages; this one cannot (Codex round 1 on #286, P2). The fake has no
    // `range` method, so a regression to offset paging is a TypeError rather than a wrong number.
    expect(db.seeks).toHaveLength(1);
  });

  it("answers null when a LATER page fails — never the rows it happened to get first", async () => {
    // A partial answer is the defect, so a failure mid-read must not degrade into "here is some of
    // the day". The drawer would net a subset of the hand-backs and call it the till.
    const db = fakeDb(1500, { failOnPage: 1 });
    expect(await readLedgerSince(db as never, "2026-09-16T00:00:00.000Z")).toBeNull();
  });

  it("the app-first window: an undefined `tender` re-asks WITHOUT it and reads the day as card", async () => {
    // The app ships on merge and the migration is applied by hand afterwards. PostgREST rejects the
    // whole query for one unknown column, so without this the settled list AND the drawer both read
    // as an outage for the length of that window (Codex round 2 on #286, P1).
    const db = fakeDb(3, { failWith: { page: 0, code: "42703" } });
    const rows = await readLedgerSince(db as never, "2026-09-16T00:00:00.000Z");
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(3);
    // Every row is a CARD refund — true by construction, since the column and the cash RPC land in
    // the same migration, so nothing could have recorded a cash refund before it ran.
    expect(cashRefundedCents(rows!)).toBe(0);
    // It re-asked the SAME page one column short. Not a second window, not a skipped page.
    expect(db.selects).toHaveLength(2);
    expect(db.selects[0]).toContain("tender");
    expect(db.selects[1]).not.toContain("tender");
    expect(db.seeks).toHaveLength(0);
  });

  it("a REAL outage still answers null — a broken read must not degrade into a plausible subset", async () => {
    // The narrow-ness of the fallback is the point: only 42703, only on the ask that named the new
    // column. Any other failure is an outage and must say so.
    const db = fakeDb(3, { failWith: { page: 0, code: "57014" } });
    expect(await readLedgerSince(db as never, "2026-09-16T00:00:00.000Z")).toBeNull();
    // It did NOT re-ask one column short.
    expect(db.selects).toHaveLength(1);
  });

  it("an exactly-full single page still asks again — the cap and a real boundary look identical", async () => {
    const db = fakeDb(1000);
    const rows = await readLedgerSince(db as never, "2026-09-16T00:00:00.000Z");
    expect(rows!.length).toBe(1000);
    expect(db.asks()).toBe(2); // the second ask comes back empty and ends it
  });
});
