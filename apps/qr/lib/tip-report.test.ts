import { describe, expect, it } from "vitest";
import { summarizeTips, type TipOrderRow } from "./tip-report";

/**
 * W17c-4 — the rules that keep a tip report honest. The whole design rests on one distinction the
 * data actually supports: `settled_by` is stamped when a STAFF member took the money, and null when
 * the guest paid on their own phone. Blending those would credit a person for money nobody handed
 * them; inventing a split would look exactly like a policy the owner had agreed to.
 */

const row = (o: Partial<TipOrderRow> = {}): TipOrderRow => ({
  settled_by: "staff-a",
  tip_cents: 500,
  status: "paid",
  tender: "cash",
  ...o,
});

describe("summarizeTips — attributed and shared are never blended", () => {
  it("credits each staff member with what they were handed", () => {
    const r = summarizeTips([
      row({ settled_by: "staff-a", tip_cents: 500 }),
      row({ settled_by: "staff-a", tip_cents: 300 }),
      row({ settled_by: "staff-b", tip_cents: 1000 }),
    ]);
    expect(r.attributed).toEqual([
      { staffId: "staff-b", tipCents: 1000, orderCount: 1 },
      { staffId: "staff-a", tipCents: 800, orderCount: 2 },
    ]);
    expect(r.unattributedCents).toBe(0);
    expect(r.totalCents).toBe(1800);
  });

  it("a guest who paid on their own phone credits NOBODY", () => {
    // settled_by is null because no staff member took anything: there is no one to credit, and
    // guessing would put another person's money in someone's column.
    const r = summarizeTips([
      row({ settled_by: null, tip_cents: 700 }),
      row({ settled_by: "staff-a", tip_cents: 500 }),
    ]);
    expect(r.attributed).toEqual([{ staffId: "staff-a", tipCents: 500, orderCount: 1 }]);
    expect(r.unattributedCents).toBe(700);
    expect(r.unattributedCount).toBe(1);
    // The total spans both buckets — it is the only figure that answers "what did we take in tips".
    expect(r.totalCents).toBe(1200);
  });

  it("a REFUNDED order's tip is in nobody's pocket", () => {
    const r = summarizeTips([
      row({ status: "refunded", tip_cents: 900 }),
      row({ status: "refunded", settled_by: null, tip_cents: 400 }),
      row({ tip_cents: 500 }),
    ]);
    expect(r.totalCents).toBe(500);
    expect(r.unattributedCents).toBe(0);
    expect(r.attributed).toEqual([{ staffId: "staff-a", tipCents: 500, orderCount: 1 }]);
  });

  it("only PAID counts — a pending or failed order is not money anyone has", () => {
    const r = summarizeTips([
      row({ status: "pending", tip_cents: 900 }),
      row({ status: "failed", tip_cents: 900 }),
    ]);
    expect(r.totalCents).toBe(0);
    expect(r.attributed).toEqual([]);
  });

  it("a zero or null tip is not a tipped order — 'orders' means guests who actually tipped", () => {
    const r = summarizeTips([
      row({ tip_cents: 0 }),
      row({ tip_cents: null }),
      row({ tip_cents: 500 }),
    ]);
    expect(r.attributed).toEqual([{ staffId: "staff-a", tipCents: 500, orderCount: 1 }]);
  });

  it("a negative tip cannot inflate anyone (belt — the DB CHECK is the strap)", () => {
    // qr_orders_tip_cents_nonneg makes this unreachable through the app; if it ever appears in the
    // data it must not silently REDUCE someone's column below what they were handed.
    const r = summarizeTips([row({ tip_cents: -500 }), row({ tip_cents: 500 })]);
    expect(r.attributed).toEqual([{ staffId: "staff-a", tipCents: 500, orderCount: 1 }]);
    expect(r.totalCents).toBe(500);
  });

  it("the order is stable — by amount, then by id, never by map insertion", () => {
    // A report that reshuffles between reloads reads as if the numbers changed.
    const rows = [
      row({ settled_by: "staff-c", tip_cents: 500 }),
      row({ settled_by: "staff-a", tip_cents: 500 }),
      row({ settled_by: "staff-b", tip_cents: 500 }),
    ];
    expect(summarizeTips(rows).attributed.map((a) => a.staffId)).toEqual([
      "staff-a",
      "staff-b",
      "staff-c",
    ]);
    expect(summarizeTips([...rows].reverse()).attributed.map((a) => a.staffId)).toEqual([
      "staff-a",
      "staff-b",
      "staff-c",
    ]);
  });

  it("an empty day is an empty report, not a division by zero", () => {
    expect(summarizeTips([])).toEqual({
      attributed: [],
      unattributedCents: 0,
      unattributedCount: 0,
      totalCents: 0,
    });
  });
});
