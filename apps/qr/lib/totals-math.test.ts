import { describe, expect, it } from "vitest";
import { computeTotals, rewardShortfallCents, type TotalsLine } from "./totals-math";

/**
 * W8a — the charge invariants (recomputed for W16a: service charge RETIRED, tax rate 0.105).
 *
 * **Every expected integer below is computed in the shell from the spec arithmetic and written as
 * a literal.** Nothing here calls the implementation to produce an expectation, compares one
 * `computeTotals` call to another, or snapshots. That rule is the entire point of this file: a
 * test that re-derives the formula re-asserts the formula's bugs.
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

// `taxCents` is a PER-UNIT figure everywhere in the app and is read only as a boolean `> 0` flag.
// 1¢ is used as the "this line is taxable" marker so no fixture implies a real per-line tax.
const TAXABLE = 1;

describe("invariant 1 — voided and comped lines are excluded from every base", () => {
  it("charges only the live lines", () => {
    // Live:   2000¢ dine-in taxable (1 × 2000)
    // Voided: 5000¢ — excluded
    // Comped: 3000¢ — excluded
    // subtotal 2000 · no discount · taxable base 2000 · tax round(2000 × 0.105) = 210
    // service 0 (retired, W16a) · tip 20% → round(2000 × 0.2) = 400
    // total = 2000 + 0 + 210 + 400 = 2610
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
      rewardFaceCents: 0,
      serviceChargeCents: 0,
      taxCents: 210,
      tipCents: 400,
      totalCents: 2610,
    });
  });

  it("charges fired, in-progress and served lines — only `voided` is excluded", () => {
    // Guards against a future "only draft is chargeable" tightening: the food exists once it fires.
    // 3 × 1000¢, all non-draft states, no tax flag → subtotal 3000, tax 0, service 0, tip 0 → 3000.
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
    expect(totals.serviceChargeCents).toBe(0);
    expect(totals.totalCents).toBe(3000);
  });

  it("returns an all-zero CHARGE for an empty cart without dividing by zero", () => {
    // Every charged figure is 0. `rewardFaceCents` is NOT, and deliberately so: it states what the
    // attached coupon is WORTH, which is a fact about the coupon, not about the basket. Zeroing it
    // when nothing applies would blank the field in precisely the worst case — a basket that shrank
    // away under an attached coupon, where the entire face is at risk — so the disclosure gates on
    // `rewardCents > 0 && rewardFaceCents > rewardCents` instead, and stays quiet here on its own.
    expect(computeTotals([], 500, 500, 0.2)).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      rewardCents: 0,
      rewardFaceCents: 500,
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
    // service 0 · tip round(0 × 0.2) = 0
    const totals = computeTotals([line({ unitPriceCents: 1000, taxCents: TAXABLE })], 4000, 0, 0.2);
    expect(totals).toEqual({
      subtotalCents: 1000,
      discountCents: 1000,
      rewardCents: 0,
      rewardFaceCents: 0,
      serviceChargeCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 0,
    });
  });

  it("CASE B (M22) — the REWARD clamps first; the promo takes the remainder", () => {
    // ORDER MATTERS, and this is the fixture where it shows. subtotal 1000, promo 600, reward 900.
    //   · reward first (shipped): reward = min(900, 1000) = 900, promo = min(600, 100) = 100
    //   · promo first (was):      promo  = min(600, 1000) = 600, reward = min(900, 400) = 400
    // Both sum to 1000 and both total 0 — but the first delivers the coupon's full face and the
    // second destroys 500¢ of it, because `mms_redeem_cart_reward` burns the coupon either way.
    const totals = computeTotals(
      [line({ unitPriceCents: 1000, taxCents: TAXABLE })],
      600,
      900,
      0.2,
    );
    expect(totals.rewardCents).toBe(900);
    // …and the promo absorbs the clamp instead. A promo's budget is a redemption COUNT, consumed by
    // `p_discount_cents > 0` at fulfillment, so it costs the same one redemption at 100 as at 600.
    expect(totals.discountCents - totals.rewardCents).toBe(100);

    // Unchanged by the reordering — the two claims that make it safe.
    expect(totals.discountCents).toBe(1000);
    expect(totals.totalCents).toBe(0);

    // M22 — nothing of the coupon is discarded here any more. This is the assertion that was
    // `toBe(500)` while the burn was pinned.
    expect(rewardResidual(totals.rewardFaceCents, totals.rewardCents)).toBe(0);
    expect(totals.rewardFaceCents).toBe(900);
  });

  it("CASE B′ (M22) — the residual survives only when the BASKET is smaller than the coupon", () => {
    // The one case reward-first cannot fix, and therefore the one a surface must disclose: a $9
    // coupon against a $4 basket. No promo is involved — the whole chargeable base is the ceiling.
    const totals = computeTotals([line({ unitPriceCents: 400, taxCents: TAXABLE })], 0, 900, 0);
    expect(totals.rewardCents).toBe(400);
    expect(totals.rewardFaceCents).toBe(900);
    expect(rewardResidual(totals.rewardFaceCents, totals.rewardCents)).toBe(500);
    expect(totals.totalCents).toBe(0);
  });

  it("CASE B″ (M22) — the FACE is the coupon's, never the clamped amount", () => {
    // Guards the disclosure's only input. If `rewardFaceCents` were derived from the clamp (or from
    // a second read), it would equal `rewardCents` here and the residual would vanish — the surface
    // would go silent in exactly the case it exists for.
    const totals = computeTotals([line({ unitPriceCents: 400 })], 0, 900, 0);
    expect(totals.rewardFaceCents).not.toBe(totals.rewardCents);
    // …and it agrees with the applied amount whenever there IS room, so the disclosure stays quiet.
    const roomy = computeTotals([line({ unitPriceCents: 5000 })], 0, 500, 0);
    expect(roomy.rewardFaceCents).toBe(roomy.rewardCents);
  });

  it("CASE B‴ (M22) — reordering the clamp moves NO total, only the split", () => {
    // The claim the whole change rests on, measured rather than argued: for every promo/reward pair
    // the two orders agree on subtotal, discount, tax, tip and total, and differ only in how much of
    // the discount is attributed to the reward. `promoFirst` is the OLD engine, restated here.
    const promoFirst = (subtotal: number, promoRaw: number, rewardRaw: number) => {
      const promo = Math.min(promoRaw, subtotal);
      return { promo, reward: Math.min(rewardRaw, Math.max(subtotal - promo, 0)) };
    };
    let sawADifferentSplit = false;
    for (const promo of [0, 100, 600, 1000, 4000]) {
      for (const reward of [0, 100, 900, 1000, 4000]) {
        const t = computeTotals(
          [line({ unitPriceCents: 1000, taxCents: TAXABLE })],
          promo,
          reward,
          0.2,
        );
        const old = promoFirst(1000, promo, reward);
        expect(t.discountCents).toBe(old.promo + old.reward);
        expect(t.totalCents).toBeGreaterThanOrEqual(0);
        if (t.rewardCents !== old.reward) sawADifferentSplit = true;
      }
    }
    // ANTI-DEGENERACY: if the two orders never disagreed on the split, this test would be asserting
    // nothing about the change at all.
    expect(sawADifferentSplit).toBe(true);
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

/** How much of the coupon's face the clamp discarded — value the diner loses, since the coupon is
 *  redeemed in full either way. Not part of the engine; a readable name at the call sites. */
