import { describe, expect, it } from "vitest";
import { createIntentInput, shareIntentInput } from "@mms/db/schemas";
import { roundUpTip, tipPresets, SMALL_BASKET_CEILING_CENTS, TIP_RATE_MAX } from "./tip";

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

describe("tipPresets — the unit follows the basket", () => {
  it("a LARGE basket gets percentages (net $32.00)", () => {
    const p = tipPresets(3200);
    expect(p.map((x) => x.label)).toEqual(["15%", "18%", "20%"]);
    expect(p.map((x) => charged(3200, x.rate))).toEqual([480, 576, 640]);
  });

  it("a SMALL basket gets flat dollars, and each label is exactly what gets charged (net $6.00)", () => {
    const p = tipPresets(600);
    expect(p.map((x) => x.label)).toEqual(["$1.00", "$2.00", "$3.00"]);
    // The whole point of the flat unit: the chip says $2.00 and the server charges 200, not 18%-of-6.
    expect(p.map((x) => charged(600, x.rate))).toEqual([100, 200, 300]);
  });

  it("the boundary belongs to percentages — exactly at the ceiling is a LARGE basket", () => {
    expect(tipPresets(SMALL_BASKET_CEILING_CENTS).map((x) => x.label)).toEqual([
      "15%",
      "18%",
      "20%",
    ]);
    expect(tipPresets(SMALL_BASKET_CEILING_CENTS - 1).map((x) => x.label)).toEqual([
      "$1.00",
      "$2.00",
      "$3.00",
    ]);
  });

  it("never offers a chip the server would refuse (net $4.00 — $3 is 75%)", () => {
    const p = tipPresets(400);
    // $1 = 25%, $2 = 50% (exactly at the cap, allowed), $3 = 75% (refused, so never shown).
    expect(p.map((x) => x.label)).toEqual(["$1.00", "$2.00"]);
    expect(p.every((x) => x.rate <= TIP_RATE_MAX)).toBe(true);
  });

  it.each([0, -1, NaN])(
    "a non-positive base (%s) offers nothing — a rate against 0 is undefined",
    (net) => {
      expect(tipPresets(net)).toEqual([]);
    },
  );

  it("every preset it EVER offers is inside the server's cap", () => {
    // Sweep the basket sizes a real order can take, not one convenient fixture.
    for (let net = 25; net <= 50000; net += 25) {
      for (const p of tipPresets(net)) {
        expect(p.rate).toBeLessThanOrEqual(TIP_RATE_MAX);
        // Valid on BOTH settlement paths — the table may split after the tip is chosen.
        expect(createIntentInput.safeParse({ cartId: CART, tipRate: p.rate }).success).toBe(true);
        expect(shareIntentInput.safeParse({ cartId: CART, tipRate: p.rate }).success).toBe(true);
      }
    }
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
    for (let net = 25; net <= 20000; net += 25) {
      for (let extra = 0; extra < 100; extra += 7) {
        const due = net + extra;
        const r = roundUpTip(net, due);
        if (r === null) continue;
        expect(r.rate).toBeLessThanOrEqual(TIP_RATE_MAX);
        expect(r.targetCents % 100).toBe(0);
        expect(r.targetCents).toBe(due + r.tipCents);
        // And the promise holds through the real charge formula, at every size.
        expect(charged(net, r.rate)).toBe(r.tipCents);
      }
    }
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
