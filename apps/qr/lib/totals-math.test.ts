import { describe, expect, it } from "vitest";
import { computeTotals, type TotalsLine } from "./totals-math";

/**
 * W8a — the charge invariants.
 *
 * **Every expected integer below is hand-computed from the arithmetic and written as a literal.**
 * Nothing here calls the implementation to produce an expectation, compares one `computeTotals` call
 * to another, or snapshots. That rule is the entire point of this file: a test that re-derives the
 * formula re-asserts the formula's bugs, and W8 exists because the W5c per-part `tax_cents` change
 * looked correct in review and silently over-charged.
 *
 * The extraction this file guards was separately proven behaviour-preserving by differential-testing
 * the new seam against the pre-extraction arithmetic over 200,000 random baskets (0 divergences).
 */

// Fixture helper — DEFAULTS ONLY, no arithmetic. A helper that computed `taxCents` from
// `unitPriceCents` would quietly re-implement the engine inside the test.
function line(over: Partial<TotalsLine> & Pick<TotalsLine, "unitPriceCents">): TotalsLine {
  return {
    qty: 1,
    taxCents: 0,
    state: "draft",
    comped: false,
    fulfillment: "dinein",
    ...over,
  };
}

// `taxCents` is a PER-UNIT figure everywhere in the app and is read only as a boolean `> 0` flag.
// 1¢ is used as the "this line is taxable" marker so no fixture implies a real per-line tax.
const TAXABLE = 1;

describe("invariant 1 — voided and comped lines are excluded from every base", () => {
  it("charges only the live lines", () => {
    // Live:   2000¢ dine-in taxable (1 × 2000)
    // Voided: 5000¢ — excluded
    // Comped: 3000¢ — excluded
    // subtotal 2000 · no discount · taxable base 2000 · tax round(2000 × 0.0975) = round(195) = 195
    // service base 2000 → round(2000 × 0.05) = 100 · tip 20% → round(2000 × 0.2) = 400
    // total = 2000 + 100 + 195 + 400 = 2695
    const totals = computeTotals(
      [
        line({ unitPriceCents: 2000, taxCents: TAXABLE }),
        line({ unitPriceCents: 5000, taxCents: TAXABLE, state: "voided" }),
        line({ unitPriceCents: 3000, taxCents: TAXABLE, comped: true }),
      ],
      0,
      0,
      0.2,
    );
    expect(totals).toEqual({
      subtotalCents: 2000,
      discountCents: 0,
      rewardCents: 0,
      serviceChargeCents: 100,
      taxCents: 195,
      tipCents: 400,
      totalCents: 2695,
    });
  });

  it("charges fired, in-progress and served lines — only `voided` is excluded", () => {
    // Guards against a future "only draft is chargeable" tightening: the food exists once it fires.
    // 3 × 1000¢, all non-draft states, no tax flag → subtotal 3000, tax 0,
    // service round(3000 × 0.05) = 150, tip 0 → total 3150.
    const totals = computeTotals(
      [
        line({ unitPriceCents: 1000, state: "fired" }),
        line({ unitPriceCents: 1000, state: "in_progress" }),
        line({ unitPriceCents: 1000, state: "served" }),
      ],
      0,
      0,
      0,
    );
    expect(totals.subtotalCents).toBe(3000);
    expect(totals.serviceChargeCents).toBe(150);
    expect(totals.totalCents).toBe(3150);
  });

  it("returns an all-zero breakdown for an empty cart without dividing by zero", () => {
    expect(computeTotals([], 500, 500, 0.2)).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      rewardCents: 0,
      serviceChargeCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 0,
    });
  });
});

