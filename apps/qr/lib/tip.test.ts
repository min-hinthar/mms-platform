import { describe, expect, it } from "vitest";
import { createIntentInput, shareIntentInput } from "@mms/db/schemas";
import { effectiveTipRate, roundUpTip, tipPresets, TIP_LADDER, TIP_RATE_MAX } from "./tip";

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

describe("roundUpTip — the frictionless small tip", () => {
  it("rounds the due total to the next whole dollar and names the destination", () => {
    // net $32.00, due $35.36 → 64¢ lands on $36.00.
    const r = roundUpTip(3200, 3536);
    expect(r).toEqual({ rate: 0.02, tipCents: 64, targetCents: 3600 });
    // The rate must reproduce the promised cents through the charge formula — the label is a promise.
    expect(charged(3200, r!.rate)).toBe(64);
  });

  it("works on a small basket too (net $6.00, due $6.63 → 37¢ → $7.00)", () => {
    const r = roundUpTip(600, 663);
    expect(r?.tipCents).toBe(37);
    expect(r?.targetCents).toBe(700);
    expect(charged(600, r!.rate)).toBe(37);
  });

  it("offers NOTHING on an already-whole total — 'round up' must not mean 'add a dollar'", () => {
    // The honest reason this is null: there is nothing to round. Silently charging $1 under a
    // round-up label would be a different, larger ask wearing its clothes.
    expect(roundUpTip(3200, 3500)).toBeNull();
    expect(roundUpTip(600, 100)).toBeNull();
  });

  it("offers nothing when the round-up would exceed the server's cap (net $1.00, due $1.10)", () => {
    // 90¢ on a $1.00 base is 90% — the mint would refuse it, and a chip that 400s reads as a bug.
    expect(roundUpTip(100, 110)).toBeNull();
  });

  it.each([
    [0, 500],
    [-100, 500],
    [500, 0],
    [500, -100],
    [NaN, 500],
    [500, NaN],
  ])("a non-positive or non-finite base/due (%s, %s) offers nothing", (net, due) => {
    expect(roundUpTip(net, due)).toBeNull();
  });

  it("whatever it offers is always inside the cap and always lands on a whole dollar", () => {
    // EVERY remainder, not a sample of them: the rule is about `due % 100`, so stepping the
    // remainder would leave most of the rule's own domain untested while reading as exhaustive.
    // Failures are COLLECTED and asserted once — 80k `expect` calls cost seconds, and a slow guard
    // is a guard someone eventually stops running.
    const bad: string[] = [];
    for (let net = 25; net <= 20000; net += 25) {
      for (let extra = 0; extra < 100; extra += 1) {
        const due = net + extra;
        const r = roundUpTip(net, due);
        if (r === null) continue;
        if (r.rate > TIP_RATE_MAX) bad.push(`net=${net} due=${due}: rate ${r.rate} over cap`);
        if (r.targetCents % 100 !== 0)
          bad.push(`net=${net} due=${due}: ${r.targetCents} not whole`);
        if (r.targetCents !== due + r.tipCents)
          bad.push(`net=${net} due=${due}: target != due+tip`);
        // And the promise holds through the real charge formula, at every size.
        if (charged(net, r.rate) !== r.tipCents)
          bad.push(
            `net=${net} due=${due}: charges ${charged(net, r.rate)}, promised ${r.tipCents}`,
          );
      }
    }
    expect(bad).toEqual([]);
  });
});

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
    roundUpOn: false,
    roundUp: null,
    presetRate: 0,
  };

  it("a round-up FOLLOWS the cart instead of freezing at the tapped rate", () => {
    // This is the W17c review's HIGH, as a rule. The diner taps "Round up to $36.00" on a $35.36
    // due; then a promo lands and the due becomes $31.12. Storing the tapped rate (0.02) would
    // charge 0.02 × the new net — a tip that rounds to nothing, on a total the UI no longer names.
    const before = roundUpTip(3200, 3536)!;
    const after = roundUpTip(2800, 3112)!;
    expect(before.rate).not.toBe(after.rate); // the two baskets genuinely disagree — not degenerate
    expect(effectiveTipRate({ ...base, roundUpOn: true, roundUp: after })).toBe(after.rate);
    expect(effectiveTipRate({ ...base, roundUpOn: true, roundUp: after })).not.toBe(before.rate);
  });

  it("a round-up whose offer has evaporated charges NOTHING, not a stale rate", () => {
    // The cart moved to an already-whole total: there is nothing to round, so nothing is added.
    expect(effectiveTipRate({ ...base, roundUpOn: true, roundUp: null })).toBe(0);
  });

  it("a PERCENTAGE preset is basket-independent and simply holds", () => {
    expect(effectiveTipRate({ ...base, presetRate: 0.18 })).toBe(0.18);
  });

  it("the open custom field outranks a preset and a round-up", () => {
    const r = roundUpTip(3200, 3536)!;
    expect(
      effectiveTipRate({
        ...base,
        customTipOpen: true,
        customRate: 0.31,
        roundUpOn: true,
        roundUp: r,
        presetRate: 0.18,
      }),
    ).toBe(0.31);
  });

  it("a pure-grocery basket outranks everything — no tip ask, no tip", () => {
    const r = roundUpTip(3200, 3536)!;
    expect(
      effectiveTipRate({
        ...base,
        pureGrocery: true,
        customTipOpen: true,
        customRate: 0.31,
        roundUpOn: true,
        roundUp: r,
        presetRate: 0.2,
      }),
    ).toBe(0);
  });
});
