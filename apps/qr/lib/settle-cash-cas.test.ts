import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2c · register — the cash settle's COMPARE-AND-SWAP (owner decision: "the server refuses a
 * moved total and shows both figures").
 *
 * The sheet quotes `detail.settleTotalCents` — `getCartTotals(cart, 0).totalCents` from the last poll,
 * up to a refresh stale. `settleCash` re-derives the total from the live lines and records THAT, so
 * without a compare the cashier collects $X while the ledger records $Y (a qty step, a promo, a guest
 * adding from their phone inside the window). `quotedCents` is COMPARE-ONLY: it never reaches the RPC
 * or any amount; a mismatch refuses BEFORE the RPC with `code: "moved"` and the server's own figure,
 * and the freeze taken for the attempt is released on that path (the existing `finally`).
 *
 * The fixture's tip is 500, so the pre-tip total (3868) and the all-in figure (4368) SEPARATE: a
 * compare against total + tip refuses the honest quote, and one that passes it lets the stale one by.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./staff", () => ({
  staffGate: () => Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
const CART = "33333333-3333-4333-8333-333333333333";
const SESSION = "22222222-2222-4222-8222-222222222222";
/** P2w — the cart's freeze fields, per case (a fresh freeze no seat owns is the register's own). */
let cartFreeze: { settle_at: string | null; settle_by: string | null } = {
  settle_at: null,
  settle_by: null,
};
vi.mock("./staff-open-cart", () => ({
  openCartFor: () =>
    Promise.resolve({
      session: { id: SESSION, mode: "dinein" },
      cart: { id: CART, tab_type: "none", locked: false, locked_at: null, ...cartFreeze },
      unavailable: false,
    }),
  closeCounterStyleSession: () => Promise.resolve(),
}));
let inFlight: "mid_payment" | null = null;
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(inFlight) }));
/** Every acquire and release, in order, with its owner — so "the freeze taken is the freeze
 *  released" is a VALUE, not a count. */
