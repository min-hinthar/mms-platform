import { summarizeRefund } from "./refund-view";

/**
 * The lifecycle audit (2026-10-13, kitchen ↔ floor ↔ board) — WHICH carts the staff boards tag as
 * refunded, decided once for the KDS (`kitchen.ts`), the floor card (`getFloorView`) and the table
 * page's paid round (`getTableDetail`), so the three cannot tell one table three stories.
 *
 * A cart is tagged when an order on it was refunded IN FULL and no order on it still STANDS (paid
 * and not fully refunded). "In full" is the ONE derivation, `summarizeRefund` (`lib/refund-view.ts`),
 * by the AMOUNT as well as the status — never re-derived here (Codex on #360, P1): a cash refund
 * (`mms_refund_cash_line`) raises `refunded_cents` and leaves the order `paid` (OPEN-ITEMS M308),
 * and a card refund can reach the total before the webhook flips the status, so a status-only rule
 * missed an ordinary full cash refund on all three surfaces. A PARTIAL refund leaves the order
 * standing: WHICH line it returned is not readable without a migration (OPEN-ITEMS M313), so
 * nothing here guesses it.
 *
 * ⚠️ A TAG, NEVER A CANCEL. A full refund is not "the food is off": it can be a goodwill comp ("your
 * meal is on us") at a table still eating, and settlement fires a dine-in table's drafts straight
 * onto its paid cart. So every board keeps the food — still cooking, still counted, still bumpable —
 * and says "Refunded — check with the counter before cooking". Hiding it left a ticket nobody could
 * bump and a floor card counting "in kitchen" forever.
 *
 * Pure: no I/O. The readers pass the order rows they already hold.
 */
export type RefundOrderRow = {
  cart_id: string | null;
  status: string;
  total_cents: number;
  refunded_cents: number | null;
};

export function refundedCarts(orders: readonly RefundOrderRow[]): Set<string> {
  const refunded = new Set<string>();
  const standing = new Set<string>();
  for (const o of orders) {
    if (!o.cart_id) continue;
    const full = summarizeRefund(o.total_cents, o.refunded_cents ?? 0, o.status).state === "full";
    if (full) refunded.add(o.cart_id);
    else if (o.status === "paid") standing.add(o.cart_id);
  }
  return new Set([...refunded].filter((c) => !standing.has(c)));
}
