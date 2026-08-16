/**
 * W19 — the ONE reading of "what pickup timing does this cart hold" (the name-it-once rule applied
 * to fulfillment metadata). A cart with a `pickup_slot` but NULL `fire_at` is an ASAP SNAP
 * placeholder (`mms_pickup_asap` sets pickup_slot for capacity + fire_at = null to fire now), NOT an
 * intentional schedule (`mms_set_pickup_slot` always writes fire_at = slot − prep). Treat that as
 * ASAP, so a reload/refresh shows "⚡ ASAP", never the snapped slot mislabeled "Scheduled".
 *
 * Shared by app/cart/page.tsx (the server seed) and Checkout's refresh() (the live re-read) — the
 * W19 pickup bug was exactly these two disagreeing: the page normalized, the client refresh never
 * re-read the slot at all, so a pay-step round-trip remounted the choice from a stale prop and
 * relit ASAP over a scheduled cart.
 */
export function normalizePickupSlot(
  pickupSlot: string | null,
  fireAt: string | null,
): string | null {
  return pickupSlot != null && fireAt == null ? null : pickupSlot;
}
