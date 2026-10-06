import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * J37 — the diner's `undoFire` after a 0-row answer. `mms_undo_fire` reverses 0 lines for two facts:
 * the grace passed (the kitchen has the batch — `expired`), or an EARLIER undo of this batch landed and
 * its answer was lost (un-fire clears `fire_batch`, so no line carries it — `gone`). Before J37 the diner
 * heard "already with the kitchen" for both, so a re-ask after a lost response closed the window as
 * expired over dishes that were drafts. The diagnosis is the console's (`lib/undo-miss.ts`, moved out of
 * staff-send.ts), and it runs FOR REAL here through the mocked client — so these cases falsify the
 * wiring in cart.ts by VALUE, and the moved function's own rules for the diner's door.
 */
const h = vi.hoisted(() => ({
  unfired: 0 as number | null,
  rpcError: null as { message: string } | null,
  batchRows: [] as { id: string }[] | null,
  batchErr: null as { message: string } | null,
  rpcCalls: [] as { fn: string; args: unknown }[],
  filters: [] as [string, unknown][],
  touched: [] as string[],
  captured: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@mms/db/schemas", () => {
  const pass = { parse: (x: unknown) => x };
  return {
    addItemInput: pass,
    applyPromoInput: pass,
    applyRewardInput: pass,
    assignLineInput: pass,
    cartViewInput: pass,
    releaseAttemptInput: pass,
    makeItNowInput: pass,
    sendToKitchenInput: pass,
    setKioskTipInput: pass,
    setLineFulfillmentInput: pass,
    setQtyInput: pass,
    undoFireInput: pass,
  };
});
class FakeAuthzError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AuthzError";
  }
}
vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({
      uid: "u-1",
      sessionId: "s-1",
      role: "host",
      locked: false,
      lockedBy: null,
      settling: false,
      settleBy: null,
      mode: "dinein",
    }),
  assertCartItemMember: () => Promise.reject(new Error("not under test")),
  AuthzError: FakeAuthzError,
  UNAVAILABLE: () => new FakeAuthzError("We’re having trouble on our end", 503, "unavailable"),
}));
vi.mock("./rate", () => ({
  assertMutationRate: () => Promise.resolve(),
  withinMutationRate: () => Promise.resolve(true),
}));
vi.mock("./permissions", () => ({ canMutateLine: () => true }));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({
    capture: (e: { event: string }) => {
      h.captured.push(e.event);
    },
    flush() {},
  }),
}));
vi.mock("./order-lines", () => ({
  priceItem: () => Promise.resolve({}),
  insertOrIncLine: () => Promise.resolve(),
  touchCart: (cartId: string) => {
    h.touched.push(cartId);
    return Promise.resolve();
  },
}));
vi.mock("./media-url", () => ({ safeImageUrl: (u: string) => u, mediaUrl: (u: string) => u }));

// The batch read `undoMissReason` makes: `.from("qr_cart_items").select("id").eq(…).eq(…).limit(1)`.
const chain: Record<string, unknown> = {};
Object.assign(chain, {
  select: () => chain,
  eq: (col: string, v: unknown) => {
    h.filters.push([col, v]);
    return chain;
  },
  limit: () => Promise.resolve({ data: h.batchRows, error: h.batchErr }),
});
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => chain,
    rpc: (fn: string, args: unknown) => {
      h.rpcCalls.push({ fn, args });
      return Promise.resolve({ data: h.unfired, error: h.rpcError });
    },
  }),
}));

const { undoFire } = await import("./cart");

beforeEach(() => {
  h.unfired = 0;
  h.rpcError = null;
  h.batchRows = [];
  h.batchErr = null;
  h.rpcCalls = [];
  h.filters = [];
  h.touched = [];
  h.captured = [];
});

describe("undoFire — the 0-row answer read, never guessed (J37)", () => {
  it("takes back THIS batch: ok with the count, touches the cart and counts it", async () => {
    h.unfired = 2;
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({
      ok: true,
      unfired: 2,
      gone: false,
    });
    expect(h.rpcCalls).toEqual([
      { fn: "mms_undo_fire", args: { p_cart_id: "cart-1", p_batch: "batch-1" } },
    ]);
    expect(h.touched).toEqual(["cart-1"]);
    expect(h.captured).toEqual(["undo_fire"]);
    expect(h.filters).toEqual([]); // a real un-fire needs no diagnosis
  });

  it("0 rows and NO line still carries the batch → ok, gone — an earlier undo of this batch LANDED and its answer was lost", async () => {
    h.unfired = 0;
    h.batchRows = [];
    // MUTATION (cart-undo/retried-undo-reads-expired): every 0 is `expired` — a re-ask after a lost
    // answer says "already with the kitchen" and closes the window over drafts; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({
      ok: true,
      unfired: 0,
      gone: true,
    });
    // The read asked about THIS cart and THIS batch.
    expect(h.filters).toEqual([
      ["cart_id", "cart-1"],
      ["fire_batch", "batch-1"],
    ]);
    // Not a second undo: nothing touched, nothing counted.
    expect(h.touched).toEqual([]);
    expect(h.captured).toEqual([]);
  });

  it("0 rows while the batch's lines still carry it → expired (the kitchen has it)", async () => {
    h.unfired = 0;
    h.batchRows = [{ id: "line-1" }];
    // MUTATION (cart-undo/kitchen-batch-reads-as-gone): every 0 is `gone` — "Brought back" over
    // food being cooked; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(h.touched).toEqual([]);
  });

  it("an unreadable batch check stays expired — the conservative steer, for the diner's door too", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.unfired = 0;
    h.batchRows = null;
    h.batchErr = { message: "boom" };
    // (staff-send/undo-unread-check-reads-as-gone patches the shared module; it is judged by the
    // console's suite — this pins the same rule from the diner's side.)
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("an RPC error is `error`, never a diagnosis", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.unfired = null;
    h.rpcError = { message: "boom" };
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "error" });
    expect(h.filters).toEqual([]);
    err.mockRestore();
  });
});
