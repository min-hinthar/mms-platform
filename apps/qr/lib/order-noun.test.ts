import { describe, expect, it } from "vitest";
import { orderNoun, orderSlot, showOrderSlot } from "./order-noun";

describe("one word for the open cart", () => {
  it("is an order at the restaurant and a basket at the market", () => {
    expect(orderNoun("dinein")).toBe("Order");
    expect(orderNoun("pickup")).toBe("Order");
    expect(orderNoun("scango")).toBe("Basket");
    expect(orderNoun(null)).toBe("Order");
  });

  it("names the count in the accessible name only when the device knows it", () => {
    expect(orderSlot("dinein", 3).aria).toBe("Your order — 3 items");
    expect(orderSlot("scango", 1).aria).toBe("Your basket — 1 item");
    expect(orderSlot("pickup", null).aria).toBe("Your order");
  });
});

describe("showOrderSlot — never light the header for a cart known to be empty", () => {
  it("hides an empty published cart", () => {
    // MUTATION: `return !!cartId` (the old rule) — viewing the menu lights the slot on every other
    // page with nothing in it; red.
    expect(showOrderSlot("c1", 0)).toBe(false);
  });
  it("shows a cart with items, and one whose count this device does not know", () => {
    expect(showOrderSlot("c1", 2)).toBe(true);
    expect(showOrderSlot("c1", null)).toBe(true);
    expect(showOrderSlot(null, 2)).toBe(false);
  });
});
