import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2c · register (P2aa) — the compare-and-swap on `closeSecureTab`'s "Charge $x" confirm. The
 * same stale-quote class as the cash settle: the confirm quotes the last-polled total, the server
 * charges `getCartTotals` live. A quote that is not the live total refuses with `code: "moved"` and
 * the server's figure BEFORE any PaymentIntent exists, and the freeze taken for the attempt is
 * released (this path has no blanket `finally` — its success arm deliberately HOLDS the freeze).
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
/** P2w — the cart's freeze fields, per case. */
let cartFreeze: { settle_at: string | null; settle_by: string | null } = {
  settle_at: null,
  settle_by: null,
};
vi.mock("./staff-open-cart", () => ({
  openCartFor: () =>
    Promise.resolve({
      session: { id: SESSION, mode: "dinein" },
      cart: { id: CART, tab_type: "secure", locked: false, locked_at: null, ...cartFreeze },
      unavailable: false,
    }),
  closeCounterStyleSession: () => Promise.resolve(),
}));
let inFlight: "mid_payment" | null = null;
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(inFlight) }));
const lockCalls: { op: "acquire" | "release"; owner: string }[] = [];
vi.mock("./lock", () => ({
  acquireSettlement: (_cart: string, owner: string) => {
    lockCalls.push({ op: "acquire", owner });
    return Promise.resolve("acquired");
  },
  releaseSettlementFor: (_cart: string, owner: string) => {
    lockCalls.push({ op: "release", owner });
    return Promise.resolve({ released: true, error: null });
  },
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
vi.mock("./tab-events", () => ({ logTabEvent: () => Promise.resolve() }));
vi.mock("./totals", () => ({
  getCartTotals: () =>
    Promise.resolve({
      subtotalCents: 4000,
      discountCents: 500,
      promoCents: 0,
      rewardCents: 0,
      serviceChargeCents: 0,
      taxCents: 368,
      tipCents: 0,
      totalCents: 3868,
    }),
}));
const created: { amount: number }[] = [];
vi.mock("./stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: (p: { amount: number }) => {
        created.push({ amount: p.amount });
        return Promise.resolve({ status: "succeeded" });
      },
    },
  }),
}));
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        maybeSingle: () =>
          Promise.resolve(
            table === "session_members"
              ? // P2w — no seat owns the freeze: it is a register attempt's.
                { data: null, error: null }
              : {
                  data: { stripe_customer_id: "cus_1", stripe_payment_method_id: "pm_1" },
                  error: null,
                },
          ),
      };
      return q;
    },
  }),
}));

const { closeSecureTab } = await import("./staff-cart");

beforeEach(() => {
  lockCalls.length = 0;
  created.length = 0;
  inFlight = null;
  cartFreeze = { settle_at: null, settle_by: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("closeSecureTab — the confirm's quote is compared before any charge (P2aa)", () => {
  it("a quote equal to the live total charges the SERVER's figure", async () => {
    const r = await closeSecureTab({ sessionId: SESSION, quotedCents: 3868 });
    expect(r).toEqual({ ok: true });
    expect(created).toEqual([{ amount: 3868 }]);
  });

  it("a moved quote refuses with `moved` and the server's figure — no PaymentIntent, and the freeze released under its own owner", async () => {
    // MUTATION: delete the comparison — a PaymentIntent is created for a total the staff never saw; red.
    const r = await closeSecureTab({ sessionId: SESSION, quotedCents: 4210 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("moved");
    if (r.code !== "moved") return;
    expect(r.totalCents).toBe(3868);
    expect(created).toEqual([]);
    // MUTATION: drop the release on the moved path — the table strands frozen for the TTL; red.
    expect(lockCalls).toEqual([
      { op: "acquire", owner: lockCalls[0]!.owner },
      { op: "release", owner: lockCalls[0]!.owner },
    ]);
  });

  it.each([3867, 3869])("a quote one cent off (%i) is refused too", async (quotedCents) => {
    const r = await closeSecureTab({ sessionId: SESSION, quotedCents });
    expect(r.ok).toBe(false);
    expect(created).toEqual([]);
  });

  it("an absent quote charges (an older tablet across a deploy)", async () => {
    const r = await closeSecureTab({ sessionId: SESSION });
    expect(r).toEqual({ ok: true });
    expect(created).toEqual([{ amount: 3868 }]);
  });
});

describe("closeSecureTab — the retry after an unknown outcome is refused TRUTHFULLY (P2w)", () => {
  it("the register's own held freeze is named as the register's, never a guest's phone", async () => {
    // The unknown-outcome arm HOLDS its freeze under a per-request uuid — no seat owns it.
    inFlight = "mid_payment";
    cartFreeze = { settle_at: new Date().toISOString(), settle_by: "attempt-uuid" };
    const r = await closeSecureTab({ sessionId: SESSION, quotedCents: 3868 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // MUTATION: restore the fixed "their phone" sentence at this refusal — red.
    expect(r.error).not.toMatch(/their phone/);
    expect(r.error).toMatch(/started at the register/);
    expect(created).toEqual([]);
    expect(lockCalls).toEqual([]);
  });
});
