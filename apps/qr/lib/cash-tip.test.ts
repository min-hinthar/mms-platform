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
      // A TRUST tab, so the tab-close audit row is written — that row is the reconciliation record
      // the W17c-2 review found quoting a pre-tip total.
      cart: { id: CART, tab_type: "trust" },
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
const tabEvents: Record<string, unknown>[] = [];
vi.mock("./tab-events", () => ({
  logTabEvent: (e: Record<string, unknown>) => {
    tabEvents.push(e);
    return Promise.resolve();
  },
}));

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
/** What the persisted order row answers for total_cents — per-test settable. `null` means "mirror
 *  the request" (TOTALS.totalCents + the test's tip), matching a settle that recorded this call. */
let orderRowTotal: number = 0;
let orderRowTip: number = 0;
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      // W21d — settleCash now reads BACK the persisted order row (`.select().eq().single()`), so
      // the mock answers that chain with the ledger's truth: `orderRowTotal` (settable per test)
      // models the RPC's early-return case where the recorded total differs from this request's.
      if (table === "qr_orders") {
        const order: Record<string, unknown> = {
          select: () => order,
          eq: () => order,
          single: () =>
            Promise.resolve({
              data: { total_cents: orderRowTotal, tip_cents: orderRowTip },
              error: null,
            }),
        };
        return order;
      }
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
  tabEvents.length = 0;
  orderRowTotal = TOTALS.totalCents; // no-tip default; tipped tests set their own
  orderRowTip = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("settleCash — the cash tip is recorded, and the collected total includes it", () => {
  it("sends the typed tip to the RPC alongside the SERVER's own figures", async () => {
    orderRowTotal = 4368; // what the ledger recorded for this settle (3868 + 500)
    orderRowTip = 500;
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
    orderRowTotal = 4368;
    orderRowTip = 500;
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

  it("the tab-close AUDIT row records the collected total, not the pre-tip one", async () => {
    // T13's walk-out / discretion reconciliation record. A pre-tip figure here reads as an
    // unexplained gap against qr_orders.total_cents — the exact discrepancy an auditor would chase.
    orderRowTotal = 4368;
    await settleCash({ sessionId: SESSION, tipCents: 500 });
    const closed = tabEvents.find((e) => e.event === "closed");
    expect(closed?.amountCents).toBe(4368);
    expect(closed?.amountCents).not.toBe(3868);
  });

  it("W21d — the PERSISTED order's total outranks the request echo (a raced duplicate settle)", async () => {
    // Two same-staff tabs can both pass acquireSettlement; the second RPC early-returns the FIRST
    // request's order without applying this request's tip. The change/handoff/audit figure must be
    // what the ledger recorded, not this request's arithmetic.
    orderRowTotal = 3868; // the first request settled tip-free; this one asks for 500
    orderRowTip = 0;
    const r = await settleCash({ sessionId: SESSION, tipCents: 500 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totalCents).toBe(3868);
    if (r.ok) expect(r.tipCents).toBe(0); // the persisted tip, not this request's unrecorded 500
    const closed = tabEvents.find((e) => e.event === "closed");
    expect(closed?.amountCents).toBe(3868);
  });

  it("accepts the cap exactly — the bound refuses what is over it, not what is at it", async () => {
    orderRowTotal = TOTALS.totalCents + 100000;
    orderRowTip = 100000;
    const r = await settleCash({ sessionId: SESSION, tipCents: 100000 });
    expect(r.ok).toBe(true);
    expect(fulfill()?.args.p_tip_cents).toBe(100000);
  });
});
