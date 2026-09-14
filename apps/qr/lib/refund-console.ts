/**
 * A4·3 · M204 · M183 — the refund console's PURE rules, in `lib/` where a value can falsify them.
 *
 * The console shows a manager what will happen BEFORE the tap, so every figure here MIRRORS what
 * `mms_refund_authorize` (the SQL authority, `20260624030000_s4_money_remediation.sql`) will do on
 * submit — the way `lib/tax.ts` mirrors `mms_line_tax`. KEEP IN LOCKSTEP: a change to the refund
 * formula lands in both. The server's answer is still the only one that moves money.
 */

/**
 * M183 — how money goes back for this order, from two stored facts. The old console derived
 * "split-tender" from `stripe_payment_intent_id == null` alone, and a CASH order carries no
 * PaymentIntent either (`mms_fulfill_cash_order` never writes one) — so every cash order was told
 * to refund "via the Stripe dashboard", where no charge exists, two lines under its own `tender`.
 *
 *   `cash`      — cash out of the drawer; nothing for Stripe to return.
 *   `app`       — one PaymentIntent on the order: the in-app line refund.
 *   `dashboard` — a card order with no PaymentIntent on it: split-tender, each payer's charge lives
 *                 on `qr_cart_shares`; refunded from the processor's dashboard (deferred).
 */
export type RefundPath = "cash" | "app" | "dashboard";

export function refundPathFor(o: {
  tender: string;
  stripePaymentIntentId: string | null;
}): RefundPath {
  if (o.tender === "cash") return "cash";
  return o.stripePaymentIntentId ? "app" : "dashboard";
}

/**
 * The refundable amount for one paid line, in cents — the line's DISCOUNTED goods (gross minus its
 * pro-rata share of the order discount, by gross) plus its share of the order's (discount-adjusted)
 * tax, pro-rata by taxable gross. Service and tip are order-level and excluded. Does NOT apply the
 * pool cap — `offeredRefund` does, so a clamp is explained before the tap.
 */
export function lineRefundableCents(
  line: { unitPriceCents: number; qty: number; taxCents: number },
  order: { subtotalCents: number; discountCents: number; taxCents: number },
  taxableBaseCents: number,
): number {
  const lineGross = line.unitPriceCents * line.qty;
  const lineDiscount =
    order.subtotalCents > 0
      ? Math.round((order.discountCents * lineGross) / order.subtotalCents)
      : 0;
  const goods = lineGross - lineDiscount;
  const lineTax =
    line.taxCents > 0 && taxableBaseCents > 0
      ? Math.round((order.taxCents * lineGross) / taxableBaseCents)
      : 0;
  return goods + lineTax;
}

/**
 * The order's refundable POOL is what was collected for goods and tax — `total − service − tip` —
 * and what remains is the pool minus every refund already recorded against the order in the LEDGER
 * (`mms_refunds`, line-level and dashboard rows alike — the same sum the SQL clamps against, never
 * `qr_orders.refunded_cents`, which the receipt reads for a different question). Floored at zero:
 * a pool that reads negative is an over-refund already on the books, not a debt.
 */
export function remainingPoolCents(o: {
  totalCents: number;
  serviceChargeCents: number;
  tipCents: number;
  ledgerRefundedCents: number;
}): number {
  const pool = o.totalCents - o.serviceChargeCents - o.tipCents;
  return Math.max(0, pool - Math.max(0, o.ledgerRefundedCents));
}

/**
 * What the console OFFERS for a line: the line's figure clamped to what the order can still give
 * back, and whether the clamp bit — so the sheet says "the order has $x left, so this line refunds
 * $x" instead of showing one number and charging back another (M204's "a clamp is explained before
 * the tap").
 */
export function offeredRefund(
  lineCents: number,
  remainingCents: number,
): { cents: number; clamped: boolean } {
  const cents = Math.max(0, Math.min(lineCents, remainingCents));
  return { cents, clamped: cents < lineCents };
}
