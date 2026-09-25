import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2c · Codex round 3 (P1) — `staffSetQty` is a DRAFT edit. The RPC it calls
 * (`mms_cart_item_set_qty_if_open`) guards only the open cart, so a stepper tap queued behind a
 * Send (Next runs Server Actions one at a time) used to land on the line the Send had just fired:
 * the ticket read one quantity and the kitchen cooked another. A sent dish changes through the
 * loss flow (Remove / Make it free), never here — the action refuses before the RPC.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./staff", () => ({
  staffGate: () => Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
const CART = "66666666-6666-4666-8666-666666666666";
const SESSION = "77777777-7777-4777-8777-777777777777";
const LINE = "88888888-8888-4888-8888-888888888888";
vi.mock("./staff-open-cart", () => ({
  openCartFor: () =>
    Promise.resolve({
      session: { id: SESSION, mode: "dinein", qr_code: "t-7" },
      cart: { id: CART, tab_type: "none", locked: false, settle_at: null },
      unavailable: false,
    }),
  closeCounterStyleSession: () => Promise.resolve(),
}));
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(null) }));
vi.mock("./order-lines", () => ({
  insertOrIncLine: () => Promise.resolve(),
  priceItem: () => Promise.resolve({}),
  touchCart: () => Promise.resolve(),
}));

let lineState = "draft";
const rpc = vi.fn(() => Promise.resolve({ data: 1, error: null }));
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: { id: LINE, state: lineState }, error: null }),
          }),
        }),
      }),
    }),
    rpc,
  }),
}));

const { staffSetQty } = await import("./staff-cart");

beforeEach(() => {
  rpc.mockClear();
  lineState = "draft";
});

describe("staffSetQty — a draft edit only (Codex round 3, P1)", () => {
  it("a draft line's quantity changes", async () => {
    const r = await staffSetQty(SESSION, { cartItemId: LINE, qty: 2 });
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("mms_cart_item_set_qty_if_open", { p_id: LINE, p_qty: 2 });
  });

  it.each(["fired", "in_progress", "served"])(
    "a %s line is refused before the RPC — the kitchen's quantity is never changed under it",
    async (state) => {
      lineState = state;
      // MUTATION: drop the state check — the queued tap rewrites a fired line; red.
      const r = await staffSetQty(SESSION, { cartItemId: LINE, qty: 0 });
      expect(r.ok).toBe(false);
      expect(rpc).not.toHaveBeenCalled();
    },
  );
});
