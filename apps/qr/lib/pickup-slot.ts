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

/**
 * W20 — slot equality by INSTANT, never by string. The same wall-clock slot reaches the client in
 * two serializations (the availability RPC's `slot_time` vs the cart row's `pickup_slot` — PostgREST
 * offset formats can differ, and a refresh() swaps one for the other), so `a === b` intermittently
 * missed and the sheet showed no chip selected — the owner's "still not on selected slot".
 */
export function sameSlot(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Number.isFinite(ta) && ta === tb;
}
