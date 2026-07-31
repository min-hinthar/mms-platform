import { describe, expect, it } from "vitest";
import { allocate, computeShares, deriveShareBreakdowns } from "./split-math";

/**
 * W8c — split allocation.
 *
 * Why this matters beyond arithmetic: `mms_fulfill_split_order` HARD-RAISES when the captured shares
 * don't sum to the expected total, so an `allocate` rounding regression doesn't just mis-bill — it
 * makes a table that has already paid impossible to fulfil.
 *
 * Every expected value below is either a hand-computed literal or a structural property of the
 * output. Nothing re-implements the formula.
 */

const SEATS = [
  { seat: "a", name: "Aye" },
  { seat: "b", name: "Bo" },
  { seat: "c", name: "Cho" },
  { seat: "d", name: "Dee" },
];

describe("allocate — the sum invariant that fulfillment depends on", () => {
  it("sums EXACTLY to the total across a deterministic sweep of totals and weights", () => {
    let seed = 20260731;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < 5000; t++) {
      const n = 1 + Math.floor(rnd() * 8);
      // Weights are NOT always integers: `deriveShareBreakdowns` builds them as
      // `owned + unassigned / n`, which is a repeating decimal for n = 3, 6, 7. Fractional weights
      // are the realistic case, so the sweep includes them.
      const weights = Array.from({ length: n }, () =>
        rnd() < 0.25 ? 0 : Math.floor(rnd() * 5000) + (rnd() < 0.4 ? rnd() : 0),
      );
      const total = Math.floor(rnd() * 50000);
      const out = allocate(total, weights);
      expect(out).toHaveLength(n);
      expect(out.reduce((a, b) => a + b, 0)).toBe(total);
      for (const v of out) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is deterministic — the same inputs always produce the same split", () => {
    // Leftover pennies go to the largest fractional part, ties to the lower index. A
    // non-deterministic tiebreak would make two reads of the same cart disagree.
    for (let i = 0; i < 5; i++) expect(allocate(100, [1, 2, 3])).toEqual([17, 33, 50]);
  });

  it("hand-computed: 100¢ over weights [1,2,3] → [17,33,50]", () => {
    // exact = [16.66…, 33.33…, 50] → floors [16,33,50] = 99, leftover 1 → largest frac (0.66, index 0)
    expect(allocate(100, [1, 2, 3])).toEqual([17, 33, 50]);
  });

  it("hand-computed: an indivisible total gives the remainder to the earliest seats", () => {
    // 10¢ over 3 equal seats: exact 3.33… each → floors [3,3,3] = 9, leftover 1 → index 0.
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    // 1¢ over 5 seats: one seat pays it, the rest pay nothing — still sums to 1.
    expect(allocate(1, [1, 1, 1, 1, 1])).toEqual([1, 0, 0, 0, 0]);
  });

  it("falls back to an EVEN split when every weight is zero", () => {
    // Reachable when nobody has been assigned a line yet, or on a $0 cart.
    expect(allocate(100, [0, 0, 0])).toEqual([34, 33, 33]);
    expect(allocate(100, [0, 0, 0]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("gives a zero-weight seat nothing when others have weight", () => {
    // A seat who ordered nothing must not receive a leftover penny.
    expect(allocate(100, [0, 1, 1])).toEqual([0, 50, 50]);
    expect(allocate(101, [0, 1, 1])).toEqual([0, 51, 50]);
  });

  it("M24 (known-open) — allocate(total, []) silently DROPS the whole total", () => {
    // PINNED, NOT FIXED. Excluded from the sum property above because it genuinely violates it.
    // Reachable: `split.ts` swallows the `session_members` PostgREST error, so a failed read yields
    // `seats = []` → no share rows → the cart stays frozen by `acquireSettlement` with nothing to
    // capture. A permanently stuck table. See OPEN-ITEMS M24 — the fix belongs at the caller (handle
    // the read error), not here.
    expect(allocate(100, [])).toEqual([]);
    expect(allocate(100, []).reduce((a, b) => a + b, 0)).toBe(0); // ← the dropped total
  });
});

describe("computeShares — the optimistic display split", () => {
  it("reconciles to the grand total in even mode", () => {
    const shares = computeShares(8885, SEATS, [], "even");
    expect(shares.map((s) => s.shareCents)).toEqual([2222, 2221, 2221, 2221]);
    expect(shares.reduce((a, s) => a + s.shareCents, 0)).toBe(8885);
  });

  it("returns nothing when there are no members", () => {
    expect(computeShares(1000, [], [], "by_person")).toEqual([]);
  });

  it("folds an unassigned line onto the FIRST seat rather than dropping it", () => {
    // by-person with one 1000¢ line owned by nobody: seat A carries the whole weight.
    const shares = computeShares(
      1000,
      SEATS.slice(0, 2),
      [{ bySeat: null, qty: 1, unitPriceCents: 1000 }],
      "by_person",
    );
    expect(shares.map((s) => s.shareCents)).toEqual([1000, 0]);
    expect(shares.reduce((a, s) => a + s.shareCents, 0)).toBe(1000);
  });
});

describe("deriveShareBreakdowns — the authoritative per-seat charge", () => {
  it("allocates each component with its OWN weight, and Σ base === the cart total", () => {
    // Grand: subtotal 8000, no discount, service 300, tax 585 → total 8885.
    const grand = {
      subtotalCents: 8000,
      discountCents: 0,
      serviceChargeCents: 300,
      taxCents: 585,
    };
    const out = deriveShareBreakdowns(grand, SEATS, LINES_J14, "by_person");
    expect(out.reduce((a, s) => a + s.baseCents, 0)).toBe(8885);
    expect(out.reduce((a, s) => a + s.subtotalCents, 0)).toBe(8000);
    expect(out.reduce((a, s) => a + s.serviceChargeCents, 0)).toBe(300);
    expect(out.reduce((a, s) => a + s.taxCents, 0)).toBe(585);
  });

  it("charges a seat tax on THEIR OWN taxable base, not a pro-rata of the aggregate", () => {
    // This is the whole reason `deriveShareBreakdowns` exists separately from `computeShares`.
    // Seat A owns only an exempt grocery line → 0 tax. B/C/D own taxable lines → 195 each.
    const grand = {
      subtotalCents: 8000,
      discountCents: 0,
      serviceChargeCents: 300,
      taxCents: 585,
    };
    const out = deriveShareBreakdowns(grand, SEATS, LINES_J14, "by_person");
    expect(out.map((s) => s.taxCents)).toEqual([0, 195, 195, 195]);
  });

  it("returns nothing when there are no seats", () => {
    expect(
      deriveShareBreakdowns(
        { subtotalCents: 100, discountCents: 0, serviceChargeCents: 0, taxCents: 0 },
        [],
        [],
        "even",
      ),
    ).toEqual([]);
  });
});

/**
 * The J14 basket: 4 seats, seat A owns a 2000¢ EXEMPT grocery line, B/C/D each own a 2000¢ taxable
 * dine-in line. Declared ONCE and passed to both functions — `computeShares` takes a narrower line
 * type, so an inline literal carrying `taxCents` would trip TS's excess-property check.
 */
const LINES_J14 = [
  { bySeat: "a", qty: 1, unitPriceCents: 2000, taxCents: 0 },
  { bySeat: "b", qty: 1, unitPriceCents: 2000, taxCents: 195 },
  { bySeat: "c", qty: 1, unitPriceCents: 2000, taxCents: 195 },
  { bySeat: "d", qty: 1, unitPriceCents: 2000, taxCents: 195 },
];

describe("J14 (known-open) — the preview diverges from what is actually charged", () => {
  it("shows [2222,2221,2221,2221] but charges [2075,2270,2270,2270]", () => {
    // PINNED, NOT FIXED. The table decides on the PREVIEW (`computeShares`, which weights each seat
    // by line subtotal and lets the aggregate tax ride along pro-rata) and is then asked to authorize
    // the CHARGE (`deriveShareBreakdowns`, which taxes each seat's own taxable base). On this basket
    // the exempt-only seat A is previewed 2222¢ and charged 2075¢ — 147¢ less — while B/C/D are each
    // charged 49¢ MORE than shown.
    //
    // Both sums are exactly 8885, so nothing reconciles wrong; the numbers on screen are simply not
    // the numbers on the card. Deliberately not fixed here: the correction visibly moves every
    // existing even split by 1–2¢, and W8 is the harness that makes that change safe to attempt.
    // See OPEN-ITEMS J14.
    const grand = {
      subtotalCents: 8000,
      discountCents: 0,
      serviceChargeCents: 300,
      taxCents: 585,
    };
    const total = 8885;

    const preview = computeShares(
      total,
      SEATS,
      LINES_J14.map(({ bySeat, qty, unitPriceCents }) => ({ bySeat, qty, unitPriceCents })),
      "by_person",
    ).map((s) => s.shareCents);
    const charged = deriveShareBreakdowns(grand, SEATS, LINES_J14, "by_person").map(
      (s) => s.baseCents,
    );

    expect(preview).toEqual([2222, 2221, 2221, 2221]);
    expect(charged).toEqual([2075, 2270, 2270, 2270]);
    expect(preview.reduce((a, b) => a + b, 0)).toBe(total);
    expect(charged.reduce((a, b) => a + b, 0)).toBe(total);
    // The gap, stated so the pin is legible at a glance.
    expect(preview[0]! - charged[0]!).toBe(147);
    expect(charged[1]! - preview[1]!).toBe(49);
  });
});

describe("M23 (known-open) — a grocery-only seat is billed the restaurant service charge", () => {
  it("allocates SB-1524 service to a seat whose lines owe none", () => {
    // PINNED, NOT FIXED. `getCartTotals` excludes grocery lines from the service base (W1a) because
    // the disclosed "supports fair kitchen wages" copy would be false on self-scanned retail. The
    // split path re-implements the allocation and cannot apply that rule: `deriveShareBreakdowns`
    // spreads the service charge pro-rata to every seat's NET, and its `lines` type has no
    // `fulfillment` field at all — so seat A, who bought only groceries, is billed 75¢ of it.
    // Sums still reconcile, which is exactly why nothing has ever caught this. See OPEN-ITEMS M23.
    const grand = {
      subtotalCents: 8000,
      discountCents: 0,
      serviceChargeCents: 300,
      taxCents: 585,
    };
    const out = deriveShareBreakdowns(grand, SEATS, LINES_J14, "by_person");
    expect(out[0]!.serviceChargeCents).toBe(75);
    expect(out[0]!.taxCents).toBe(0); // tax IS correctly excluded — only service leaks
    expect(out[0]!.baseCents).toBe(2075);
  });
});
