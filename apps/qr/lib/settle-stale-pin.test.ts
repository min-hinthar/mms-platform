import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M268 — the register's cash settle charges a total re-derived WITHOUT a pin a dead card attempt left.
 *
 * `mms_promo_discount` honours any non-null `promo_granted_cents` outright (m70), so before M268 a pin
 * an abandoned attempt left behind priced the counter's settle with a discount a different basket
 * earned. This suite runs the REAL `settleCash` and the REAL `acquireSettlementSuperseding`; only the
 * database is faked, as one cart row whose pin the fake totals read exactly the way the SQL does:
 * the pin when it is set, the live promo derivation otherwise. Each MUTATION is a row in
 * scripts/verify-slice.mjs (`m268/…`), induced and watched go red.
 *
 * The SQL half — the release's guards, and that a released pin re-derives live — is
 * `supabase/tests/m268_settlement_releases_stale_pin_test.sql`.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./staff", () => ({
  staffGate: () => Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
const CART = "44444444-4444-4444-8444-444444444444";
const SESSION = "55555555-5555-4555-8555-555555555555";
vi.mock("./staff-open-cart", () => ({
  openCartFor: () =>
    Promise.resolve({
      session: { id: SESSION, mode: "dinein" },
      cart: {
        id: CART,
        tab_type: "none",
        locked: false,
        locked_at: null,
        settle_at: null,
        settle_by: null,
      },
      unavailable: false,
    }),
  closeCounterStyleSession: () => Promise.resolve(),
}));
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(null) }));

/** The cart row, as far as this rule reads it. */
const row: { pin: number | null; settleBy: string | null; linked: string | null } = {
  pin: null,
  settleBy: null,
  linked: null,
};
/** What the applied promo code is worth LIVE on today's basket (`mms_promo_discount_live`). */
let livePromoCents = 0;
/** The release refuses as the SQL does when its guards do not hold. */
let releaseBlocked = false;
const events: string[] = [];
vi.mock("./lock", () => ({
  acquireSettlement: (_cart: string, owner: string) => {
    events.push("acquire");
    row.settleBy = owner;
    return Promise.resolve("acquired");
  },
  releaseSettlementFor: () => {
    events.push("freeze-released");
    return Promise.resolve({ released: true, error: null });
  },
  // `mms_release_promo_grant_for_settlement`'s contract, in one place: THIS fresh freeze, an
  // unlinked cart — and only a refusal under THIS freeze, blocked by a live link, is `linked`.
  releasePromoGrantFor: (_cart: string, holder: { settlement?: string }) => {
    events.push("pin-release");
    const held = !releaseBlocked && holder.settlement === row.settleBy;
    if (!held)
      return Promise.resolve({
        message: "this settlement does not hold the cart (the release answered -1)",
      });
    if (row.linked !== null)
      return Promise.resolve({
        message: "a live intent is linked under this settlement's freeze",
        linked: true,
      });
    row.pin = null;
    return Promise.resolve(null);
  },
  readLiveIntent: () => Promise.resolve(row.linked),
  // Held whenever the release's fake says so (THIS owner); the link and the proof from one row.
  readLiveIntentUnderFreeze: (_cart: string, owner: string) =>
    Promise.resolve(!releaseBlocked && owner === row.settleBy ? row.linked : null),
  claimStaleSettlement: () => Promise.resolve({ claimed: false, error: null }),
  // Pin AND link, keyed on the intent — a link someone else already dropped matches nothing.
  releaseByIntent: (_cart: string, intentId: string) => {
    if (row.linked !== intentId) return Promise.resolve({ released: false, error: null });
    row.linked = null;
    row.pin = null;
    return Promise.resolve({ released: true, error: null });
  },
  readLiveIntentFor: () => Promise.resolve(null),
  releasePayAttempt: () => Promise.resolve({ released: false, error: null }),
  unlinkPaymentIntent: () => Promise.resolve(null),
}));
vi.mock("./unsent-read", () => ({
  readKitchenDraftUnits: () => Promise.resolve(0),
  kitchenDraftUnits: () => Promise.resolve(0),
}));
vi.mock("./tax", () => ({ lineTax: () => 0 }));
vi.mock("./order-lines", () => ({
  insertOrIncLine: () => Promise.resolve(),
  priceItem: () => Promise.resolve({}),
  touchCart: () => Promise.resolve(),
}));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
/** The linked attempt as Stripe reports it; `onRetrieve` lands a write between the read and the clear. */
let stripeStatus: string | null = null;
let onRetrieve: (() => void) | null = null;
vi.mock("./stripe", () => ({
  getStripe: () =>
    stripeStatus === null
      ? null
      : {
          paymentIntents: {
            retrieve: (id: string) => {
              onRetrieve?.();
              return Promise.resolve({
                id,
                status: stripeStatus,
                capture_method: "automatic",
                metadata: {},
              });
            },
          },
        },
}));
vi.mock("./tab-events", () => ({ logTabEvent: () => Promise.resolve() }));

const SUBTOTAL = 2400;
// `mms_promo_discount`: the pin wins outright when set (m70), the live derivation otherwise.
vi.mock("./totals", () => ({
  getCartTotals: () => {
    events.push("totals");
    const discount = row.pin ?? livePromoCents;
    return Promise.resolve({
      subtotalCents: SUBTOTAL,
      discountCents: discount,
      promoCents: discount,
      rewardCents: 0,
      serviceChargeCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: SUBTOTAL - discount,
    });
  },
}));