describe("invariant 2 — the discount clamp ORDER", () => {
  it("CASE A: promo alone clamps to the subtotal, never past it", () => {
    // subtotal 1000, promo 4000 → promo clamps to 1000; reward 0.
    // net 0 · taxable base 1000, discOnTaxable = round(1000 × (1000/1000)) = 1000 → tax round(0) = 0
    // service base 1000, discOnService = 1000 → round(0 × 0.05) = 0 · tip round(0 × 0.2) = 0
    const totals = computeTotals([line({ unitPriceCents: 1000, taxCents: TAXABLE })], 4000, 0, 0.2);
    expect(totals).toEqual({
      subtotalCents: 1000,
      discountCents: 1000,
      rewardCents: 0,
      serviceChargeCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 0,
    });
  });

  it("CASE B (M22 pin) — the reward clamps to what remains AFTER the promo", () => {
    // ORDER MATTERS. subtotal 1000, promo 600 → remaining 400. Reward 900 clamps to 400.
    // If the two clamped independently against the subtotal, the discount would be 600 + 900 = 1500
    // and the total would go NEGATIVE.
    const totals = computeTotals(
      [line({ unitPriceCents: 1000, taxCents: TAXABLE })],
      600,
      900,
      0.2,
    );
    expect(totals.rewardCents).toBe(400);
    expect(totals.discountCents).toBe(1000);
    expect(totals.totalCents).toBe(0);

    // ⚠️ PINNED DEFECT — OPEN-ITEMS **M22**. The clamp is right; the coupon lifecycle is not.
    // `mms_redeem_cart_reward` flips `redeemed_at` unconditionally, so 500¢ of a 900¢ coupon is
    // destroyed here while the coupon is consumed in full. When M22 is fixed (by refusing/deferring
    // the redemption rather than by changing this clamp), `rewardCents` stays 400 and the coupon
    // survives — so this assertion should NOT need to change. It is here to make the discarded
    // residual visible in a test name.
    expect(rewardResidual(900, totals.rewardCents)).toBe(500);
  });

  it("never lets the combined discount drive a negative total, across the boundary", () => {
    for (const [promo, reward] of [
      [0, 0],
      [999, 0],
      [1000, 0],
      [1001, 0],
      [500, 500],
      [500, 501],
      [0, 5000],
      [5000, 5000],
    ]) {
      const t = computeTotals(
        [line({ unitPriceCents: 1000, taxCents: TAXABLE })],
        promo!,
        reward!,
        0.2,
      );
      expect(t.discountCents).toBeLessThanOrEqual(t.subtotalCents);
      expect(t.totalCents).toBeGreaterThanOrEqual(0);
    }
  });
});

/** How much reward value the clamp discarded. Not part of the engine — a readable name for the pin. */
function rewardResidual(couponCents: number, appliedCents: number): number {
  return couponCents - appliedCents;
}

