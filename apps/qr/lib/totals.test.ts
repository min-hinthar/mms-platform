import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W10c (M30) — the charge authority must never answer with a number it isn't sure of.
 *
 * `getCartTotals` is the ONLY source of the amount that reaches Stripe (create-intent) and the
 * figure the webhook reconciles a real charge against. postgrest-js does not reject on a network
 * failure — it RESOLVES `{ data: null, error }` — so before this guard an outage produced a
 * confident, perfectly-shaped total of zero, and a PARTIAL failure (items readable, discount not)
 * produced a total that silently OVERCHARGED the diner by the discount they could see on screen.
 *
 * These tests pin the rule that makes both impossible: any unreadable read throws. The happy-path
 * case is deliberate — without it a mutant that made the function throw unconditionally would still
 * pass, and the suite would be proving nothing.
 */

// `totals.ts` is server-only; under vitest that package resolves to its browser build, which throws
// on import. Stub it to a no-op so the module under test can load (it changes nothing about the
// behaviour being pinned — the real bundler still enforces the server boundary).
vi.mock("server-only", () => ({}));

type Res = { data: unknown; error: { message: string } | null };

// Mutable per-test script for the three reads getCartTotals performs, in order.
const script: { items: Res; promo: Res; reward: Res } = {
  items: { data: [], error: null },
  promo: { data: 0, error: null },
  reward: { data: 0, error: null },
};

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve(script.items),
      }),
    }),
    rpc: (name: string) =>
      Promise.resolve(name === "mms_promo_discount" ? script.promo : script.reward),
  }),
}));

const { getCartTotals } = await import("./totals");

const LINE = {
  qty: 2,
  unit_price_cents: 1000,
  tax_cents: 88,
  state: "fired",
  comped: false,
  fulfillment: "dinein",
};

beforeEach(() => {
  script.items = { data: [LINE], error: null };
  script.promo = { data: 0, error: null };
  script.reward = { data: 0, error: null };
});

describe("getCartTotals — never returns a total it isn't sure of (M30)", () => {
  it("returns real totals when every read succeeds", async () => {
    const totals = await getCartTotals("cart-1", 0);
    // Definitional, not transcribed: a chargeable line's subtotal is unit x qty.
    expect(totals.subtotalCents).toBe(LINE.unit_price_cents * LINE.qty);
    expect(totals.totalCents).toBeGreaterThan(0);
  });

  // ⚠️ Pre-PR review — WITHOUT this case the suite was degenerate on the half of the function it
  // actually owns. Every other test ran promo=0 and reward=0, so replacing the mapping with
  // `computeTotals(lines, 0, 0, tipRate)` — dropping BOTH RPC results on the floor — kept it 4/4
  // green. `totals-math.test.ts` pins the arithmetic; nothing pinned the wiring that feeds it.
  //
  // No number here is transcribed: the expectations are the two RPC values themselves, and a
  // DIFFERENCE measured against a second run of the same function. That is what separates the two
  // code paths — an assertion on a literal total would have to be recomputed by hand every time the
  // tax or service rule moves, and would tell us nothing about whether the discounts were wired in.
  it("feeds BOTH RPC discounts into the total (not just reads them)", async () => {
    const PROMO = 300; // what `mms_promo_discount` answers in this scenario
    const REWARD = 150; // …and `mms_reward_discount`
    const undiscounted = await getCartTotals("cart-1", 0);
    script.promo = { data: PROMO, error: null };
    script.reward = { data: REWARD, error: null };
    const discounted = await getCartTotals("cart-1", 0);

    // Both are definitional, per computeTotals' own contract: `discountCents` FOLDS promo+reward
    // (it's the base tax and service pro-rate against), `rewardCents` reports the reward limb alone.
    expect(discounted.discountCents).toBe(PROMO + REWARD);
    expect(discounted.rewardCents).toBe(REWARD);
    // Tax rides the DISCOUNTED base (W16a: the service charge is retired), so the all-in drop is
    // strictly LARGER than the discount itself — asserting an exact total here would be a
    // transcribed number that has to be re-derived by hand every time the tax rule moves.
    expect(undiscounted.totalCents - discounted.totalCents).toBeGreaterThan(PROMO + REWARD);
  });

  it("throws when the cart items are unreadable — never an empty cart", async () => {
    script.items = { data: null, error: { message: "fetch failed" } };
    await expect(getCartTotals("cart-1", 0)).rejects.toThrow(/cart items unreadable/);
  });

  it("throws when the promo discount is unreadable — never a silent overcharge", async () => {
    // The sharpest case: items read FINE, so the old code produced a complete-looking total with the
    // discount silently dropped to 0 — charging the diner more than the cart in front of them showed.
    script.promo = { data: null, error: { message: "fetch failed" } };
    await expect(getCartTotals("cart-1", 0)).rejects.toThrow(/promo discount unreadable/);
  });

  it("throws when the reward discount is unreadable", async () => {
    script.reward = { data: null, error: { message: "fetch failed" } };
    await expect(getCartTotals("cart-1", 0)).rejects.toThrow(/reward discount unreadable/);
  });
});
