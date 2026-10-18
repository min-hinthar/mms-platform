import { COUNTER_TENDERS } from "./counter-tender";
import { receiptStatusLabel, type RefundSummary } from "./refund-view";

/**
 * Lifecycle audit (2026-10-13), C and H — what /track's TERMINAL arms say about the money, decided
 * once. Pure: the tracker renders these, never re-derives them.
 *
 * C — A REFUNDED ORDER MUST NEVER READ "PAID IN FULL" (CLAUDE.md, receipt-view). /track keyed its
 * refund arm on `status === 'refunded'`, but `status` is not the refund's authority:
 * `mms_refund_cash_line` (M218) writes `refunded_cents` and leaves `status` at 'paid' — so a table
 * refunded in cash, line by line to the last cent, never reached the refund arm, and its settled card
 * and live region went on saying "Paid in full" over a slip reading "You paid $0.00". The state comes
 * from `summarizeRefund` (lib/refund-view.ts), which reads both facts and always claims LESS was paid.
 * (The SQL flip that would make `status` agree is filed as OPEN-ITEMS M308 — a migration.)
 */

/** Is all of this order's money back? The refund arm's ONE predicate. */
export function trackRefunded(refund: RefundSummary): boolean {
  return refund.state === "full";
}

/** Did this order settle at the REGISTER (cash / Terminal)? `COUNTER_TENDERS`, named once. */
export function counterTender(tender: string): boolean {
  return (COUNTER_TENDERS as readonly string[]).includes(tender);
}

/**
 * The settled card's spoken line — the visible one is `receiptStatusLabel` itself ("Paid in full ·
 * Cash", "Partly refunded · Cash"), so the view's one live region and the card can never disagree.
 */
export function settledSpoken(refund: RefundSummary, tender: string): string {
  return `${receiptStatusLabel(refund, tender)}. Your table’s bill is paid.`;
}

/**
 * The refund arm's words, by how the money went back. A cash refund was HANDED BACK at the counter —
 * "on its way back … within 5–10 business days" would send a guest to their bank for money already in
 * their hand (the same rule as `partialRefundNote`, M218). A card or Terminal refund returns to the
 * card, and the bank's window is the bank's (W1c's shipped copy, verbatim).
 */
export function refundArmCopy(tender: string): { lead: string; body: string; spoken: string } {
  if (tender === "cash")
    return {
      lead: "Your money was handed back.",
      body: "This order was refunded in cash at the counter.",
      spoken: "This order was refunded — the amount was handed back to you in cash.",
    };
  return {
    lead: "Your money is on its way back.",
    body: "This order was refunded to your original payment method — banks typically post it within 5–10 business days.",
    spoken:
      "This order was refunded — the amount returns to your original payment method, typically within five to ten business days.",
  };
}

/**
 * H — the terminal foot names where the receipt LIVES, and only somewhere it does. /account's
 * history is read off `earned_by` / `qr_order_payers`, which a counter settle never writes (M206), so
 * for a cash or Terminal order "this receipt lives in your order history" pointed at an empty page.
 * There the durable copy is the receipt link above (`ReceiptActions`, minted for a seated member by
 * `callerMayReceiveReceipt`'s counter arm) — named only when it actually rendered (`linked`), else the
 * foot says the one thing that is true and stops.
 *
 * `opening` is the arm's own first clause ("Your table’s all settled", "You’re free to go").
 */
export function settledFoot(opening: string, tender: string, linked: boolean): string {
  if (!counterTender(tender)) return `${opening} — this receipt lives in your order history.`;
  return linked ? `${opening} — keep your receipt with the link above.` : `${opening}.`;
}