describe("invariant 3 — tax is on the DISCOUNTED TAXABLE base, pro-rated by taxable share", () => {
  it("mixed taxable/exempt + a flat promo (the case a pro-rata-of-aggregate bug breaks)", () => {
    // Basket: taxable 1000¢ × 1 (dine-in) + exempt 2333¢ × 1 (grocery). subtotal = 3333.
    // Flat promo 1000, no reward → discountCents 1000, net 2333.
    // taxableBase 1000. discOnTaxable = round(1000 × (1000/3333)) = round(300.03…) = 300.
    // tax = round((1000 − 300) × 0.0975) = round(700 × 0.0975) = round(68.25) = 68.
    //
    // THE DISCRIMINATORS — this fixture is chosen so three plausible-but-wrong implementations each
    // produce a DIFFERENT number, so the test can actually tell them apart:
    //   • correct (discount pro-rated onto the taxable base)      → 68
    //   • whole discount taken off the taxable base (1000−1000=0) → 0
    //   • tax on the undiscounted taxable base (1000 × 0.0975)    → 98
    // service base = 1000 (grocery excluded). discOnService = round(1000 × (1000/3333)) = 300.
    // service = round((1000 − 300) × 0.05) = round(35) = 35.
    // tip 18% of net → round(2333 × 0.18) = round(419.94) = 420.
    // total = 2333 + 35 + 68 + 420 = 2856.
    const totals = computeTotals(
      [
        line({ unitPriceCents: 1000, taxCents: TAXABLE, fulfillment: "dinein" }),
        line({ unitPriceCents: 2333, taxCents: 0, fulfillment: "grocery" }),
      ],
      1000,
      0,
      0.18,
    );
    expect(totals).toEqual({
      subtotalCents: 3333,
      discountCents: 1000,
      rewardCents: 0,
      serviceChargeCents: 35,
      taxCents: 68,
      tipCents: 420,
      totalCents: 2856,
    });
    // State the discriminators as assertions so a regression can't quietly land on one of them.
    expect(totals.taxCents).not.toBe(0);
    expect(totals.taxCents).not.toBe(98);
  });

  it("rounds the pro-rata to whole cents BEFORE subtracting it from the base", () => {
    // A mutation escape found by mutation-testing this suite: `Math.round(d * (t/s))` (correct) and
    // `Math.round(d * t) / s` (the transposed-paren bug, which leaves a FRACTIONAL discount) agree on
    // most baskets, so none of the fixtures above could tell them apart. This one can.
    //   taxable 100¢ dine-in + exempt 1395¢ grocery → subtotal 1495, promo 500, net 995.
    //   correct: discOnTaxable = round(500 × (100/1495)) = round(33.44…) = 33
    //            tax = round((100 − 33) × 0.0975) = round(6.5325) = 7
    //   mutant:  discOnTaxable = round(500 × 100)/1495 = 50000/1495 = 33.444…  (never rounded)
    //            tax = round((100 − 33.444…) × 0.0975) = round(6.4892) = 6
    //   service base = 100 → discOnService = 33 → round((100 − 33) × 0.05) = round(3.35) = 3
    //   total = 995 + 3 + 7 = 1005
    const totals = computeTotals(
      [
        line({ unitPriceCents: 100, taxCents: TAXABLE, fulfillment: "dinein" }),
        line({ unitPriceCents: 1395, taxCents: 0, fulfillment: "grocery" }),
      ],
      500,
      0,
      0,
    );
    expect(totals.taxCents).toBe(7);
    expect(totals.taxCents).not.toBe(6); // the transposed-paren mutant
    expect(totals.serviceChargeCents).toBe(3);
    expect(totals.totalCents).toBe(1005);
  });

  it("taxes nothing when every line is exempt, however large the basket", () => {
    const totals = computeTotals(
      [line({ unitPriceCents: 50000, taxCents: 0, fulfillment: "grocery" })],
      0,
      0,
      0,
    );
    expect(totals.taxCents).toBe(0);
  });
});

describe("invariant 4 — the service base EXCLUDES grocery, with its OWN pro-rata", () => {
  it("does not charge SB-1524 service on retail lines", () => {
    // 4000¢ grocery only → service base 0 → service 0. (The disclosed "supports fair kitchen wages"
    // copy would be false on a self-scanned bag of rice.)
    const totals = computeTotals(
      [line({ unitPriceCents: 4000, taxCents: 0, fulfillment: "grocery" })],
      0,
      0,
      0,
    );
    expect(totals.serviceChargeCents).toBe(0);
  });

  it("uses a service pro-rata INDEPENDENT of the tax pro-rata", () => {
    // The regression this guards is a DRY refactor that shares one `discOn…` variable.
    // Basket: dine-in taxable 4550¢ (service base AND taxable base) + grocery exempt 2000¢.
    // subtotal 6550. Promo 1000 → net 5550.
    //   taxable base   = 4550 → discOnTaxable = round(1000 × (4550/6550)) = round(694.65…) = 695
    //                    tax = round((4550 − 695) × 0.0975) = round(3855 × 0.0975)
    //                        = round(375.86…) = 376
    //   service base   = 4550 → discOnService = 695 (same here BY COINCIDENCE of this basket)
    //                    service = round((4550 − 695) × 0.05) = round(192.75) = 193
    // tip 0. total = 5550 + 193 + 376 = 6119.
    const totals = computeTotals(
      [
        line({ unitPriceCents: 4550, taxCents: TAXABLE, fulfillment: "dinein" }),
        line({ unitPriceCents: 2000, taxCents: 0, fulfillment: "grocery" }),
      ],
      1000,
      0,
      0,
    );
    expect(totals).toEqual({
      subtotalCents: 6550,
      discountCents: 1000,
      rewardCents: 0,
      serviceChargeCents: 193,
      taxCents: 376,
      tipCents: 0,
      totalCents: 6119,
    });
  });

  it("separates the two bases when a line is taxable but NOT service-bearing, and vice versa", () => {
    // This is the fixture where sharing one pro-rata actually diverges:
    //   grocery line that is somehow taxable (retail non-food sold from the market shelf): 3000¢,
    //   taxable = yes, service = no.
    //   dine-in line, exempt (cold food to-go is exempt but still table service): 1000¢,
    //   taxable = no, service = yes.
    // subtotal 4000, promo 1000 → net 3000.
    //   taxable base = 3000 → discOnTaxable = round(1000 × (3000/4000)) = 750
    //                  tax = round((3000 − 750) × 0.0975) = round(219.375) = 219
    //   service base = 1000 → discOnService = round(1000 × (1000/4000)) = 250
    //                  service = round((1000 − 250) × 0.05) = round(37.5) = 38
    // If one shared pro-rata (750) were used for service: round((1000 − 750) × 0.05) = 13 — wrong.
    // tip 0. total = 3000 + 38 + 219 = 3257.
    const totals = computeTotals(
      [
        line({ unitPriceCents: 3000, taxCents: TAXABLE, fulfillment: "grocery" }),
        line({ unitPriceCents: 1000, taxCents: 0, fulfillment: "dinein" }),
      ],
      1000,
      0,
      0,
    );
    expect(totals.taxCents).toBe(219);
    expect(totals.serviceChargeCents).toBe(38);
    expect(totals.serviceChargeCents).not.toBe(13);
    expect(totals.totalCents).toBe(3257);
  });

  it("pins the 5% rate behaviourally (a restaurant-only, discount-free 10000¢ basket → 500¢)", () => {
    // Deliberately behavioural rather than a named constant: the literal has three copy-mirrors in
    // the SB-1524 disclosure strings, so introducing a shared constant is its own change.
    const totals = computeTotals([line({ unitPriceCents: 10000 })], 0, 0, 0);
    expect(totals.serviceChargeCents).toBe(500);
  });
});

