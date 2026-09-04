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
    // `touchCart`'s updated_at write. It answers success and is not what these cases are about —
    // the subject is the view read that follows it.
    update: () => api,
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
    // `mms_cart_item_set_qty_if_open` answers truthy = the row moved, so `setQty` clears its own
    // status guard and reaches the trailing view read, which is what these cases are about.
    rpc: () => Promise.resolve({ data: true, error: null }),
  }),
}));

const { getCartView, setQty } = await import("./cart");

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
    const err = await getCartView("c-1").then(
      () => null,
      (e: unknown) => e,
    );
    // ⚠️ INSTANCE, not shape (blind adversarial pass). `/cart` routes on
    // `e instanceof AuthzError && e.code === "unavailable"`, so a plain object carrying the right
    // three fields would satisfy a `toMatchObject` assertion and still miss the outage screen — the
    // failure mode this whole case exists to pin. `FakeAuthzError` IS what the mocked `./authz`
    // hands the module under test, so the identity check is the real one here.
    expect(err).toBeInstanceOf(FakeAuthzError);
    expect(err).toMatchObject({ status: 503, code: "unavailable" });
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

/**
 * ⚠️ THE OTHER HALF OF T21(a), AND THE ONE A BLIND ADVERSARIAL PASS HAD TO FIND. Making the READ
 * throw was right; letting that throw escape a MUTATION was not. `setQty` and `addItem` commit the
 * row and only THEN render a view, so a failure in that read says nothing about whether the tap
 * landed — and every consumer reads a rejection as "the write failed":
 *
 *   • `/grocery` rolls its optimistic list back to the pre-tap snapshot, so the basket shows 2 while
 *     the server holds 3 and checkout charges 3 — the exact divergence that file's own comment
 *     forbids, arriving from the opposite direction;
 *   • `KioskMenu` leaves the sheet open with "something went wrong", and the operator re-taps an add
 *     that already committed.
 *
 * So the mutation answers `null` — written, unreadable — and the fixtures below pin both directions:
 * a failed trailing read must NOT reject, and a healthy one must still return the view.
 */
describe("a mutation's trailing view read never fails the write", () => {
  it("returns null instead of throwing when the trailing read fails", async () => {
    itemsRes = { data: null, error: { message: "connection reset by peer" } };
    await expect(setQty("line-1", 3)).resolves.toBeNull();
  });

  it("returns null when the CART half of the trailing read fails", async () => {
    cartRes = { data: null, error: { message: "statement timeout" } };
    await expect(setQty("line-1", 3)).resolves.toBeNull();
  });

  it("still returns the view when the trailing read succeeds", async () => {
    // The control: `null` must mean something. A mutation that always answered null would make the
    // caller re-read on every tap and lose the one-round-trip fix this return value exists for.
    const v = await setQty("line-1", 3);
    expect(v).not.toBeNull();
    expect(v?.items).toEqual([]);
  });
});
