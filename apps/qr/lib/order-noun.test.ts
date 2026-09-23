import { describe, expect, it } from "vitest";
import {
  decodeCartCount,
  encodeCartCount,
  orderNoun,
  orderSlot,
  showOrderSlot,
  slotCount,
} from "./order-noun";

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

describe("the stored count belongs to one cart, and a shared cart never claims one", () => {
  it("decodes only its own cart's count", () => {
    // MUTATION: drop the id comparison — a cart reached by URL inherits ANOTHER cart's number; red.
    expect(decodeCartCount(encodeCartCount("cart-a", 3), "cart-b")).toBeNull();
    expect(decodeCartCount(encodeCartCount("cart-a", 3), "cart-a")).toBe(3);
    expect(decodeCartCount(encodeCartCount("cart-a", 0), "cart-a")).toBe(0);
  });

  it("reads anything malformed as UNKNOWN, never as an empty cart", () => {
    // MUTATION: fall back to 0 — a corrupt entry would hide a cart holding real dishes; red.
    for (const raw of ["cart-a:", "cart-a:-1", "cart-a:1.5", "cart-a:x", ":3", "cart-a", ""])
      expect(decodeCartCount(raw, "cart-a")).toBeNull();
    expect(decodeCartCount(null, "cart-a")).toBeNull();
    expect(decodeCartCount("cart-a:3", null)).toBeNull();
  });

  it("a dine-in cart's count is unknown — a tablemate may have changed it", () => {
    // MUTATION: return `count` for dine-in — a stale 0 hides the table's live order; red.
    expect(slotCount("dinein", 0)).toBeNull();
    expect(slotCount("dinein", 4)).toBeNull();
    expect(slotCount("pickup", 0)).toBe(0);
    expect(slotCount("scango", 2)).toBe(2);
    expect(showOrderSlot("c", slotCount("dinein", 0))).toBe(true);
  });
});