const lockCalls: { op: "acquire" | "release"; cartId: string; owner: string }[] = [];
vi.mock("./lock", () => ({
  acquireSettlement: (cartId: string, owner: string) => {
    lockCalls.push({ op: "acquire", cartId, owner });
    return Promise.resolve("acquired");
  },
  releaseSettlementFor: (cartId: string, owner: string) => {
    lockCalls.push({ op: "release", cartId, owner });
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
vi.mock("./stripe", () => ({ getStripe: () => null }));
vi.mock("./tab-events", () => ({ logTabEvent: () => Promise.resolve() }));

// The server's live breakdown — TIP-FREE (getCartTotals is called with tipRate 0), exactly the
// quantity `detail.settleTotalCents` quotes.
const TOTALS = {
  subtotalCents: 4000,
  discountCents: 500,
  promoCents: 0,
  rewardCents: 0,
  serviceChargeCents: 0,
  taxCents: 368,
  tipCents: 0,
  totalCents: 3868,
};
const totalsCalls: number[] = [];
vi.mock("./totals", () => ({
  getCartTotals: (_cart: string, rate: number) => {
    totalsCalls.push(rate);
    return Promise.resolve(TOTALS);
  },
}));

const rpcCalls: string[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table === "session_members") {
        // P2w — the freeze owner's seat read: no seat of this session owns a register attempt.
        const members: Record<string, unknown> = {
          select: () => members,
          eq: () => members,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        };
        return members;
      }
      if (table === "qr_orders") {
        const order: Record<string, unknown> = {
          select: () => order,
          eq: () => order,
          single: () =>
            Promise.resolve({ data: { total_cents: 4368, tip_cents: 500 }, error: null }),
        };
        return order;
      }
      const counted: Record<string, unknown> = {
        select: () => counted,
        eq: () => Promise.resolve({ count: 3, error: null }),
      };
      return counted;
    },
    rpc: (fn: string) => {
      rpcCalls.push(fn);
      if (fn === "mms_fulfill_cash_order") return Promise.resolve({ data: "order-1", error: null });
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { settleCash } = await import("./staff-cart");
const settled = () => rpcCalls.includes("mms_fulfill_cash_order");

beforeEach(() => {
  inFlight = null;
  cartFreeze = { settle_at: null, settle_by: null };
  rpcCalls.length = 0;
  lockCalls.length = 0;
  totalsCalls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("settleCash — the quote the cashier read is compared inside the freeze", () => {
  it("a quote equal to the live PRE-TIP total settles, and records the server's figures", async () => {
    // MUTATION: compare against `totals.totalCents + tipCents` — the honest quote (3868) now reads
    // as 4368 ≠ 3868 and every tipped settle is refused; red.
    const r = await settleCash({ sessionId: SESSION, tipCents: 500, quotedCents: 3868 });
    expect(r).toEqual({ ok: true, orderId: "order-1", totalCents: 4368, tipCents: 500 });
    expect(settled()).toBe(true);
  });

  it("a quote that moved refuses with `moved` and the server's figure, BEFORE the RPC — and the freeze is released under the owner that took it", async () => {
    // The ALL-IN figure is a stale quote too (the sheet quotes pre-tip): refused.
    // MUTATION: delete the comparison — the RPC runs and records 3868 for a 4368 quote; red.
    const r = await settleCash({ sessionId: SESSION, tipCents: 500, quotedCents: 4368 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("moved");
    if (r.code !== "moved") return;
    expect(r.totalCents).toBe(3868);
    expect(settled()).toBe(false);
    // Compared AFTER the live derivation (the figure it names is that derivation's, never a stale one).
    expect(totalsCalls).toEqual([0]);
    // MUTATION: `return` the refusal from outside the try (before the freeze's `finally`) — the
    // release is skipped and the table strands frozen for the full TTL; red.
    const acquired = lockCalls.filter((c) => c.op === "acquire");
    const released = lockCalls.filter((c) => c.op === "release");
    expect(acquired).toHaveLength(1);
    expect(released).toEqual([{ op: "release", cartId: CART, owner: acquired[0]!.owner }]);
    expect(lockCalls.map((c) => c.op)).toEqual(["acquire", "release"]);
  });

  it.each([
    ["one cent low", 3867],
    ["one cent high", 3869],
  ])("a quote %s is refused — any difference, in either direction", async (_why, quotedCents) => {
    // MUTATION: `!==` → `>` — the LOW quote passes and the ledger records a total the cashier never
    // read; red on 3867.
    const r = await settleCash({ sessionId: SESSION, tipCents: 500, quotedCents });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("moved");
    expect(settled()).toBe(false);
  });

  it("an absent quote settles (a counter tablet open across a deploy still takes payment)", async () => {
    const r = await settleCash({ sessionId: SESSION, tipCents: 500 });
    expect(r.ok).toBe(true);
    expect(settled()).toBe(true);
  });

  it.each([
    ["negative", -1],
    ["fractional", 3868.5],
    ["past the bound", 10_000_001],
  ])("a %s quote is refused at the schema — nothing is frozen, nothing settles", async (_w, q) => {
    const r = await settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: q });
    expect(r).toEqual({ ok: false, error: "Invalid request." });
    expect(lockCalls).toEqual([]);
    expect(settled()).toBe(false);
  });
});

describe("settleCash — refused mid-payment, TRUTHFULLY and as a typed code (P2w, critic finding)", () => {
  it("the register's own held freeze is refused as the register's — a code and a holder, never 'their phone'", async () => {
    inFlight = "mid_payment";
    cartFreeze = { settle_at: new Date().toISOString(), settle_by: "attempt-uuid" };
    const r = await settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: 3868 });
    // MUTATION: restore the fixed "their phone" refusal at this call site — red.
    expect(r).toMatchObject({ ok: false, code: "inflight", holder: "register" });
    if (r.ok) return;
    expect(r.error).not.toMatch(/their phone/);
    // Refused BEFORE the freeze: nothing taken, nothing recorded.
    expect(lockCalls).toEqual([]);
    expect(settled()).toBe(false);
  });
});