function rewardResidual(couponCents: number, appliedCents: number): number {
  return couponCents - appliedCents;
}

describe("invariant 3 — tax is on the DISCOUNTED TAXABLE base, pro-rated by taxable share", () => {
  it("mixed taxable/exempt + a flat promo (the case a pro-rata-of-aggregate bug breaks)", () => {
    // Basket: taxable 1000¢ × 1 (dine-in) + exempt 2333¢ × 1 (grocery). subtotal = 3333.
    // Flat promo 1000, no reward → discountCents 1000, net 2333.
    // taxableBase 1000. discOnTaxable = round(1000 × (1000/3333)) = round(300.03…) = 300.
    // tax = round((1000 − 300) × 0.105) = round(73.5) = 74 (an exact .5 tie — rounds up).
    //
    // THE DISCRIMINATORS — this fixture is chosen so three plausible-but-wrong implementations each
    // produce a DIFFERENT number, so the test can actually tell them apart:
    //   • correct (discount pro-rated onto the taxable base)     → 74
    //   • whole discount taken off the taxable base (1000−1000)  → 0
    //   • tax on the undiscounted taxable base (1000 × 0.105)    → 105
    // service 0 (retired). tip 18% of net → round(2333 × 0.18) = round(419.94) = 420.
    // total = 2333 + 0 + 74 + 420 = 2827.
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
      rewardFaceCents: 0,
      serviceChargeCents: 0,
      taxCents: 74,
      tipCents: 420,
      totalCents: 2827,
    });
    // State the discriminators as assertions so a regression can't quietly land on one of them.
    expect(totals.taxCents).not.toBe(0);
    expect(totals.taxCents).not.toBe(105);
  });

  it("rounds the pro-rata to whole cents BEFORE subtracting it from the base", () => {
    // A mutation escape found by mutation-testing this suite: `Math.round(d * (t/s))` (correct) and
    // `Math.round(d * t) / s` (the transposed-paren bug, which leaves a FRACTIONAL discount) agree
    // on most baskets, so the fixture must be SEARCHED for (node sweep at 0.105 — the 0.0975-era
    // fixture no longer discriminates):
    //   taxable 50¢ dine-in + exempt 1273¢ grocery → subtotal 1323, promo 700, net 623.
    //   correct: discOnTaxable = round(700 × (50/1323)) = round(26.45…) = 26
    //            tax = round((50 − 26) × 0.105) = round(2.52) = 3
    //   mutant:  discOnTaxable = round(700 × 50)/1323 = 35000/1323 = 26.455…  (never rounded)
    //            tax = round((50 − 26.455…) × 0.105) = round(2.472…) = 2
    //   total = 623 + 3 = 626
    const totals = computeTotals(
      [
        line({ unitPriceCents: 50, taxCents: TAXABLE, fulfillment: "dinein" }),
        line({ unitPriceCents: 1273, taxCents: 0, fulfillment: "grocery" }),
      ],
      700,
      0,
      0,
    );
    expect(totals.taxCents).toBe(3);
    expect(totals.taxCents).not.toBe(2); // the transposed-paren mutant
    expect(totals.totalCents).toBe(626);
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

  it("keeps the taxable pro-rata independent of the (retired) service arithmetic", () => {
    // A grocery line that is taxable (retail non-food off the market shelf): 3000¢, and an exempt
    // dine-in line (cold food): 1000¢. subtotal 4000, promo 1000 → net 3000.
    //   taxable base = 3000 → discOnTaxable = round(1000 × (3000/4000)) = 750
    //                  tax = round((3000 − 750) × 0.105) = round(236.25) = 236
    // service 0 (retired). total = 3000 + 236 = 3236.
    const totals = computeTotals(
      [
        line({ unitPriceCents: 3000, taxCents: TAXABLE, fulfillment: "grocery" }),
        line({ unitPriceCents: 1000, taxCents: 0, fulfillment: "dinein" }),
      ],
      1000,
      0,
      0,
    );
    expect(totals.taxCents).toBe(236);
    expect(totals.serviceChargeCents).toBe(0);
    expect(totals.totalCents).toBe(3236);
  });
});