describe("invariant 5 — a basket with no restaurant VALUE is never tipped", () => {
  it("forces the tip to 0 on a pure-grocery basket regardless of the rate", () => {
    for (const rate of [0.15, 0.18, 0.2, 1]) {
      const totals = computeTotals(
        [line({ unitPriceCents: 4000, taxCents: 0, fulfillment: "grocery" })],
        0,
        0,
        rate,
      );
      expect(totals.tipCents).toBe(0);
    }
  });

  it("tips on the NET (after discount), not the subtotal", () => {
    // subtotal 5000, promo 1000 → net 4000. tip 20% → round(4000 × 0.2) = 800 (not 1000).
    const totals = computeTotals([line({ unitPriceCents: 5000 })], 1000, 0, 0.2);
    expect(totals.tipCents).toBe(800);
  });

  it("M26 (known-open) — the gate is zero VALUE, not zero restaurant lines", () => {
    // A 0¢ non-grocery line leaves `serviceBaseCents === 0`, so the server force-zeros the tip while
    // the client's own `pureGrocery` flag (`every(fulfillment === 'grocery')`) says the tip selector
    // should show. The diner picks 18% and it silently vanishes. Pinned, not fixed — OPEN-ITEMS M26.
    const totals = computeTotals(
      [
        line({ unitPriceCents: 0, fulfillment: "dinein" }),
        line({ unitPriceCents: 4000, taxCents: 0, fulfillment: "grocery" }),
      ],
      0,
      0,
      0.18,
    );
    expect(totals.tipCents).toBe(0);
  });
});

describe("invariant 6 — the total identity holds in integer cents", () => {
  it("total === net + service + tax + tip over a wide deterministic sweep", () => {
    // A property, not a formula re-implementation: it asserts the RELATIONSHIP between returned
    // fields, never recomputing any of them from the inputs.
    let seed = 20260731;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const FUL = ["dinein", "togo", "grocery"] as const;

    for (let t = 0; t < 500; t++) {
      const lines: TotalsLine[] = [];
      for (let i = 0; i < Math.floor(rnd() * 5); i++) {
        lines.push(
          line({
            unitPriceCents: Math.floor(rnd() * 9999),
            qty: 1 + Math.floor(rnd() * 9),
            taxCents: rnd() < 0.5 ? 0 : TAXABLE,
            fulfillment: FUL[Math.floor(rnd() * 3)]!,
          }),
        );
      }
      const totals = computeTotals(
        lines,
        Math.floor(rnd() * 3000),
        Math.floor(rnd() * 3000),
        [0, 0.15, 0.18, 0.2][Math.floor(rnd() * 4)]!,
      );
      const net = totals.subtotalCents - totals.discountCents;
      expect(totals.totalCents).toBe(
        net + totals.serviceChargeCents + totals.taxCents + totals.tipCents,
      );
      for (const v of Object.values(totals)) expect(Number.isInteger(v)).toBe(true);
      expect(totals.totalCents).toBeGreaterThanOrEqual(0);
      expect(totals.rewardCents).toBeLessThanOrEqual(totals.discountCents);
    }
  });
});

