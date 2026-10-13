import { describe, expect, it } from "vitest";
import { refundedCarts, type RefundOrderRow } from "./refunded-cart";

/** One order row as the readers select it: the status AND the amounts (Codex on #360, P1). */
const order = (over: Partial<RefundOrderRow>): RefundOrderRow => ({
  cart_id: "c1",
  status: "paid",
  total_cents: 2400,
  refunded_cents: 0,
  ...over,
});

describe("refundedCarts — the ONE rule the KDS, the floor and the table page tag by", () => {
  it("a cart whose order was refunded in full, with no standing paid order beside it, is tagged", () => {
    // lck/refunded-cart/full-refund-untagged
    expect([...refundedCarts([order({ status: "refunded", refunded_cents: 2400 })])]).toEqual([
      "c1",
    ]);
  });

  it("a FULL refund by AMOUNT tags the cart though the order still reads `paid` (Codex on #360, P1)", () => {
    // `mms_refund_cash_line` raises `refunded_cents` and leaves the order `paid` (OPEN-ITEMS M308),
    // and a card refund can reach the total before the webhook flips the status.
    // lck/refunded-cart/amount-arm-ignored — the status-only rule: never tagged; red.
    expect([...refundedCarts([order({ refunded_cents: 2400 })])]).toEqual(["c1"]);
    expect([...refundedCarts([order({ refunded_cents: 2500 })])]).toEqual(["c1"]);
  });

  it("a PARTIAL refund leaves the order standing: the cart is not tagged", () => {
    // lck/refunded-cart/partial-tagged — red.
    expect(refundedCarts([order({ refunded_cents: 1200 })]).size).toBe(0);
  });

  it("a cart that still holds a standing paid order is not tagged, whatever else was refunded", () => {
    // lck/refunded-cart/paid-beside-refund-tagged
    expect(
      refundedCarts([
        order({ status: "refunded", refunded_cents: 2400 }),
        order({ refunded_cents: 0 }),
      ]).size,
    ).toBe(0);
    expect(refundedCarts([order({})]).size).toBe(0);
  });

  it("an order with no cart is skipped; a $0 order with nothing refunded is not a refund", () => {
    expect(refundedCarts([order({ cart_id: null, status: "refunded" })]).size).toBe(0);
    expect(refundedCarts([order({ total_cents: 0, refunded_cents: 0 })]).size).toBe(0);
  });
});