describe("invariant 4 — the service charge is RETIRED (W16a)", () => {
  it("charges 0 service on every basket shape — restaurant, grocery, mixed, discounted", () => {
    // The owner retired the 5% SB-1524 charge (2026-08-15). The field stays in the shape for the
    // SQL/webhook/snapshot contract — always 0 for new orders. A revived charge limb is a silent
    // price increase, so every shape is pinned to 0 here.
    const shapes: TotalsLine[][] = [
      [line({ unitPriceCents: 10000 })],
      [line({ unitPriceCents: 4000, taxCents: 0, fulfillment: "grocery" })],
      [
        line({ unitPriceCents: 4550, taxCents: TAXABLE, fulfillment: "dinein" }),
        line({ unitPriceCents: 2000, taxCents: 0, fulfillment: "grocery" }),
      ],
      [line({ unitPriceCents: 6550, taxCents: TAXABLE, fulfillment: "togo" })],
    ];
    for (const lines of shapes) {
      expect(computeTotals(lines, 1000, 0, 0.2).serviceChargeCents).toBe(0);
      expect(computeTotals(lines, 0, 0, 0).serviceChargeCents).toBe(0);
    }
  });

  it("the total therefore reduces to net + tax + tip", () => {
    // Restaurant-only 10000¢ taxable, no discount, 20% tip:
    // tax round(10000 × 0.105) = 1050 · tip round(10000 × 0.2) = 2000 · total 13050.
    const totals = computeTotals([line({ unitPriceCents: 10000, taxCents: TAXABLE })], 0, 0, 0.2);
    expect(totals).toEqual({
      subtotalCents: 10000,
      discountCents: 0,
      rewardCents: 0,
      rewardFaceCents: 0,
      serviceChargeCents: 0,
      taxCents: 1050,
      tipCents: 2000,
      totalCents: 13050,
    });
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
    // A 0¢ non-grocery line leaves `restaurantBaseCents === 0`, so the server force-zeros the tip
    // while the client's own `pureGrocery` flag (`every(fulfillment === 'grocery')`) says the tip
    // selector should show. The diner picks 18% and it silently vanishes. Pinned, not fixed —
    // OPEN-ITEMS M26.
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

describe("invariant 6 — a randomised sweep against an INDEPENDENT oracle", () => {
  /**
   * A second implementation of the documented rules, written from the SPEC rather than from
   * `totals-math.ts`. This is the honest form of a sweep: asserting `total === net + tax + tip`
   * would merely re-state the function's own `return` expression and therefore hold for ANY change
   * to the components.
   *
   * If you change the engine, this oracle must change too — deliberately, in a diff a reviewer sees.
   * (W16a: service term deleted; tax rate 0.105; the tip gate still rides the restaurant base.)
   */
  function oracle(
    lines: TotalsLine[],
    promoRaw: number,
    rewardRaw: number,
    tipRate: number,
  ): Record<string, number> {
    const live = lines.filter((l) => l.state !== "voided" && !l.comped);
    const amount = (l: TotalsLine) => l.unitPriceCents * l.qty;
    const subtotal = live.reduce((a, l) => a + amount(l), 0);
    // M22 — reward first, promo takes the remainder (see totals-math.ts for WHY the order matters
    // even though the sum does not). Kept as an independent restatement, not a copy of the engine.
    const reward = Math.min(rewardRaw, subtotal);
    const promo = Math.min(promoRaw, Math.max(subtotal - reward, 0));
    const discount = promo + reward;
    const net = subtotal - discount;
    const taxable = live.reduce((a, l) => a + (l.taxCents > 0 ? amount(l) : 0), 0);
    const restaurant = live.reduce((a, l) => a + (l.fulfillment === "grocery" ? 0 : amount(l)), 0);
    const share = (base: number) => (subtotal > 0 ? Math.round(discount * (base / subtotal)) : 0);
    const tax = Math.round((taxable - share(taxable)) * 0.105);
    const tip = restaurant === 0 ? 0 : Math.round(net * tipRate);
    return {
      subtotalCents: subtotal,
      discountCents: discount,
      rewardCents: reward,
      rewardFaceCents: Math.max(rewardRaw, 0),
      serviceChargeCents: 0,
      taxCents: tax,
      tipCents: tip,
      totalCents: net + tax + tip,
    };
  }

  it("matches the oracle on 2,000 distinct random baskets", () => {
    const rnd = mulberry32(20260731);
    const FUL = ["dinein", "togo", "grocery"] as const;
    const STATES = ["draft", "fired", "in_progress", "served", "voided"] as const;
    for (let t = 0; t < 2000; t++) {
      const lines: TotalsLine[] = [];
      for (let i = 0; i < Math.floor(rnd() * 6); i++) {
        lines.push(
          line({
            unitPriceCents: Math.floor(rnd() * 9999),
            qty: 1 + Math.floor(rnd() * 9),
            taxCents: rnd() < 0.5 ? 0 : TAXABLE,
            fulfillment: FUL[Math.floor(rnd() * 3)]!,
            state: STATES[Math.floor(rnd() * 5)]!,
            comped: rnd() < 0.15,
          }),
        );
      }
      const promo = Math.floor(rnd() * 3000);
      const reward = Math.floor(rnd() * 3000);
      const tip = [0, 0.15, 0.18, 0.2][Math.floor(rnd() * 4)]!;
      expect(computeTotals(lines, promo, reward, tip)).toEqual(oracle(lines, promo, reward, tip));
    }
  });

  it("returns only integer cents, and never a negative total", () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 500; t++) {
      const totals = computeTotals(
        [line({ unitPriceCents: Math.floor(rnd() * 9999), qty: 1 + Math.floor(rnd() * 9) })],
        Math.floor(rnd() * 3000),
        Math.floor(rnd() * 3000),
        0.18,
      );
      for (const v of Object.values(totals)) expect(Number.isInteger(v)).toBe(true);
      expect(totals.totalCents).toBeGreaterThanOrEqual(0);
      expect(totals.rewardCents).toBeLessThanOrEqual(totals.discountCents);
    }
  });
});

describe("invariant 7 — quantity multiplies the base, not the rounded tax", () => {
  it("computes tax on qty × unit price, in one rounding step — 1250¢ × 3 is 394¢, not 393¢", () => {
    // 3 × 1250¢ = 3750 taxable base. tax = round(3750 × 0.105) = round(393.75) = 394.
    // Rounding per unit first gives 3 × round(131.25) = 3 × 131 = 393 — at 0.105 THIS fixture is a
    // real discriminator (at 0.0975 it agreed by luck; the roles swapped with the rate change).
    const totals = computeTotals(
      [line({ unitPriceCents: 1250, qty: 3, taxCents: TAXABLE })],
      0,
      0,
      0,
    );
    expect(totals.subtotalCents).toBe(3750);
    expect(totals.taxCents).toBe(394);
    expect(totals.taxCents).not.toBe(393); // the per-unit-rounded mutant
  });

  it("catches the same refactor on a small basket — 80¢ × 3 is 25¢, not 24¢", () => {
    // round(240 × 0.105) = round(25.2) = 25; per-unit round(80 × 0.105) = round(8.4) = 8, × 3 = 24.
    const totals = computeTotals(
      [line({ unitPriceCents: 80, qty: 3, taxCents: TAXABLE })],
      0,
      0,
      0,
    );
    expect(totals.subtotalCents).toBe(240);
    expect(totals.taxCents).toBe(25);
    expect(totals.taxCents).not.toBe(24); // the per-unit-rounded mutant
  });
});

describe("M6 (known-open) — a sub-5¢ taxable line reads EXEMPT", () => {
  it("collects no tax on 100 × 4¢, because tax_cents rounded to 0 at insert", () => {
    // `lineTax(4, 'hot_prepared', true)` = round(4 × 0.105) = round(0.42) = 0, so the line is
    // STORED with `tax_cents = 0` — and `computeTotals` reads that column only as a boolean taxable
    // flag, so the whole 400¢ base is treated as exempt. (At 0.105 the smallest taxed amount is 5¢,
    // down from 6¢ at 0.0975 — the M6 window narrowed but did not close.)
    //   subtotal 400 · taxable base 0 → tax 0   ← the defect: should be round(400 × 0.105) = 42
    //   service 0 · tip 0 · total 400
    // The clean fix carries an `is_taxable` flag on the line instead of the rounded proxy; when it
    // lands, `taxCents` here becomes 42 and `totalCents` 442.
    const totals = computeTotals([line({ unitPriceCents: 4, qty: 100, taxCents: 0 })], 0, 0, 0);
    expect(totals).toEqual({
      subtotalCents: 400,
      discountCents: 0,
      rewardCents: 0,
      rewardFaceCents: 0,
      serviceChargeCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 400,
    });
  });
});

describe("M7 (known-open) — aggregate tax ≠ Σ per-unit line tax", () => {
  it("differs by a cent from a receipt that sums per-line snapshots", () => {
    // The CHARGE is correct; only a receipt that sums the stored per-unit `tax_cents` disagrees.
    // Basket: 3 lines × qty 1 at 4470¢, all taxable dine-in. subtotal 13410.
    //   aggregate (what is charged): round(13410 × 0.105) = round(1408.05) = 1408
    //   per-unit snapshots:          round(4470 × 0.105) = round(469.35) = 469, × 3 = 1407
    //   Δ = 1¢ (the per-unit sum UNDER-counts at this rate; the sign flipped from 0.0975)
    // total = 13410 + 1408 = 14818.
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
    expect(totals.taxCents).toBe(1408);
    expect(totals.serviceChargeCents).toBe(0);
    expect(totals.totalCents).toBe(14818);
    // The receipt-side figure, stated as a literal so the 1¢ gap is visible in the test itself.
    const sumOfPerUnitSnapshots = 469 * 3;
    expect(sumOfPerUnitSnapshots).toBe(1407);
    expect(totals.taxCents - sumOfPerUnitSnapshots).toBe(1);
  });
});

describe("M22 — the shortfall a surface must disclose", () => {
  // The owner's call was BURN IN FULL, BUT DISCLOSE IT. `rewardShortfallCents` is the whole of the
  // second half, so it is a money rule and lives in lib/, not in Checkout.tsx (W17: a rule in a
  // component sits outside check-money-coverage's MONEY_PATHS and cannot be guarded at all).
  it("is 0 when the coupon fits — the surface must stay silent", () => {
    const t = computeTotals([line({ unitPriceCents: 5000 })], 0, 500, 0);
    expect(t.rewardCents).toBe(500);
    expect(rewardShortfallCents(t)).toBe(0);
  });

  it("is the discarded residual when the basket is smaller than the coupon", () => {
    const t = computeTotals([line({ unitPriceCents: 400 })], 0, 900, 0);
    expect(rewardShortfallCents(t)).toBe(500);
  });

  it("stays 0 when NOTHING applied — a disclosure with no reward line to point at is noise", () => {
    // A coupon attached to a basket that cannot charge anything. `rewardFaceCents` is truthfully
    // 500, but there is no reward row on screen for the copy to qualify, so the gate is on the
    // APPLIED amount. This is the assertion that fails if the gate is moved to the face.
    const t = computeTotals([], 0, 500, 0);
    expect(t.rewardFaceCents).toBe(500);
    expect(t.rewardCents).toBe(0);
    expect(rewardShortfallCents(t)).toBe(0);
  });

  it("never goes negative, whatever the caller passes", () => {
    expect(rewardShortfallCents({ rewardCents: 900, rewardFaceCents: 400 })).toBe(0);
  });

  it("REGRESSION — the promo collision no longer produces a shortfall at all", () => {
    // The M22 repro shape: a promo eating the base under an applied coupon. Under promo-first this
    // discarded 500¢ and would have disclosed it; reward-first means there is nothing to disclose.
    const t = computeTotals([line({ unitPriceCents: 1000 })], 600, 900, 0);
    expect(rewardShortfallCents(t)).toBe(0);
  });
});
