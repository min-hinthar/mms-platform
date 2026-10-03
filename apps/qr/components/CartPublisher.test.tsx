/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const h = vi.hoisted(() => ({
  publishCart: vi.fn(),
  registerDrain: vi.fn(),
  settled: vi.fn(() => Promise.resolve()),
  cart: {
    cartId: "cart-1" as string | null,
    items: [] as { qty: number }[],
    count: 0,
    totals: null as object | null,
    settled: undefined as unknown as () => Promise<void>,
    mode: "pickup" as string,
  },
}));
h.cart.settled = h.settled;
vi.mock("./TableCartProvider", () => ({ useCart: () => h.cart }));
vi.mock("./ActiveOrderProvider", () => ({
  useActiveOrder: () => ({ publishCart: h.publishCart, registerDrain: h.registerDrain }),
}));

const { CartPublisher } = await import("./CartPublisher");

afterEach(() => {
  cleanup();
  h.publishCart.mockReset();
  h.registerDrain.mockReset();
});

describe("Codex round 3 on #312 — the publisher lends the store the cart's settled() barrier", () => {
  it("registers settled() while mounted and withdraws it on unmount", () => {
    h.cart = {
      cartId: "cart-1",
      items: [],
      count: 0,
      totals: null,
      settled: h.settled,
      mode: "pickup",
    };
    const { unmount } = render(<CartPublisher />);
    expect(h.registerDrain).toHaveBeenLastCalledWith(h.settled);
    unmount();
    // Withdrawn, so a tab on a route with no cart provider never awaits a torn-down menu's ledger.
    expect(h.registerDrain).toHaveBeenLastCalledWith(null);
  });
});

describe("#300 — the menu publishes a count only once it has SEEN the cart", () => {
  it("publishes UNKNOWN, never zero, while the first view has not landed", () => {
    // MUTATION: publish `count` regardless of `totals` — the empty initial `items` is written as a
    // confirmed 0 and hides a cart with dishes in it on every other page; red.
    h.cart = {
      cartId: "cart-1",
      items: [],
      count: 0,
      totals: null,
      settled: h.settled,
      mode: "pickup",
    };
    render(<CartPublisher />);
    // Codex round 2 on 3b: WITH its door, so the store can refuse to offer it on another door.
    expect(h.publishCart).toHaveBeenLastCalledWith("cart-1", null, "pickup");
  });

  it("publishes the CONFIRMED lines once a view has been applied, never the optimistic count", () => {
    // Codex round 2. MUTATION: publish `count` (confirmed + pendingDelta) — an add still in flight
    // (here +2) is written as fact, and survives a refusal if the diner has already left; red.
    h.cart = {
      cartId: "cart-1",
      items: [{ qty: 1 }, { qty: 2 }],
      count: 5,
      totals: { totalCents: 4200 },
      settled: h.settled,
      mode: "dinein",
    };
    render(<CartPublisher />);
    expect(h.publishCart).toHaveBeenLastCalledWith("cart-1", 3, "dinein");
  });
});
