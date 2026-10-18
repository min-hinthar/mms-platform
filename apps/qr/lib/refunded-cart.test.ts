import { describe, expect, it } from "vitest";
import {
  foodRefundedInFull,
  orderSettled,
  refundedCarts,
  SETTLED_ORDER_STATUSES,
  type LineRefunds,
  type RefundOrderRow,
} from "./refunded-cart";

/**
 * One order row as the readers select it: the status, the amounts and the order-level parts the
 * refund pool leaves out (`total − service − tip`, `remainingPoolCents`). Every fixture carries a TIP
 * (the blind pass on #360, CRITICAL 1): a cash tip is recorded by default since W17c, and every line
 * refund is clamped to the pool, so a fully refunded tipped order never reaches its total.
 *
 * $24.00 total = $20.00 of goods and tax (two $10.00 dishes) + a $4.00 tip.
 */
const order = (over: Partial<RefundOrderRow> = {}): RefundOrderRow => ({
  id: "o1",
  cart_id: "c1",
  status: "paid",
  total_cents: 2400,
  refunded_cents: 0,
  service_charge_cents: 0,
  tip_cents: 400,
  ...over,
});
const POOL = 2000;

/** The order's lines and which of them the ledger holds a line refund for. */
const lines = (items: string[], refunded: string[], orderId = "o1"): LineRefunds => ({
  itemsByOrder: new Map([[orderId, items]]),
  refundedLines: new Set(refunded),
});
const NONE: LineRefunds = { itemsByOrder: new Map(), refundedLines: new Set() };

describe("foodRefundedInFull — was every DISH refunded? (the kitchen's question, not the receipt's)", () => {
  it("(a) an order the processor marked refunded, whatever its amounts say", () => {
    // A dashboard refund from before W23b flipped the status and left `refunded_cents` at 0 (the
    // backfill read the ledger, which a dashboard refund never wrote). lck/refunded-cart/status-arm-dropped — red.
    expect(foodRefundedInFull(order({ status: "refunded", refunded_cents: 0 }), null)).toBe(true);
  });

  it("(b) every dish cash-refunded with the TIP kept is tagged — the amounts never reach the total", () => {
    // `mms_refund_cash_line` clamps each line to the pool and leaves the order `paid`: $20.00 back of
    // a $24.00 order. The receipt honestly says "partial" (the tip stayed); the kitchen's answer is
    // that no dish is still owed. lck/refunded-cart/line-arm-dropped — red.
    const o = order({ refunded_cents: POOL - 1 });
    expect(foodRefundedInFull(o, lines(["i1", "i2"], ["i1", "i2"]))).toBe(true);
  });

  it("(b) the ROUNDING case: the lines' shares sum a cent short of the pool, every line has its row", () => {
    // Each line's discount and tax shares round separately, so two refunds can sum to pool − 1 even
    // on a tip-free order. The ledger rows are exact where the amounts are not.
    const o = order({ tip_cents: 0, total_cents: 2000, refunded_cents: 1999 });
    expect(foodRefundedInFull(o, lines(["i1", "i2"], ["i1", "i2"]))).toBe(true);
    // the same amounts without the rows: not by amount (a cent short), so not tagged
    expect(foodRefundedInFull(o, NONE)).toBe(false);
  });

  it("(b) one of two dishes refunded is not tagged", () => {
    // lck/refunded-cart/one-line-is-every-line — `some` for `every`: red.
    const o = order({ refunded_cents: 1000 });
    expect(foodRefundedInFull(o, lines(["i1", "i2"], ["i1"]))).toBe(false);
  });

  it("(b) an order whose lines the read did not return is never 'every line refunded'", () => {
    // lck/refunded-cart/no-lines-reads-as-all — `[].every` is true: red.
    expect(foodRefundedInFull(order({ refunded_cents: 1000 }), lines([], ["i1"]))).toBe(false);
  });

  it("(c) an ORDER-LEVEL refund of the goods (no line rows) is tagged — the amount covers the pool", () => {
    // A dashboard refund reconciled from Stripe raises `refunded_cents` and writes no ledger row
    // (`mms_apply_refund_reconcile`). lck/refunded-cart/pool-arm-dropped — red.
    expect(foodRefundedInFull(order({ refunded_cents: POOL }), NONE)).toBe(true);
    expect(foodRefundedInFull(order({ refunded_cents: 2400 }), NONE)).toBe(true);
    // a SERVICE charge is outside the pool too
    expect(
      foodRefundedInFull(
        order({ tip_cents: 0, service_charge_cents: 300, total_cents: 2300, refunded_cents: 2000 }),
        NONE,
      ),
    ).toBe(true);
    // lck/refunded-cart/pool-keeps-the-tip · lck/refunded-cart/pool-keeps-the-service — the
    // receipt's question (a part left inside the pool): red.
  });

  it("(c) a refund short of the pool is not the food", () => {
    expect(foodRefundedInFull(order({ refunded_cents: POOL - 1 }), NONE)).toBe(false);
    // nothing refunded on a $0-goods order is not a refund. lck/refunded-cart/nothing-back-is-full — red.
    expect(
      foodRefundedInFull(order({ total_cents: 400, tip_cents: 400, refunded_cents: 0 }), NONE),
    ).toBe(false);
  });

  it("an unreadable line ledger (null) still decides by status and amount — only the line arm is lost", () => {
    expect(foodRefundedInFull(order({ refunded_cents: POOL }), null)).toBe(true);
    expect(foodRefundedInFull(order({ refunded_cents: POOL - 1 }), null)).toBe(false);
  });
});

