/**
 * A4·2 · K30 (B) — the takeaway lane's two PURE rules, in `lib/` where a value can falsify them.
 *
 * A kitchen bump moves `qr_cart_items.state` and nothing else (K30): the guest's tracker, the wall
 * and the expo all read `qr_orders.togo_status`, which only the bagger's tap moves. So the counter
 * had no signal that the wok was done and tapped by eye. Until the prod migration that stamps
 * `kitchen_done_at` on the order (K30 (A), Min's go), the lane derives the same fact from the
 * cart's own lines — ADVISORY, never a gate: a badge that cannot misidentify a bag degrades to
 * "unknown" on a failed read and the queue keeps its due-time order.
 */

/**
 * `done` — every to-go FOOD line the kitchen owns has been served (or there is none left to cook);
 * `cooking` — at least one is still draft, fired or in progress; `unknown` — the cart's lines could
 * not be read (or the order carries no cart), so the lane says nothing.
 */
export type KitchenState = "done" | "cooking" | "unknown";

/** The two columns the rule reads off `qr_cart_items`. */
export type KitchenLineRow = { state: string; fulfillment: string };

/**
 * The bag's kitchen state from its cart's lines.
 *
 * Only `togo` lines count: a dine-in line on a mixed order stays on the table (it is not in the
 * bag), and a `grocery` line is never fired (bag-and-go), so a grocery-only bag is "done" the
 * moment it is paid — which is exactly what the counter needs to know about it. A voided line is
 * off the ticket and cannot keep a bag "cooking" forever.
 */
export function kitchenStateOf(lines: readonly KitchenLineRow[] | undefined): KitchenState {
  if (lines === undefined || lines.length === 0) return "unknown";
  const togo = lines.filter((l) => l.fulfillment === "togo");
  const food = togo.filter((l) => l.state !== "voided");
  // Every dish on the bag voided after payment: nothing left to cook, and "Kitchen done" on a bag
  // that is being refunded would be a true sentence that misleads — say nothing (blind pass).
  if (togo.length > 0 && food.length === 0) return "unknown";
  return food.some((l) => l.state !== "served") ? "cooking" : "done";
}

/** The fields the lane's order reads off a ticket. */
export type ExpoOrderKey = {
  orderId: string;
  arrivedAt: string | null;
  kitchen: KitchenState;
  pickupSlot: string | null;
  createdAt: string;
};

/**
 * The lane's order (W3a, extended by K30 (B)): a waiting HUMAN outranks everything ("Here now"),
 * then a bag the kitchen has finished outranks one still cooking — it can be bagged NOW — then the
 * effective due time (the pickup slot when one exists, else when it was paid), then the short code
 * as a stable tiebreak. `unknown` sits with `done`: not knowing is not a reason to sink a bag.
 */
export function compareExpoTickets(a: ExpoOrderKey, b: ExpoOrderKey): number {
  const arrived = Number(!a.arrivedAt) - Number(!b.arrivedAt);
  if (arrived !== 0) return arrived;
  const cooking = Number(a.kitchen === "cooking") - Number(b.kitchen === "cooking");
  if (cooking !== 0) return cooking;
  const dueA = Date.parse(a.pickupSlot ?? a.createdAt);
  const dueB = Date.parse(b.pickupSlot ?? b.createdAt);
  if (dueA !== dueB) return dueA - dueB;
  return a.orderId.localeCompare(b.orderId);
}
