import { describe, expect, it } from "vitest";
import {
  lineRefundableCents,
  offeredRefund,
  refundPathFor,
  remainingPoolCents,
} from "./refund-console";

/**
 * A4·3 — every rule falsified by a VALUE that separates the rule from its nearest wrong neighbour:
 * a cash order from a split one, a pool that includes the tip from one that does not, an offer
 * clamped from one that is not, a discounted line from a gross one.
 */
describe("refundPathFor — how money goes back (M183)", () => {
  it("a CASH order comes back from the drawer, never 'via the dashboard'", () => {
    // MUTATION: drop the tender arm → the cash order (no PaymentIntent) reads as split-tender and
    // the manager is sent to a processor that holds no charge for it.
    expect(refundPathFor({ tender: "cash", stripePaymentIntentId: null })).toBe("cash");
  });
  it("a card order with one PaymentIntent refunds in the app", () => {
    expect(refundPathFor({ tender: "card", stripePaymentIntentId: "pi_1" })).toBe("app");
    expect(refundPathFor({ tender: "terminal", stripePaymentIntentId: "pi_2" })).toBe("app");
  });
  it("a card order with no PaymentIntent on it is split-tender — the dashboard", () => {
    expect(refundPathFor({ tender: "card", stripePaymentIntentId: null })).toBe("dashboard");
  });
});

describe("remainingPoolCents — what the order can still give back (mirrors mms_refund_authorize)", () => {
  it("the pool is goods + tax: total minus service and tip", () => {
    // MUTATION: pool = total → a $2 tip and a $1 service charge become refundable money.
    expect(
      remainingPoolCents({
        totalCents: 2300,
        serviceChargeCents: 100,
        tipCents: 200,
        ledgerRefundedCents: 0,
      }),
    ).toBe(2000);
  });
  it("every refund already in the ledger comes off the pool", () => {
    expect(
      remainingPoolCents({
        totalCents: 2000,
        serviceChargeCents: 0,
        tipCents: 0,
        ledgerRefundedCents: 1500,
      }),
    ).toBe(500);
  });
  it("never negative — an over-refund on the books is not a debt", () => {
    expect(
      remainingPoolCents({
        totalCents: 2000,
        serviceChargeCents: 0,
        tipCents: 0,
        ledgerRefundedCents: 2500,
      }),
    ).toBe(0);
  });
});

describe("offeredRefund — the figure the manager sees is the figure the server will give", () => {
  it("clamps a line to the remaining pool and SAYS so", () => {
    // MUTATION: offer the line's figure unclamped → the sheet shows $12.00 and the server refunds
    // $5.00, a number the manager may already have said out loud.
    expect(offeredRefund(1200, 500)).toEqual({ cents: 500, clamped: true });
  });
  it("offers the line's own figure when the pool covers it", () => {
    expect(offeredRefund(1200, 1200)).toEqual({ cents: 1200, clamped: false });
    expect(offeredRefund(1200, 5000)).toEqual({ cents: 1200, clamped: false });
  });
  it("an exhausted pool offers nothing", () => {
    expect(offeredRefund(1200, 0)).toEqual({ cents: 0, clamped: true });
  });
});

describe("lineRefundableCents — discounted goods plus the line's share of the order tax", () => {
  const order = { subtotalCents: 4000, discountCents: 400, taxCents: 300 };
  it("takes the line's pro-rata share of the discount off its gross", () => {
    // 2 × $10 = $20 gross; 10% order discount → $2 off → $18 goods; taxable base $30 → tax share
    // $3.00 × 20/30 = $2.00 → $20.00.
    // MUTATION: ignore the discount → $22.00, refunding a discount the guest never paid.
    expect(lineRefundableCents({ unitPriceCents: 1000, qty: 2, taxCents: 80 }, order, 3000)).toBe(
      2000,
    );
  });
  it("a non-taxable line carries no tax share", () => {
    expect(lineRefundableCents({ unitPriceCents: 1000, qty: 1, taxCents: 0 }, order, 3000)).toBe(
      900,
    );
  });
  it("a zero-subtotal order takes no discount share, and a zero taxable base no tax share", () => {
    expect(
      lineRefundableCents(
        { unitPriceCents: 500, qty: 1, taxCents: 40 },
        { subtotalCents: 0, discountCents: 0, taxCents: 0 },
        0,
      ),
    ).toBe(500);
  });
});
