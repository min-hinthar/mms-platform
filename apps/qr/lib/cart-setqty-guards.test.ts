import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@mms/db/schemas", () => ({
  addItemInput: { parse: (x: unknown) => x },
  applyPromoInput: { parse: (x: unknown) => x },
  applyRewardInput: { parse: (x: unknown) => x },
  assignLineInput: { parse: (x: unknown) => x },
  cartViewInput: { parse: (x: unknown) => x },
  makeItNowInput: { parse: (x: unknown) => x },
  sendToKitchenInput: { parse: (x: unknown) => x },
  setKioskTipInput: { parse: (x: unknown) => x },
  setLineFulfillmentInput: { parse: (x: unknown) => x },
  setQtyInput: { parse: (x: unknown) => x },
  undoFireInput: { parse: (x: unknown) => x },
}));

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
      role: "guest",
      locked: false,
      lockedBy: null,
      settling: false,
      settleBy: null,
      mode: "dinein",
    }),
  assertCartItemMember: () =>
    Promise.resolve({
      uid: "u-1",
      sessionId: "s-1",
      role: "host",
      cartId: "c-1",
      locked: false,
      settling: false,
      lineSeat: "u-1",
      lineState: "draft",
      comped: false,
    }),
  AuthzError: FakeAuthzError,
  UNAVAILABLE: () => new FakeAuthzError("We’re having trouble on our end", 503, "unavailable"),
}));
vi.mock("./rate", () => ({
  assertMutationRate: () => Promise.resolve(),
  withinMutationRate: () => Promise.resolve(true),
}));
vi.mock("./permissions", () => ({ canMutateLine: () => true }));
// A NON-ZERO total from the second read, so the "empty list beside a live total" pairing is exactly
// what a passing-but-wrong implementation would produce.
vi.mock("./totals", () => ({
  getCartTotals: () => Promise.resolve({ subtotalCents: 5340, totalCents: 5340 }),
}));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));
vi.mock("./order-lines", () => ({ priceItem: () => Promise.resolve({}) }));
vi.mock("./media-url", () => ({ mediaUrl: (u: string) => u }));

/**
 * P2dd · P2cy — the diner's `setQty` against the RPC's own re-check (20260929000000). Its reads above
 * the RPC (`lineState`, `settling`) can be overtaken: the host sends the dish, or the table starts
 * paying, in between. The RPC refuses both under the cart's row lock; the diner must read the SAME
 * sentence the pre-checks would have given — never "Cart is no longer open" for a live table.
 */
let rpcAnswer: { data: unknown; error: { code: string; message: string } | null } = {
  data: 1,
  error: null,
};
const api: Record<string, unknown> = {};
Object.assign(api, {
  select: () => api,
  update: () => api,
  eq: () => api,
  in: () => api,
  order: () => Promise.resolve({ data: [], error: null }),
  single: () => Promise.resolve({ data: null, error: null }),
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
  then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
});
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({ from: () => api, rpc: () => Promise.resolve(rpcAnswer) }),
}));

const { setQty } = await import("./cart");

beforeEach(() => {
  rpcAnswer = { data: 1, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setQty — the RPC's draft and freeze re-check (P2dd · P2cy)", () => {
  it("a Send that won the race reads as 'already gone to the kitchen'", async () => {
    // MUTATION (p2d-guards/diner-setqty-sent-reads-closed): drop the mapping — the diner is told
    // their open table closed; red.
    rpcAnswer = { data: null, error: { code: "P0001", message: "line already sent" } };
    await expect(setQty("line-1", 3)).rejects.toThrow(
      "Ask our staff to change an item that’s already gone to the kitchen",
    );
  });

  it("a settlement that won the race reads as the table paying", async () => {
    // MUTATION (p2d-guards/diner-setqty-paying-reads-closed): drop the mapping; red.
    rpcAnswer = { data: null, error: { code: "P0001", message: "cart is being paid" } };
    await expect(setQty("line-1", 3)).rejects.toThrow(
      "Your table is paying — you can’t change the order while everyone pays",
    );
  });

  it("a zero-row answer is still 'no longer open' (a closed cart)", async () => {
    rpcAnswer = { data: 0, error: null };
    await expect(setQty("line-1", 3)).rejects.toThrow("Cart is no longer open");
  });
});
