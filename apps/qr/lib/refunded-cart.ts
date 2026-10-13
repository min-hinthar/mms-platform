/**
 * The lifecycle audit (2026-10-13, kitchen ↔ floor ↔ board) — WHICH carts the staff boards tag as
 * refunded, decided once for the KDS (`kitchen.ts`), the floor card (`getFloorView`) and the table
 * page's paid round (`getTableDetail`), so the three cannot tell one table three stories.
 *
 * A cart is tagged when an order on it was refunded IN FULL (`qr_orders.status = 'refunded'`) and no
 * order on it is still `paid`. A partial refund leaves the order `paid`: WHICH line it returned is
 * not readable without a migration (OPEN-ITEMS M313), so nothing here guesses it.
 *
 * ⚠️ A TAG, NEVER A CANCEL. A full refund is not "the food is off": it can be a goodwill comp ("your
 * meal is on us") at a table still eating, and settlement fires a dine-in table's drafts straight
 * onto its paid cart. So every board keeps the food — still cooking, still counted, still bumpable —
 * and says "Refunded — check with the counter before cooking". Hiding it left a ticket nobody could
 * bump and a floor card counting "in kitchen" forever.
 *
 * Pure: no I/O. The readers pass the order rows they already hold.
 */
export type RefundOrderRow = { cart_id: string | null; status: string };

export function refundedCarts(orders: readonly RefundOrderRow[]): Set<string> {
  const refunded = new Set<string>();
  const paid = new Set<string>();
  for (const o of orders) {
    if (!o.cart_id) continue;
    if (o.status === "refunded") refunded.add(o.cart_id);
    else if (o.status === "paid") paid.add(o.cart_id);
  }
  return new Set([...refunded].filter((c) => !paid.has(c)));
}