describe("refundedCarts — the ONE rule the KDS, the floor and the table page tag by", () => {
  it("a cart whose order's food was refunded in full, with no standing paid order beside it, is tagged", () => {
    // lck/refunded-cart/full-refund-untagged
    expect([...refundedCarts([order({ status: "refunded", refunded_cents: 2400 })], null)]).toEqual(
      ["c1"],
    );
    expect([
      ...refundedCarts([order({ refunded_cents: 1990 })], lines(["i1", "i2"], ["i1", "i2"])),
    ]).toEqual(["c1"]);
  });

  it("a PARTIAL refund leaves the order standing: the cart is not tagged", () => {
    // lck/refunded-cart/one-line-is-every-line — red.
    expect(refundedCarts([order({ refunded_cents: 1000 })], lines(["i1", "i2"], ["i1"])).size).toBe(
      0,
    );
  });

  it("a cart that still holds a standing paid order is not tagged, whatever else was refunded", () => {
    // lck/refunded-cart/paid-beside-refund-tagged
    expect(
      refundedCarts(
        [
          order({ status: "refunded", refunded_cents: 2400 }),
          order({ id: "o2", refunded_cents: 0 }),
        ],
        null,
      ).size,
    ).toBe(0);
    expect(refundedCarts([order()], null).size).toBe(0);
  });

  it("the line ledger is matched by ORDER: another order's refunded lines say nothing of this one", () => {
    const o = order({ id: "o2", refunded_cents: 1000 });
    expect(refundedCarts([o], lines(["i1", "i2"], ["i1", "i2"], "o1")).size).toBe(0);
  });

  it("an order with no cart is skipped", () => {
    expect(refundedCarts([order({ cart_id: null, status: "refunded" })], null).size).toBe(0);
  });
});

describe("orderSettled — the statuses a settled order holds, named once (#360, Codex P1)", () => {
  it("paid AND refunded: a card refund flips the status where an equal cash one does not", () => {
    // lck/refunded-cart/settled-is-paid-only · lck/refunded-cart/settled-is-anything — red.
    expect([...SETTLED_ORDER_STATUSES]).toEqual(["paid", "refunded"]);
    expect(orderSettled("paid")).toBe(true);
    expect(orderSettled("refunded")).toBe(true);
    for (const s of ["pending", "failed", ""]) expect(orderSettled(s)).toBe(false);
  });
});
