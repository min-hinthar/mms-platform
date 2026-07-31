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

/**
 * mulberry32 — a real PRNG. The obvious `seed * 1103515245 % 2^31` LCG is WRONG in JS: the product
 * reaches ~2.4e18, far past `Number.MAX_SAFE_INTEGER` (9.0e15), so the low bits are lost to double
 * rounding and the generator degenerates — measured, it yields **374 distinct values in 5,000 draws**
 * and short-cycles. Every arithmetic step below stays inside 32 bits (`Math.imul`, `>>> 0`).
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEATS = [
  { seat: "a", name: "Aye" },
  { seat: "b", name: "Bo" },
  { seat: "c", name: "Cho" },
  { seat: "d", name: "Dee" },
];

describe("allocate — the sum invariant that fulfillment depends on", () => {
  it("sums EXACTLY to the total across a deterministic sweep of totals and weights", () => {
    const rnd = mulberry32(20260731);
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

describe("deriveShareBreakdowns — the limbs that write real per-card money", () => {
  // GRAND with a DISCOUNT. The discount limb feeds `baseCents` (what each card is charged) AND `net`
  // (which weights the service allocation), and every fixture above leaves it at 0 — so deleting the
  // allocation outright was invisible. Hand-computed below.
  const GRAND_DISC = {
    subtotalCents: 8000,
    discountCents: 1000,
    serviceChargeCents: 350,
    taxCents: 500,
  };

  it("allocates the DISCOUNT pro-rata to each seat's subtotal", () => {
    // by-person, 4 seats each owning 2000¢ → subtotal allocation [2000,2000,2000,2000].
    // discount 1000 over equal weights → exact 250 each → [250,250,250,250].
    const out = deriveShareBreakdowns(GRAND_DISC, SEATS, LINES_J14, "by_person");
    expect(out.map((s) => s.discountCents)).toEqual([250, 250, 250, 250]);
    expect(out.reduce((a, s) => a + s.discountCents, 0)).toBe(1000);
  });

  it("gives a $0-subtotal seat NO discount and NO service", () => {
    // Seat D owns nothing. Weights [2000,2000,2000,0] → subtotal allocates 8000 as [2667,2667,2666,0].
    // The discount is pro-rata to that ALLOCATED subtotal, not to the weights: exact
    // [1000×2667/8000, 1000×2667/8000, 1000×2666/8000, 0] = [333.375, 333.375, 333.25, 0]
    // → floors [333,333,333,0] = 999, leftover 1 → largest frac (0.375, index 0) → [334,333,333,0].
    const lines = LINES_J14.filter((l) => l.bySeat !== "d");
    const out = deriveShareBreakdowns(GRAND_DISC, SEATS, lines, "by_person");
    expect(out[3]!.subtotalCents).toBe(0);
    expect(out[3]!.discountCents).toBe(0);
    expect(out[3]!.serviceChargeCents).toBe(0);
    expect(out.map((s) => s.discountCents)).toEqual([334, 333, 333, 0]);
  });

  it("EVEN mode splits equally even when ownership is LOPSIDED", () => {
    // ⚠️ The ownership must be UNEQUAL or this test proves nothing: with 4 seats each owning 2000¢,
    // the by-person weights are already equal, so a mutant that ignores `even` and uses by-person
    // weights produces identical output. (Verified — that mutant passed the first draft.)
    // Here seat A owns 3000¢ and B/C own 1000¢ each, so the two modes genuinely diverge:
    //   even       → subtotal 5000 split 3 ways: exact 1666.67 → [1667,1667,1666]
    //   by-person  → would be [3000,1000,1000]
    // service 300 over nets [1667,1667,1666] → exact [100.02, 100.02, 99.96] → floors [100,100,99]
    // = 299, leftover 1 → largest frac (0.96, index 2) → [100,100,100]. (NOT "equal nets, exact
    // 100 each" — the nets differ by a cent and the penny is what closes the gap.)
    const lopsided = [
      { bySeat: "a", qty: 3, unitPriceCents: 1000, taxCents: 0 },
      { bySeat: "b", qty: 1, unitPriceCents: 1000, taxCents: 0 },
      { bySeat: "c", qty: 1, unitPriceCents: 1000, taxCents: 0 },
    ];
    const out = deriveShareBreakdowns(
      { subtotalCents: 5000, discountCents: 0, serviceChargeCents: 300, taxCents: 0 },
      SEATS.slice(0, 3),
      lopsided,
      "even",
    );
    expect(out.map((s) => s.subtotalCents)).toEqual([1667, 1667, 1666]);
    expect(out.map((s) => s.subtotalCents)).not.toEqual([3000, 1000, 1000]); // the by-person mutant
    expect(out.map((s) => s.serviceChargeCents)).toEqual([100, 100, 100]);
  });

  it("SPREADS an unassigned line across seats rather than dropping it", () => {
    // ⚠️ The fixture must MIX owned and unassigned lines. With only an unassigned line, dropping it
    // zeroes every weight and `allocate` falls back to an even split — producing the same answer as
    // spreading it, so the mutant passes. (Verified against the first draft.)
    // Here seat A owns 3000¢ and a 3000¢ line is unowned, across 3 seats:
    //   correct: weights [3000+1000, 1000, 1000] = [4000,1000,1000] → subtotal [4000,1000,1000]
    //   mutant (drops unassigned): weights [3000,0,0] → [6000,0,0]
    const out = deriveShareBreakdowns(
      { subtotalCents: 6000, discountCents: 0, serviceChargeCents: 0, taxCents: 0 },
      SEATS.slice(0, 3),
      [
        { bySeat: "a", qty: 1, unitPriceCents: 3000, taxCents: 0 },
        { bySeat: null, qty: 1, unitPriceCents: 3000, taxCents: 0 },
      ],
      "by_person",
    );
    expect(out.map((s) => s.subtotalCents)).toEqual([4000, 1000, 1000]);
    expect(out.map((s) => s.subtotalCents)).not.toEqual([6000, 0, 0]); // the drop mutant
    expect(out.reduce((a, s) => a + s.subtotalCents, 0)).toBe(6000);
  });

  it("weights SERVICE by NET (subtotal − discount), not by raw subtotal", () => {
    // ⚠️ Separating these two requires a discount whose largest-remainder allocation makes net
    // NON-proportional to subtotal — otherwise both weightings give the same answer. Found by
    // search: subtotals [5500,4500], discount 1234, service 450.
    //   discount 1234 pro-rata to subtotal → exact [678.7, 555.3] → floors [678,555] = 1233,
    //     leftover 1 → larger frac (0.7, index 0) → [679,555]
    //   net = [5500−679, 4500−555] = [4821, 3945]  (sum 8766)
    //   service 450 over NET → exact [450×4821/8766, 450×3945/8766] = [247.4846…, 202.5154…]
    //     → floors [247,202] = 449, leftover 1 → larger frac (0.5154, index 1) → [247,203]
    //   the mutant (weighting by subtotal) gives [248,202]
    const out = deriveShareBreakdowns(
      { subtotalCents: 10000, discountCents: 1234, serviceChargeCents: 450, taxCents: 0 },
      SEATS.slice(0, 2),
      [
        { bySeat: "a", qty: 1, unitPriceCents: 5500, taxCents: 0 },
        { bySeat: "b", qty: 1, unitPriceCents: 4500, taxCents: 0 },
      ],
      "by_person",
    );
    expect(out.map((s) => s.subtotalCents)).toEqual([5500, 4500]);
    expect(out.map((s) => s.discountCents)).toEqual([679, 555]);
    expect(out.map((s) => s.serviceChargeCents)).toEqual([247, 203]);
    expect(out.map((s) => s.serviceChargeCents)).not.toEqual([248, 202]); // the by-subtotal mutant
  });

  it("Σ baseCents === the cart total even with a discount in play", () => {
    const out = deriveShareBreakdowns(GRAND_DISC, SEATS, LINES_J14, "by_person");
    // 8000 − 1000 + 350 + 500 = 7850
    expect(out.reduce((a, s) => a + s.baseCents, 0)).toBe(7850);
  });
});

/**
 * M23 pin, COMPILE-TIME half. `deriveShareBreakdowns`' line type has no `fulfillment` field, so it
 * structurally cannot apply W1a's grocery exclusion. `Pick<…, "fulfillment">` is an error today; the
 * `@ts-expect-error` asserts that error EXISTS. Add the field — required *or* optional, and optional is
 * the likelier real fix since it doesn't break `split.ts`'s call sites — and the error disappears, the
 * directive becomes unused, and typecheck fails, forcing this pin to be revisited.
 *
 * (An earlier draft asserted `Object.keys(probe)).not.toContain("fulfillment")` on an object the test
 * itself built — a runtime tautology that could never fail, i.e. the exact defect this slice removes.)
 */
