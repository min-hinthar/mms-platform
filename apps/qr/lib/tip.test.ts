import { describe, expect, it } from "vitest";
import { createIntentInput, shareIntentInput } from "@mms/db/schemas";
import { effectiveTipRate, tipPresets, TIP_LADDER, TIP_RATE_MAX } from "./tip";

/**
 * W17c — the tip ask's decision rules. Every integer below is computed in Node and pasted, never
 * transcribed from prose.
 *
 * The rule that ties this to the rest of the money path: a chip produces a RATE, and the charge is
 * `round(net × rate)`. So a chip's label is a promise about what the server will compute, and each
 * test that asserts a label also asserts the arithmetic reproduces it.
 */

/** The charge authority's formula (lib/totals-math.ts) — reproduced here so a chip's promise is
 *  checked against the calculation that will actually run, not against itself. */
const charged = (netCents: number, rate: number) => Math.round(netCents * rate);

describe("tipPresets — the owner's 15/20/30 ladder, on every surface", () => {
  it("is exactly the house ladder (owner, 2026-08-16)", () => {
    expect(TIP_LADDER).toEqual([0.15, 0.2, 0.3]);
    expect(tipPresets(3200).map((x) => x.label)).toEqual(["15%", "20%", "30%"]);
  });

  it("each label is a promise about what the server charges (net $32.00)", () => {
    expect(tipPresets(3200).map((x) => charged(3200, x.rate))).toEqual([480, 640, 960]);
  });

  it("the SAME ladder on a small basket — no size fork (net $4.00 and $6.00)", () => {
    // W17c-1 forked to flat dollars under $20 because 18% of a $4 tea was a meaningless 72¢. The
    // owner's ladder removes the need: 30% of that tea is $1.20, an amount someone actually leaves.
    expect(tipPresets(400).map((x) => x.label)).toEqual(["15%", "20%", "30%"]);
    expect(tipPresets(400).map((x) => charged(400, x.rate))).toEqual([60, 80, 120]);
    expect(tipPresets(600).map((x) => charged(600, x.rate))).toEqual([90, 120, 180]);
  });

  it.each([0, -1, NaN])(
    "a non-positive base (%s) offers nothing — a rate against 0 is undefined",
    (net) => {
      expect(tipPresets(net)).toEqual([]);
    },
  );

  it("drops any ladder rung the server would refuse", () => {
    // Today's ladder tops out at 30%, so the cap filter never fires on it — which is exactly why
    // this passes a ladder that BREACHES the cap. Without an input that reaches the rule, the
    // protection is decorative and its mutant survives. 0.6 > TIP_RATE_MAX (0.5) and must not be
    // offered; a chip the split mint refuses turns a bound into a failed payment at the last tap.
    expect(tipPresets(3200, [0.15, 0.6]).map((x) => x.label)).toEqual(["15%"]);
    expect(tipPresets(3200, [0.6]).map((x) => x.label)).toEqual([]);
    // And the boundary belongs to the allowed side.
    expect(tipPresets(3200, [TIP_RATE_MAX]).map((x) => x.label)).toEqual(["50%"]);
  });

  it("every preset it EVER offers is inside the server's cap", () => {
    // Sweep the basket sizes a real order can take, not one convenient fixture. The ladder is
    // basket-independent today, so this is the standing guarantee for whoever changes it next.
    const bad: string[] = [];
    for (let net = 25; net <= 50000; net += 25) {
      for (const p of tipPresets(net)) {
        if (p.rate > TIP_RATE_MAX) bad.push(`net=${net} ${p.label}: rate ${p.rate} over cap`);
        // Valid on BOTH settlement paths — the table may split after the tip is chosen.
        if (!createIntentInput.safeParse({ cartId: CART, tipRate: p.rate }).success)
          bad.push(`net=${net} ${p.label}: refused by create-intent`);
        if (!shareIntentInput.safeParse({ cartId: CART, tipRate: p.rate }).success)
          bad.push(`net=${net} ${p.label}: refused by the split mint`);
      }
    }
    expect(bad).toEqual([]);
  });
});

const CART = "11111111-1111-4111-8111-111111111111";

describe("the cap this module enforces is the TIGHTER of the two schema caps", () => {
  it("TIP_RATE_MAX is exactly the SPLIT path's ceiling — the binding one", () => {
    // The split rate is written to qr_cart_shares.tip_rate, whose column CHECK is <= 0.5. A tip is
    // chosen before the table decides how it settles, so a chip must clear this, not just single-pay.
    expect(shareIntentInput.safeParse({ cartId: CART, tipRate: TIP_RATE_MAX }).success).toBe(true);
    expect(
      shareIntentInput.safeParse({ cartId: CART, tipRate: TIP_RATE_MAX + 0.0001 }).success,
    ).toBe(false);
  });

  it("single-pay is LOOSER (1.0) — so respecting the split cap satisfies it, never the reverse", () => {
    // Documents WHY the tighter bound is the one this module uses: a 0.9 rate is fine single-pay and
    // refused on a split. If this ever inverts, the choice of TIP_RATE_MAX has to be revisited.
    expect(createIntentInput.safeParse({ cartId: CART, tipRate: 0.9 }).success).toBe(true);
    expect(shareIntentInput.safeParse({ cartId: CART, tipRate: 0.9 }).success).toBe(false);
    expect(createIntentInput.safeParse({ cartId: CART, tipRate: TIP_RATE_MAX }).success).toBe(true);
  });
});

describe("effectiveTipRate — the pressed chip and the charge read the SAME value", () => {
  const base = {
    pureGrocery: false,
    customTipOpen: false,
    customRate: 0,
    presetRate: 0,
  };

  it("a PERCENTAGE preset is basket-independent and simply holds", () => {
    expect(effectiveTipRate({ ...base, presetRate: 0.18 })).toBe(0.18);
  });

  it("the open custom field outranks a preset", () => {
    expect(
      effectiveTipRate({
        ...base,
        customTipOpen: true,
        customRate: 0.31,
        presetRate: 0.18,
      }),
    ).toBe(0.31);
  });

  it("a CLOSED custom field yields to the preset — stale typed dollars never charge", () => {
    // Tapping a preset closes the field but the raw string may linger in state; the closed-field
    // branch must read the preset, not the leftover custom rate.
    expect(
      effectiveTipRate({
        ...base,
        customTipOpen: false,
        customRate: 0.31,
        presetRate: 0.15,
      }),
    ).toBe(0.15);
  });

  it("a pure-grocery basket outranks everything — no tip ask, no tip", () => {
    expect(
      effectiveTipRate({
        ...base,
        pureGrocery: true,
        customTipOpen: true,
        customRate: 0.31,
        presetRate: 0.2,
      }),
    ).toBe(0);
  });
});
