import { remainingPoolCents } from "./refund-console";

/**
 * The lifecycle audit (2026-10-13, kitchen ↔ floor ↔ board) — WHICH carts the staff boards tag as
 * refunded, decided once for the KDS (`kitchen.ts`), the floor card (`getFloorView`) and the table
 * page's paid round (`getTableDetail`), so the three cannot tell one table three stories.
 *
 * A cart is tagged when an order on it had its FOOD refunded in full (`foodRefundedInFull`) and no
 * order on it still STANDS (paid, food not all refunded). A PARTIAL refund leaves the order standing:
 * WHICH line it returned is not readable without a migration (OPEN-ITEMS M313), so nothing here
 * guesses it.
 *
 * ⚠️ A TAG, NEVER A CANCEL. A full refund is not "the food is off": it can be a goodwill comp ("your
 * meal is on us") at a table still eating, and settlement fires a dine-in table's drafts straight
 * onto its paid cart. So every board keeps the food — still cooking, still counted, still bumpable —
 * and says "Refunded — check with the counter before cooking". Hiding it left a ticket nobody could
 * bump and a floor card counting "in kitchen" forever.
 *
 * Pure: no I/O. The readers pass the order rows they already hold, and the line ledger
 * (`readLineRefunds`, `lib/refunded-cart-read.ts`) for the orders that need it.
 */
export type RefundOrderRow = {
  id: string;
  cart_id: string | null;
  status: string;
  total_cents: number;
  refunded_cents: number | null;
  service_charge_cents: number | null;
  tip_cents: number | null;
};

/** The line ledger for the orders a reader holds: each order's `qr_order_items` ids, and the ids the
 *  ledger holds a LINE refund for (`mms_refunds.order_item_id`, one per line by
 *  `mms_refunds_one_per_line`). `null` from the read = unreadable: the line arm is not decided. */
export type LineRefunds = {
  itemsByOrder: ReadonlyMap<string, readonly string[]>;
  refundedLines: ReadonlySet<string>;
};

/**
 * Was every DISH on this order refunded? The KITCHEN's question — not the receipt's. `summarizeRefund`
 * (`lib/refund-view.ts`) answers "was every cent returned?", and a refunded order whose TIP stayed is
 * honestly "partial" there; the cook needs to know that no dish on it is still owed. Every line refund
 * is clamped to the POOL (`total − service − tip`, `mms_refund_line_amount` ↔ `remainingPoolCents`),
 * so a fully refunded tipped order never reaches its total — the common cash case, since W17c records
 * a cash tip by default (the blind pass on #360, CRITICAL 1). Any ONE of:
 *
 *   (a) the order is `refunded` — the processor's own verdict (a card refund reaching the total);
 *   (b) EVERY line of the order has a line refund in the ledger — exact: the amounts round each
 *       line's discount and tax shares separately and can sum a cent short of the pool, the rows
 *       cannot;
 *   (c) the amount refunded covers the goods pool, through the pool helper (never a copy of it). The
 *       amount is `refunded_cents`, not a ledger sum: every ledger insert raises it in the same
 *       transaction (`mms_record_refund`, `mms_refund_cash_line`; W23b backfilled the rows before
 *       it), and it ALSO carries a refund made from the processor's dashboard, which
 *       `mms_apply_refund_reconcile` records with no ledger row — the order-level refund the ledger
 *       never sees. So it is the ledger's sum and more, and needs no read.
 *
 * `lines` null (the ledger was unreadable) loses only (b): (a) and (c) read the order row itself.
 */
export function foodRefundedInFull(o: RefundOrderRow, lines: LineRefunds | null): boolean {
  if (o.status === "refunded") return true;
  const items = lines?.itemsByOrder.get(o.id) ?? [];
  if (items.length > 0 && items.every((id) => lines?.refundedLines.has(id) === true)) return true;
  const refunded = o.refunded_cents ?? 0;
  return (
    refunded > 0 &&
    remainingPoolCents({
      totalCents: o.total_cents,
      serviceChargeCents: o.service_charge_cents ?? 0,
      tipCents: o.tip_cents ?? 0,
      ledgerRefundedCents: refunded,
    }) === 0
  );
}

export function refundedCarts(
  orders: readonly RefundOrderRow[],
  lines: LineRefunds | null,
): Set<string> {
  const refunded = new Set<string>();
  const standing = new Set<string>();
  for (const o of orders) {
    if (!o.cart_id) continue;
    const full = foodRefundedInFull(o, lines);
    if (full) refunded.add(o.cart_id);
    else if (o.status === "paid") standing.add(o.cart_id);
  }
  return new Set([...refunded].filter((c) => !standing.has(c)));
}
