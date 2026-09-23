/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const h = vi.hoisted(() => ({
  publishCart: vi.fn(),
  cart: {
    cartId: "cart-1" as string | null,
    items: [] as { qty: number }[],
    count: 0,
    totals: null as object | null,
  },
}));
vi.mock("./TableCartProvider", () => ({ useCart: () => h.cart }));
vi.mock("./ActiveOrderProvider", () => ({
  useActiveOrder: () => ({ publishCart: h.publishCart }),
}));

const { CartPublisher } = await import("./CartPublisher");

afterEach(() => {
  cleanup();
  h.publishCart.mockReset();
});

describe("#300 — the menu publishes a count only once it has SEEN the cart", () => {
  it("publishes UNKNOWN, never zero, while the first view has not landed", () => {
    // MUTATION: publish `count` regardless of `totals` — the empty initial `items` is written as a
    // confirmed 0 and hides a cart with dishes in it on every other page; red.
    h.cart = { cartId: "cart-1", items: [], count: 0, totals: null };
    render(<CartPublisher />);
    expect(h.publishCart).toHaveBeenLastCalledWith("cart-1", null);
  });

  it("publishes the CONFIRMED lines once a view has been applied, never the optimistic count", () => {
    // Codex round 2. MUTATION: publish `count` (confirmed + pendingDelta) — an add still in flight
    // (here +2) is written as fact, and survives a refusal if the diner has already left; red.
    h.cart = {
      cartId: "cart-1",
      items: [{ qty: 1 }, { qty: 2 }],
      count: 5,
      totals: { totalCents: 4200 },
    };
    render(<CartPublisher />);
    expect(h.publishCart).toHaveBeenLastCalledWith("cart-1", 3);
  });
});
