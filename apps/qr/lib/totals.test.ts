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

// Mutable per-test script for the reads getCartTotals performs. `promo` is what
// `mms_promo_discount` answers (the pin when one is set, m70); `live` is `mms_promo_discount_live`
// (the code's worth on today's basket); `link` is the cart's `live_payment_intent_id` read, which
// only the QUOTE basis makes (M123 b).
const script: { items: Res; promo: Res; live: Res; reward: Res; link: Res } = {
  items: { data: [], error: null },
  promo: { data: 0, error: null },
  live: { data: 0, error: null },
  reward: { data: 0, error: null },
  link: { data: { live_payment_intent_id: null }, error: null },
};
/** Every `qr_carts` read this run made — the charge basis must make none. */
let linkReads = 0;

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) =>
      table === "qr_carts"
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: () => {
                  linkReads += 1;
                  return Promise.resolve(script.link);
                },
              }),
            }),
          }
        : {
            select: () => ({
              eq: () => Promise.resolve(script.items),
            }),
          },
    rpc: (name: string) =>
      Promise.resolve(
        name === "mms_promo_discount"
          ? script.promo
          : name === "mms_promo_discount_live"
            ? script.live
            : script.reward,
      ),
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
  script.live = { data: 0, error: null };
  script.reward = { data: 0, error: null };
  script.link = { data: { live_payment_intent_id: null }, error: null };
  linkReads = 0;
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

describe("PD2 (PATH_DESIGN moment 2) — two reads, ONE derivation: the guest's pass and Dad's pane agree", () => {
  // The guest's pass shows `totals.totalCents` from the view read; Dad's pane reads the floor's
  // settle quote (lib/floor.ts). Since M123 (b) both are ONE call, `getCartTotals(id, 0, "quote")`
  // (pinned at each site: cart-view-read.test.ts, floor-detail-promo.test.ts). This case still pins
  // the DEFAULT tip at 0 — the split's grand total (`getCartTotals(id)`) prices every share off it.
  // The same promo'd cart must answer the same figure from both calls, with the promo actually IN
  // it — otherwise the family holds up a phone that says one total while the register names another.
  it("a promo'd cart answers the same total from the default call and the explicit tip-0 call", async () => {
    const PROMO = 450;
    script.promo = { data: PROMO, error: null };
    const guest = await getCartTotals("cart-1");
    const pane = await getCartTotals("cart-1", 0);
    // MUTATION (totals/default-tip-not-zero): the default tip rate drifts off 0 — the guest's
    // figure grows by a tip no one chose while Dad's stays; red.
    expect(guest).toEqual(pane);
    expect(guest.promoCents).toBe(PROMO);
    expect(guest.tipCents).toBe(0);
    // …and the figure is the DISCOUNTED one, measured against the undiscounted run of the same cart
    // (never a transcribed total: tax follows the discounted base, so only the direction is pinned).
    script.promo = { data: 0, error: null };
    const undiscounted = await getCartTotals("cart-1", 0);
    expect(undiscounted.promoCents).toBe(0);
    expect(guest.totalCents).toBeLessThan(undiscounted.totalCents);
  });
});

describe("M123 (b) — the QUOTE basis: the pin only while an intent is live, the live figure otherwise", () => {
  // The two figures DIFFER on purpose, and neither is a transcribed total: a stale pin worth more
  // than the code is worth on today's basket (the registry's own case — a code applied at $60, the
  // basket edited down, a declined attempt, the basket edited back). Each assertion names which RPC
  // the discount came from by its value.
  const PIN = 1000; // `mms_promo_discount` — the pin wins outright when set (m70)
  const LIVE = 400; // `mms_promo_discount_live` — the code's worth on the basket as it stands
  beforeEach(() => {
    script.promo = { data: PIN, error: null };
    script.live = { data: LIVE, error: null };
  });

  it("quotes an UNLINKED cart live — a pin no intent names is a discount no door will charge", async () => {
    // MUTATION (m123/quote-reads-the-pin-unlinked): the quote ignores the link and reads the pin —
    // the review step shows $10 off while create-intent (which releases the pin first) and the
    // counter (M268's release) both charge the $4 the basket actually earns; red.
    const quoted = await getCartTotals("cart-1", 0, "quote");
    expect(quoted.promoCents).toBe(LIVE);
    expect(linkReads).toBe(1);
  });

  it("quotes a LINKED cart at its pin — the amount the live intent was minted at", async () => {
    // A declined card is retried inline against the SAME PaymentIntent, at its original,
    // pin-inclusive amount (lib/lock.ts `releasePromoGrantFor`, point 1), so the screen beside that
    // prompt must quote the same discount. MUTATION (m123/quote-always-live): red.
    script.link = { data: { live_payment_intent_id: "pi_live" }, error: null };
    const quoted = await getCartTotals("cart-1", 0, "quote");
    expect(quoted.promoCents).toBe(PIN);
  });

  it("the CHARGE basis never moves: the pin, whatever the link says, and no link read at all", async () => {
    // create-intent mints from this, the webhook reconciles a captured amount against it, and the
    // counter reads it only after M268's release. A charge that followed the quote rule would read
    // live in the window between `mms_pin_promo_grant` and `linkPaymentIntent` — a minted amount
    // and a reconcile that could disagree. MUTATION (m123/charge-follows-the-link,
    // m123/default-basis-is-the-quote): red.
    const byDefault = await getCartTotals("cart-1", 0);
    const explicit = await getCartTotals("cart-1", 0, "charge");
    expect(byDefault.promoCents).toBe(PIN);
    expect(explicit.promoCents).toBe(PIN);
    expect(linkReads).toBe(0);
  });

  it("THROWS when the link is unreadable — never a guess at which figure to quote", async () => {
    // A failed read resolves `{ data: null, error }`; read as "unlinked" it would quote live beside
    // a live intent that charges the pin. MUTATION (m123/unreadable-link-reads-as-unlinked): red.
    script.link = { data: null, error: { message: "fetch failed" } };
    await expect(getCartTotals("cart-1", 0, "quote")).rejects.toThrow(/payment link unreadable/);
  });
});
