import { describe, expect, it } from "vitest";
import { refundedCarts } from "./refunded-cart";

describe("refundedCarts — the ONE rule the KDS, the floor and the table page tag by", () => {
  it("a cart whose order was refunded in full, with no paid order beside it, is tagged", () => {
    // lck/refunded-cart/full-refund-untagged
    expect([...refundedCarts([{ cart_id: "c1", status: "refunded" }])]).toEqual(["c1"]);
  });

  it("a cart that still holds a PAID order is not (a partial refund leaves the order paid)", () => {
    // lck/refunded-cart/paid-beside-refund-tagged
    expect(
      refundedCarts([
        { cart_id: "c1", status: "refunded" },
        { cart_id: "c1", status: "paid" },
      ]).size,
    ).toBe(0);
    expect(refundedCarts([{ cart_id: "c2", status: "paid" }]).size).toBe(0);
  });

  it("an order with no cart is skipped", () => {
    expect(refundedCarts([{ cart_id: null, status: "refunded" }]).size).toBe(0);
  });
});