describe("invariant 7 — quantity multiplies the base, not the rounded tax", () => {
  it("computes tax on qty × unit price, in one rounding step", () => {
    // 3 × 1250¢ = 3750 taxable base. tax = round(3750 × 0.0975) = round(365.625) = 366.
    // Rounding per unit first would give 3 × round(121.875) = 3 × 122 = 366 here — equal by luck —
    // so the M7 pin below carries the case where they actually differ.
    const totals = computeTotals(
      [line({ unitPriceCents: 1250, qty: 3, taxCents: TAXABLE })],
      0,
      0,
      0,
    );
    expect(totals.subtotalCents).toBe(3750);
    expect(totals.taxCents).toBe(366);
  });
});

describe("M6 (known-open) — a sub-6¢ taxable line reads EXEMPT", () => {
  it("collects no tax on 100 × 5¢, because tax_cents rounded to 0 at insert", () => {
    // `lineTax(5, 'hot_prepared', true)` = round(5 × 0.0975) = round(0.4875) = 0, so the line is
    // STORED with `tax_cents = 0` — and `computeTotals` reads that column only as a boolean taxable
    // flag, so the whole 500¢ base is treated as exempt.
    //   subtotal 500 · taxable base 0 → tax 0   ← the defect: should be round(500 × 0.0975) = 49
    //   service base 500 → round(500 × 0.05) = 25 · tip 0 · total 525
    // Divergence begins at qty 2 (10¢ base → 1¢ owed), not at some larger threshold.
    // The clean fix carries an `is_taxable` flag on the line instead of the rounded proxy; when it
    // lands, `taxCents` here becomes 49 and `totalCents` 574.
    const totals = computeTotals([line({ unitPriceCents: 5, qty: 100, taxCents: 0 })], 0, 0, 0);
    expect(totals).toEqual({
      subtotalCents: 500,
      discountCents: 0,
      rewardCents: 0,
      serviceChargeCents: 25,
      taxCents: 0,
      tipCents: 0,
      totalCents: 525,
    });
  });
});

describe("M7 (known-open) — aggregate tax ≠ Σ per-unit line tax", () => {
  it("differs by a cent or two from a receipt that sums per-line snapshots", () => {
    // The CHARGE is correct; only a receipt that sums the stored per-unit `tax_cents` disagrees.
    // Basket: 3 lines × qty 1 at 4470¢, all taxable dine-in. subtotal 13410.
    //   aggregate (what is charged): round(13410 × 0.0975) = round(1307.475) = 1307
    //   per-unit snapshots:          round(4470 × 0.0975) = round(435.825) = 436, × 3 = 1308
    //   Δ = 1¢
    // service = round(13410 × 0.05) = round(670.5) = 671 (a .5 tie, rounds up).
    // total = 13410 + 671 + 1307 = 15388.
    const unit = 4470;
    const totals = computeTotals(
      [
        line({ unitPriceCents: unit, taxCents: TAXABLE }),
        line({ unitPriceCents: unit, taxCents: TAXABLE }),
        line({ unitPriceCents: unit, taxCents: TAXABLE }),
      ],
      0,
      0,
      0,
    );
    expect(totals.taxCents).toBe(1307);
    expect(totals.serviceChargeCents).toBe(671);
    expect(totals.totalCents).toBe(15388);
    // The receipt-side figure, stated as a literal so the 1¢ gap is visible in the test itself.
    const sumOfPerUnitSnapshots = 436 * 3;
    expect(sumOfPerUnitSnapshots).toBe(1308);
    expect(sumOfPerUnitSnapshots - totals.taxCents).toBe(1);
  });
});
