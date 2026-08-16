import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W17c-2 — the cash tip. `settleCash` previously passed `p_tip_cents: 0` unconditionally and the
 * code called cash tips "in-hand/off-system": an honest description of where the money goes and a
 * wrong description of the books, since the tip is part of what the cashier collected.
 *
 * This is the ONE amount on the money path a human supplies, because the server has nothing to
 * derive it from — only the person who took the cash knows what was left. So the rules that keep it
 * honest are pinned here:
 *   - the typed tip reaches the RPC (it used to be a hardcoded 0);
 *   - every OTHER figure stays server-derived from `getCartTotals`, which the client never supplies;
 *   - the returned total is the ALL-IN collected amount — `getCartTotals` was called with tipRate 0,
 *     so its total is tip-free and the tip must be added, or the change helper short-changes the
 *     guest by exactly the tip;
 *   - the bound is refused rather than clamped, and refused BEFORE any settle happens.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// after() must run INLINE here: settleCash drains its side-effects through it, and the real one
// throws outside a request scope.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

vi.mock("./staff", () => ({
  staffGate: () => Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
const CART = "33333333-3333-4333-8333-333333333333";
const SESSION = "22222222-2222-4222-8222-222222222222";
vi.mock("./staff-open-cart", () => ({
  openCartFor: () =>
    Promise.resolve({
      session: { id: SESSION, mode: "dinein" },
      cart: { id: CART },
      unavailable: false,
    }),
  closeCounterStyleSession: () => Promise.resolve(),
}));
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(null) }));
vi.mock("./lock", () => ({
  acquireSettlement: () => Promise.resolve("acquired"),
  releaseSettlement: () => Promise.resolve(),
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
vi.mock("./stripe", () => ({ getStripe: () => null }));
vi.mock("./tab-events", () => ({ logTabEvent: () => Promise.resolve() }));

// The server's own breakdown — TIP-FREE by construction (getCartTotals is called with tipRate 0).
const TOTALS = {
  subtotalCents: 4000,
  discountCents: 500,
  rewardCents: 0,
  serviceChargeCents: 0,
  taxCents: 368,
  tipCents: 0,
  totalCents: 3868,
};
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(TOTALS) }));

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => Promise.resolve({ count: 3, error: null }),
        eq: () => chain,
        update: () => chain,
      };
      // The item COUNT probe uses .select(...).eq(...) and awaits the eq — model both orders.
      const counted: Record<string, unknown> = {
        select: () => counted,
        eq: () => Promise.resolve({ count: 3, error: null }),
        update: () => counted,
      };
      return counted;
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "mms_fulfill_cash_order") return Promise.resolve({ data: "order-1", error: null });
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { settleCash } = await import("./staff-cart");

const fulfill = () => rpcCalls.find((c) => c.fn === "mms_fulfill_cash_order");

beforeEach(() => {
  rpcCalls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("settleCash — the cash tip is recorded, and the collected total includes it", () => {
  it("sends the typed tip to the RPC alongside the SERVER's own figures", async () => {
    const r = await settleCash({ sessionId: SESSION, tipCents: 500 });
    expect(r.ok).toBe(true);
    expect(fulfill()?.args).toEqual({
      p_cart_id: CART,
      p_settled_by: "s-1",
      // Every one of these comes from getCartTotals — the client supplies none of them.
      p_subtotal_cents: 4000,
      p_discount_cents: 500,
      p_service_charge_cents: 0,
      p_tax_cents: 368,
      // ...except this one, which only the cashier can know.
      p_tip_cents: 500,
    });
  });

  it("returns the ALL-IN collected total — the tip-free total plus the tip", async () => {
    // 3868 + 500. The change helper reads this; quoting the tip-free 3868 would hand back 500 cents
    // too much change on a $50 tender.
    const r = await settleCash({ sessionId: SESSION, tipCents: 500 });
    expect(r).toEqual({ ok: true, orderId: "order-1", totalCents: 4368, tipCents: 500 });
  });

  it("no tip is the unchanged behaviour — 0 recorded, total untouched", async () => {
    const r = await settleCash({ sessionId: SESSION });
    expect(fulfill()?.args.p_tip_cents).toBe(0);
    expect(r).toEqual({ ok: true, orderId: "order-1", totalCents: 3868, tipCents: 0 });
  });

  it.each([
    ["negative — it would REDUCE the recorded total, a discount wearing a tip's name", -500],
    ["over the $1,000 cap — a mis-key, not a tip", 100001],
    ["fractional cents", 500.5],
  ])("refuses a tip that is %s, and settles nothing", async (_why, tipCents) => {
    const r = await settleCash({ sessionId: SESSION, tipCents });
    expect(r).toEqual({ ok: false, error: "Invalid request." });
    // Refused BEFORE the settle: no order was created that would have to be unwound.
    expect(fulfill()).toBeUndefined();
  });

  it("accepts the cap exactly — the bound refuses what is over it, not what is at it", async () => {
    const r = await settleCash({ sessionId: SESSION, tipCents: 100000 });
    expect(r.ok).toBe(true);
    expect(fulfill()?.args.p_tip_cents).toBe(100000);
  });
});
