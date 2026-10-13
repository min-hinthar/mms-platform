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
      ...member.current,
    }),
  AuthzError: FakeAuthzError,
  UNAVAILABLE: () => new FakeAuthzError("We’re having trouble on our end", 503, "unavailable"),
}));
// Lifecycle audit — the line the authz read returns, steered per case (state · qty · dish).
const member = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
// The dish availability pre-read (`dishSellable`) — steered per case; `null` is "unknowable".
const sellable = vi.hoisted(() => ({ current: true as boolean | null, asked: [] as unknown[] }));
vi.mock("./availability-read", () => ({
  dishSellable: (id: unknown) => {
    sellable.asked.push(id);
    return Promise.resolve(sellable.current);
  },
  sendBlockingNames: () => Promise.resolve([]),
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
  member.current = {};
  sellable.current = true;
  sellable.asked = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setQty — the RPC's draft and freeze re-check (P2dd · P2cy)", () => {
  it("a Send that won the race is NAMED as a value — 'already gone to the kitchen' (not_draft)", async () => {
    // MUTATION (p2d-guards/diner-setqty-sent-reads-closed): drop the mapping — the diner is told
    // their open table closed; red. Lifecycle audit (edit-notes 6): it is a VALUE now, because a
    // thrown message is redacted in production and the diner heard "We couldn’t confirm that".
    rpcAnswer = { data: null, error: { code: "P0001", message: "line already sent" } };
    await expect(setQty("line-1", 3)).resolves.toMatchObject({ refused: "not_draft" });
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

/**
 * Lifecycle audit (edit-notes 6 · out-of-stock 1) — the two refusals `setQty` NAMES as a value.
 *
 * A line that already left draft is the server's own fact, named before the ownership rule (M230's
 * order), so a menu "−" on a dish a tablemate just sent can say "it's already gone to the kitchen".
 * And a write that would GROW a line whose dish sold out is refused — only a growth asks the catalog.
 */
describe("setQty — named refusals (lifecycle audit)", () => {
  it("a fired line is refused as not_draft BEFORE any write", async () => {
    // MUTATION (lcb/setqty-fired-line-throws): the pre-check folded back into the ownership throw.
    member.current = { lineState: "fired" };
    rpcAnswer = { data: 1, error: null };
    await expect(setQty("line-1", 0)).resolves.toMatchObject({ refused: "not_draft" });
  });

  it("growing a line whose dish sold out is refused as sold_out", async () => {
    // MUTATION (lcb/setqty-grows-a-sold-out-line): drop the growth gate — the "+" lands on a dish the
    // kitchen cannot make, and the cart charges for it until someone removes it; red.
    member.current = { lineQty: 1, menuItemId: "11111111-1111-1111-1111-111111111111" };
    sellable.current = false;
    await expect(setQty("line-1", 2)).resolves.toMatchObject({ refused: "sold_out" });
  });

  it("SHRINKING a sold-out line is always allowed — it is the way out — and never asks", async () => {
    // MUTATION (lcb/setqty-gate-blocks-the-way-out): gate every write, not only a growth; red.
    member.current = { lineQty: 2, menuItemId: "11111111-1111-1111-1111-111111111111" };
    sellable.current = false;
    const v = await setQty("line-1", 1);
    expect(v && "refused" in v ? v.refused : "landed").toBe("landed");
    expect(sellable.asked).toEqual([]);
  });

  it("an unknowable catalog (null) fails OPEN — the charge boundary re-reads regardless", async () => {
    member.current = { lineQty: 1, menuItemId: "11111111-1111-1111-1111-111111111111" };
    sellable.current = null;
    const v = await setQty("line-1", 2);
    expect(v && "refused" in v ? v.refused : "landed").toBe("landed");
  });
});
