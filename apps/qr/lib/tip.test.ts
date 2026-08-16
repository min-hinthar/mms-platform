import { describe, expect, it } from "vitest";
import { createIntentInput, shareIntentInput } from "@mms/db/schemas";
import {
  effectiveTipRate,
  tipPresets,
  tipReaction,
  tipWithinAmountCap,
  TIP_AMOUNT_MAX_CENTS,
  TIP_LADDER,
  TIP_RATE_MAX,
} from "./tip";

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

  it("single-pay is LOOSER — so respecting the split cap satisfies it, never the reverse", () => {
    // Documents WHY the tighter bound is the one this module uses: a 0.9 rate is fine single-pay and
    // refused on a split. If this ever inverts, the choice of TIP_RATE_MAX has to be revisited.
    // W19: single-pay's real ceiling is the $1,000 AMOUNT (enforced in create-intent on the derived
    // cents); the schema rate bound is only the transport sanity rail, so a >100% rate now parses.
    expect(createIntentInput.safeParse({ cartId: CART, tipRate: 0.9 }).success).toBe(true);
    expect(createIntentInput.safeParse({ cartId: CART, tipRate: 2.5 }).success).toBe(true);
    expect(shareIntentInput.safeParse({ cartId: CART, tipRate: 0.9 }).success).toBe(false);
    expect(createIntentInput.safeParse({ cartId: CART, tipRate: TIP_RATE_MAX }).success).toBe(true);
  });
});

describe("the $1,000 tip amount ceiling (W19 — owner: 'no limit to custom or capped amount')", () => {
  it("is exactly the cash tip's own bound, and the boundary belongs to the allowed side", () => {
    // Computed, not transcribed: settleCashInput.tipCents allows 0..100000.
    expect(TIP_AMOUNT_MAX_CENTS).toBe(100000);
    expect(tipWithinAmountCap(100000)).toBe(true); // exactly $1,000.00 still passes —
    // an over-tight bound would refuse a legitimate maximal tip and no refusal-only test would see it.
    expect(tipWithinAmountCap(0)).toBe(true);
  });

  it("refuses the first cent past the ceiling", () => {
    expect(tipWithinAmountCap(100001)).toBe(false);
  });

  it("the schema's transport rail can carry any in-bounds tip on any priceable order", () => {
    // The smallest orderable net is one 25¢ item (the setMenuPrice floor). A $1,000 tip on it needs
    // rate 100000/25 = 4000 — the schema max. Anything the amount gate allows must PARSE, or the
    // bound would surface as a 400 at the last tap instead of the honest cap line.
    expect(createIntentInput.safeParse({ cartId: CART, tipRate: 100000 / 25 }).success).toBe(true);
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

describe("tipReaction — the ask reacts to the choice, warmer as the ladder climbs (W20)", () => {
  it("each rung gets its OWN line, and they are all distinct", () => {
    const r15 = tipReaction(0.15)!;
    const r20 = tipReaction(0.2)!;
    const r30 = tipReaction(0.3)!;
    expect(new Set([r15.en, r20.en, r30.en]).size).toBe(3);
    expect(new Set([r15.my, r20.my, r30.my]).size).toBe(3);
  });

  it("None (rate 0) gets NOTHING — declining is never met with a reaction", () => {
    expect(tipReaction(0)).toBeNull();
    expect(tipReaction(-1)).toBeNull();
    expect(tipReaction(NaN)).toBeNull();
  });

  it("a custom amount gets the warm generic, whatever its rate", () => {
    expect(tipReaction(0.17, true)!.en).toBe("Thank you so much!");
    expect(tipReaction(2.0, true)!.en).toBe("Thank you so much!");
  });

  it("boundaries belong to the rung they name (0.2 is the 20% line, not the 15%)", () => {
    expect(tipReaction(0.2)!.en).toContain("generous");
    expect(tipReaction(0.3)!.en).toContain("thrilled");
    expect(tipReaction(0.19)!.en).toContain("kitchen");
  });
});