type SplitLine = Parameters<typeof deriveShareBreakdowns>[2][number];
// @ts-expect-error — M23: no `fulfillment` on the split line type. See the note above.
type _M23FulfillmentAbsent = Pick<SplitLine, "fulfillment">;

describe("M23 (known-open) — the split path CANNOT apply W1a's grocery exclusion", () => {
  it("has no `fulfillment` field to exclude on, so service reaches every seat with net > 0", () => {
    // PINNED, NOT FIXED — and stated STRUCTURALLY, because that is the actual defect. An earlier
    // draft of this pin asserted "seat A is billed 75¢ of service", which was green for the wrong
    // reason: `deriveShareBreakdowns`'s `lines` type has no `fulfillment` field at all (split-math.ts:99),
    // so nothing in the fixture ever marked seat A as a grocery buyer — the 75¢ was just "service
    // pro-rata to net", true for any seat, and the pin would have stayed green after M23 was fixed.
    //
    // The real content of M23: `getCartTotals` excludes grocery lines from the service base (W1a,
    // because the disclosed "supports fair kitchen wages" copy is false on self-scanned retail), and
    // the split path re-implements the allocation over a line type that cannot express that. So a
    // grocery-only seat is billed part of a charge their lines do not owe. Sums still reconcile,
    // which is why nothing has ever caught it.
    //
    // This assertion is a TYPE-LEVEL statement of the gap: if a `fulfillment` field is ever added to
    // the split line type (the fix), this line stops compiling and the pin must be revisited.

    // And behaviourally: every seat with net > 0 receives service, including one whose only line is
    // tax-exempt (the closest the type can come to representing a grocery buyer).
    const out = deriveShareBreakdowns(
      { subtotalCents: 8000, discountCents: 0, serviceChargeCents: 300, taxCents: 585 },
      SEATS,
      LINES_J14,
      "by_person",
    );
    expect(out[0]!.taxCents).toBe(0); // tax IS correctly excluded for an exempt seat …
    expect(out.map((x) => x.serviceChargeCents)).toEqual([75, 75, 75, 75]); // … service is not
  });
});
