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
 */
function fakeDb(total: number, opts: { failOnPage?: number } = {}) {
  const ranges: [number, number][] = [];
  const api = {
    select: () => api,
    gte: () => api,
    order: () => api,
    range: (from: number, to: number) => {
      ranges.push([from, to]);
      return api;
    },
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
      const [from, to] = ranges[ranges.length - 1]!;
      if (opts.failOnPage === ranges.length - 1)
        return Promise.resolve({ data: null, error: { message: "ledger unreadable" } }).then(
          resolve,
        );
      const rows = [];
      for (let i = from; i <= to && i < total; i++)
        rows.push({
          order_id: `o${i}`,
          order_item_id: null,
          amount_cents: 1,
          tender: i % 2 === 0 ? "cash" : "card",
          created_at: new Date(Date.UTC(2026, 8, 16, 0, 0, 0, 0) + i * 1000).toISOString(),
        });
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
    ranges,
  };
  return { from: () => api, ranges };
}

describe("readLedgerSince — the read is COMPLETE or it is null", () => {
  it("keeps asking until a page comes back short: 1500 rows, not the first 1000", async () => {
    const db = fakeDb(1500);
    const rows = await readLedgerSince(db as never, "2026-09-16T00:00:00.000Z");
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(1500);
    // Two asks: a full page, then a short one that ends it. A single-page read would have stopped
    // at 1000 with nothing to say it was partial.
    expect(db.ranges.length).toBe(2);
    expect(db.ranges[0]).toEqual([0, 999]);
    expect(db.ranges[1]).toEqual([1000, 1999]);
  });

  it("answers null when a LATER page fails — never the rows it happened to get first", async () => {
    // A partial answer is the defect, so a failure mid-read must not degrade into "here is some of
    // the day". The drawer would net a subset of the hand-backs and call it the till.
    const db = fakeDb(1500, { failOnPage: 1 });
    expect(await readLedgerSince(db as never, "2026-09-16T00:00:00.000Z")).toBeNull();
  });

  it("an exactly-full single page still asks again — the cap and a real boundary look identical", async () => {
    const db = fakeDb(1000);
    const rows = await readLedgerSince(db as never, "2026-09-16T00:00:00.000Z");
    expect(rows!.length).toBe(1000);
    expect(db.ranges.length).toBe(2); // the second page comes back empty and ends it
  });
});
