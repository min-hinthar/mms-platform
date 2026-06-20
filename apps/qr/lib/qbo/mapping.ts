// QBO Sales Receipt mapping (M2·P2.4) — PURE, no I/O, so it's trivially testable and the balance
// invariant is easy to audit. A paid qr_order becomes a QuickBooks Sales Receipt whose lines sum
// EXACTLY to what Stripe charged, deposited to a Stripe *clearing* account (two-ledger): the receipt
// books the sale into clearing now; the Stripe payout later moves clearing → bank.
//
// Tax modeling: we already compute CA tax authoritatively (category-aware, to the cent), so we post
// it as an explicit non-taxed LINE (mapped to a sales-tax-liability item) and set
// GlobalTaxCalculation="NotApplicable" — QBO's Automated Sales Tax must NOT recompute/override our
// figure, or the receipt total wouldn't reconcile against the charge. Same for the service charge,
// tip, and promo discount: each is its own line, so Σ(lines) === order.total_cents by construction.

export type QboOrder = {
  id: string;
  stripePaymentIntentId: string;
  createdAt: string; // ISO timestamp
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
};

export type QboOrderItem = { name: string; qty: number; unitPriceCents: number };

/** QBO entity ids (sandbox or prod) the receipt references. The optional item refs are only required
 *  when the corresponding amount is non-zero — a tip line needs `itemTipRef`, etc. */
export type QboRefs = {
  customerRef: string;
  clearingAccountRef: string;
  itemSalesRef: string;
  itemServiceRef?: string;
  itemTaxRef?: string;
  itemTipRef?: string;
};

type QboLine = Record<string, unknown>;
export type QboSalesReceipt = {
  CustomerRef: { value: string };
  DepositToAccountRef: { value: string };
  GlobalTaxCalculation: "NotApplicable";
  TxnDate: string;
  PaymentRefNum?: string;
  PrivateNote: string;
  Line: QboLine[];
};

/** Integer cents → a 2-decimal number QBO accepts, without binary-float drift (1234 → 12.34). */
const money = (cents: number): number => Math.round(cents) / 100;

class QboMappingError extends Error {}

/**
 * Build the Sales Receipt body for a paid order. Throws (never returns a malformed/unbalanced body)
 * if the line items don't reconcile to the stored subtotal, if the parts don't sum to the total, or
 * if a non-zero amount has no item ref configured — so we can only ever POST a receipt that clears.
 */
export function buildSalesReceipt(
  order: QboOrder,
  items: QboOrderItem[],
  refs: QboRefs,
): QboSalesReceipt {
  // 1) The line items must reconcile to the order's stored subtotal (defense against a desynced order).
  const itemsCents = items.reduce((sum, i) => sum + i.qty * i.unitPriceCents, 0);
  if (itemsCents !== order.subtotalCents)
    throw new QboMappingError(
      `line items (${itemsCents}¢) ≠ order subtotal (${order.subtotalCents}¢) for order ${order.id}`,
    );

  // 2) The parts must sum to the charged total (mirrors mms_fulfill_order's own check).
  const derived =
    order.subtotalCents -
    order.discountCents +
    order.serviceChargeCents +
    order.taxCents +
    order.tipCents;
  if (derived !== order.totalCents)
    throw new QboMappingError(
      `breakdown (${derived}¢) ≠ order total (${order.totalCents}¢) for order ${order.id}`,
    );

  const need = (ref: string | undefined, what: string): string => {
    if (!ref)
      throw new QboMappingError(
        `${what} present but no QBO item ref configured (order ${order.id})`,
      );
    return ref;
  };

  const lines: QboLine[] = items.map((i) => ({
    DetailType: "SalesItemLineDetail",
    Amount: money(i.qty * i.unitPriceCents),
    Description: i.name,
    SalesItemLineDetail: {
      ItemRef: { value: refs.itemSalesRef },
      Qty: i.qty,
      UnitPrice: money(i.unitPriceCents),
      TaxCodeRef: { value: "NON" },
    },
  }));

  // A promo discount reduces the subtotal above it.
  if (order.discountCents > 0)
    lines.push({
      DetailType: "DiscountLineDetail",
      Amount: money(order.discountCents),
      DiscountLineDetail: { PercentBased: false },
    });

  const flatLine = (cents: number, ref: string, desc: string): QboLine => ({
    DetailType: "SalesItemLineDetail",
    Amount: money(cents),
    Description: desc,
    SalesItemLineDetail: { ItemRef: { value: ref }, TaxCodeRef: { value: "NON" } },
  });
  if (order.serviceChargeCents > 0)
    lines.push(
      flatLine(
        order.serviceChargeCents,
        need(refs.itemServiceRef, "service charge"),
        "Service charge",
      ),
    );
  if (order.taxCents > 0)
    lines.push(flatLine(order.taxCents, need(refs.itemTaxRef, "sales tax"), "Sales tax (CA)"));
  if (order.tipCents > 0) lines.push(flatLine(order.tipCents, need(refs.itemTipRef, "tip"), "Tip"));

  return {
    CustomerRef: { value: refs.customerRef },
    DepositToAccountRef: { value: refs.clearingAccountRef },
    GlobalTaxCalculation: "NotApplicable",
    TxnDate: order.createdAt.slice(0, 10), // YYYY-MM-DD in the company's books
    // Stripe PI id is longer than QBO's 21-char PaymentRefNum cap; the full id lives in PrivateNote.
    PaymentRefNum: order.stripePaymentIntentId.slice(0, 21),
    PrivateNote: `MMS QR order ${order.id} · Stripe ${order.stripePaymentIntentId}`,
    Line: lines,
  };
}
