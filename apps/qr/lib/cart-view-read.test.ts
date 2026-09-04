import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T21(a) — `getCartView`'s two reads must REPORT a failure, never answer one with an empty cart.
 *
 * These were the only two unbound destructures in `cart.ts`, and the reason that mattered is that
 * postgrest RESOLVES rather than rejects: the service client never calls `.throwOnError()`, so a
 * dropped socket, a statement timeout, a pool error and a 42703 unknown-column all arrive as
 * `{ data: null, error }`. `rows ?? []` then turned that into an empty item list and RETURNED it as
 * server truth.
 *
 * The totals are a SECOND read (`getCartTotals`) which always bound and threw, so the two could
 * disagree — which is the whole defect: an empty list beside a live total. The kiosk review renders
 * exactly that pair and sets `loadFailed: false`, suppressing its own honest failure screen.
 *
 * ⚠️ THE FIXTURE SEPARATES THE TWO ANSWERS. A cart that is genuinely EMPTY must still return `[]`
 * happily — this is a restaurant, and an empty cart is the state every diner starts in. So each
 * failure case is paired with the empty-but-successful case, and a mutant that simply throws on
 * every read is as red as one that never throws. The distinguishing input is `error`, never length.
 */

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
  assertCartItemMember: () => Promise.resolve({ uid: "u-1", sessionId: "s-1", role: "guest" }),
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

type Res = { data: unknown; error: { message: string } | null };

/** What each table answers this test. `null` error = success. */
let cartRes: Res = { data: { pickup_slot: null, fire_at: null, tab_type: "none" }, error: null };
let itemsRes: Res = { data: [], error: null };

function table(name: string) {
  const answer = (): Promise<Res> =>
    Promise.resolve(
      name === "qr_carts"
        ? cartRes
        : name === "qr_cart_items"
          ? itemsRes
          : { data: [], error: null },
    );
  const api = {
    select: () => api,
    eq: () => api,
    in: () => api,
    order: () => answer(),
    single: () => answer(),
    maybeSingle: () => answer(),
    then: (res: (v: Res) => unknown) => answer().then(res),
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (t: string) => table(t),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

const { getCartView } = await import("./cart");

beforeEach(() => {
  cartRes = { data: { pickup_slot: null, fire_at: null, tab_type: "none" }, error: null };
  itemsRes = { data: [], error: null };
});

describe("getCartView — an unreadable cart is reported, never answered with an empty one", () => {
  it("returns an empty list for a cart that is genuinely empty", async () => {
    // The control. Without this, a mutant that throws unconditionally would look correct.
    const v = await getCartView("c-1");
    expect(v.items).toEqual([]);
  });

  it("THROWS when the LINE read fails, instead of returning an empty basket", async () => {
    itemsRes = { data: null, error: { message: "canceling statement due to statement timeout" } };
    await expect(getCartView("c-1")).rejects.toMatchObject({ name: "AuthzError" });
  });

  it("THROWS when the CART read fails", async () => {
    cartRes = { data: null, error: { message: "connection reset by peer" } };
    await expect(getCartView("c-1")).rejects.toMatchObject({ name: "AuthzError" });
  });

  // ⚠️ THE SHAPE IS THE ROUTING. `/cart` reaches its outage screen only via
  // `e instanceof AuthzError && e.code === "unavailable"`; anything else falls to the arm that tells
  // the diner their order "isn't available on this device" — the copy W10a exists to have deleted.
  it.each([
    ["the line read", () => (itemsRes = { data: null, error: { message: "boom" } })],
    ["the cart read", () => (cartRes = { data: null, error: { message: "boom" } })],
  ])("answers 503 unavailable — not a verdict — when %s fails", async (_label, fail) => {
    fail();
    await expect(getCartView("c-1")).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });

  it("never pairs an empty list with a live total", async () => {
    // The defect stated as the diner sees it: the kiosk renders `view.items` above
    // `view.totals.totalCents` unconditionally. If a failed read can resolve, this pair is reachable.
    itemsRes = { data: null, error: { message: "boom" } };
    const settled = await getCartView("c-1").then(
      (v) => ({ ok: true as const, v }),
      () => ({ ok: false as const }),
    );
    expect(settled.ok && settled.v.items.length === 0 && settled.v.totals.totalCents > 0).toBe(
      false,
    );
  });
});