let fulfilled: Record<string, unknown> | null = null;
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table === "qr_orders") {
        const order: Record<string, unknown> = {
          select: () => order,
          eq: () => order,
          single: () =>
            Promise.resolve({
              data: {
                total_cents:
                  Number(fulfilled?.p_subtotal_cents ?? 0) -
                  Number(fulfilled?.p_discount_cents ?? 0),
                tip_cents: 0,
              },
              error: null,
            }),
        };
        return order;
      }
      const counted: Record<string, unknown> = {
        select: () => counted,
        eq: () => Promise.resolve({ count: 1, error: null }),
      };
      return counted;
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === "mms_fulfill_cash_order") {
        fulfilled = args;
        return Promise.resolve({ data: "order-1", error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { settleCash } = await import("./staff-cart");

beforeEach(() => {
  row.pin = null;
  row.settleBy = null;
  row.linked = null;
  livePromoCents = 0;
  releaseBlocked = false;
  events.length = 0;
  fulfilled = null;
  stripeStatus = null;
  onRetrieve = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("M268 — the register's cash settle never charges a dead attempt's pinned discount", () => {
  it("a stale $10 pin over a basket that earns nothing: the counter charges the UN-discounted total", async () => {
    // MUTATION: the settlement's ordinary path skips the release (`m268/ordinary-path-skips-the-
    // release`) → the totals read the pin and the cash order records a $10 discount; red.
    row.pin = 1000;
    livePromoCents = 0;
    const r = await settleCash({ sessionId: SESSION, tipCents: 0 });
    expect(r.ok).toBe(true);
    expect(fulfilled?.p_discount_cents).toBe(0);
    expect(fulfilled?.p_subtotal_cents).toBe(SUBTOTAL);
    if (r.ok) expect(r.totalCents).toBe(SUBTOTAL);
    // Released under the freeze, BEFORE the total was read.
    expect(events.indexOf("pin-release")).toBeGreaterThan(events.indexOf("acquire"));
    expect(events.indexOf("pin-release")).toBeLessThan(events.indexOf("totals"));
  });

  it("a promo applied at the register still discounts — re-derived live, not the stale pin's figure", async () => {
    // A stale $5 pin over a basket the applied code is worth $8 on today: the cash total carries
    // the $8 the promo earns NOW. MUTATION: a release that also drops the applied promo (the SQL
    // mutant in the m268 SQL test) — here, the live value ignored → $0; red either way.
    row.pin = 500;
    livePromoCents = 800;
    const r = await settleCash({ sessionId: SESSION, tipCents: 0 });
    expect(r.ok).toBe(true);
    expect(fulfilled?.p_discount_cents).toBe(800);
  });

  it("no pin: the applied promo discounts exactly as before", async () => {
    livePromoCents = 800;
    const r = await settleCash({ sessionId: SESSION, tipCents: 0 });
    expect(r.ok).toBe(true);
    expect(fulfilled?.p_discount_cents).toBe(800);
  });

  it("a dead attempt still LINKED: superseded at Stripe, unlinked with its pin, re-proved — and the counter charges the UN-discounted total", async () => {
    // The `linked` refusal, end to end through the real `settleCash`: the link is read under the
    // freeze, Stripe reports the attempt dead, `releaseByIntent` clears pin and link together, and
    // the release runs AGAIN before any total is read.
    row.pin = 1000;
    row.linked = "pi_dead";
    stripeStatus = "canceled";
    const r = await settleCash({ sessionId: SESSION, tipCents: 0 });
    expect(r.ok).toBe(true);
    expect(fulfilled?.p_discount_cents).toBe(0);
    expect(events.filter((e) => e === "pin-release")).toHaveLength(2);
    expect(events.lastIndexOf("pin-release")).toBeLessThan(events.indexOf("totals"));
  });

  it("a link dropped by another write between the read and the clear leaves the pin — the re-proof clears it before any total is read (the blind pass on 5d19601)", async () => {
    // `unlinkPaymentIntent` (a successor's supersede) and a late webhook drop the LINK, and the
    // first of them leaves the pin; `releaseByIntent` then matches nothing (`released: false`).
    // MUTATION: answer `acquired` straight after `releaseByIntent` (`m268/linked-path-skips-the-
    // re-proof`) → the cash order records the dead attempt's $10 discount; red.
    row.pin = 1000;
    row.linked = "pi_dead";
    stripeStatus = "canceled";
    onRetrieve = () => {
      row.linked = null; // unlinked, pin left behind
    };
    const r = await settleCash({ sessionId: SESSION, tipCents: 0 });
    expect(r.ok).toBe(true);
    expect(fulfilled?.p_discount_cents).toBe(0);
    if (r.ok) expect(r.totalCents).toBe(SUBTOTAL);
  });

  it("a release the database refuses records NOTHING — no total is read over the pin, and the freeze goes back", async () => {
    // MUTATION: proceed on a refused release (`m268/refused-release-settles-anyway`) → the cash
    // order is recorded at the pinned discount; red.
    row.pin = 1000;
    releaseBlocked = true;
    const r = await settleCash({ sessionId: SESSION, tipCents: 0 });
    expect(r.ok).toBe(false);
    expect(fulfilled).toBeNull();
    expect(events).not.toContain("totals");
    expect(events).toContain("freeze-released");
  });
});
