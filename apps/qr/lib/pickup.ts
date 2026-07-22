"use server";
import { serviceClient } from "@mms/db/server";
import { setPickupSlotInput, clearPickupSlotInput } from "@mms/db/schemas";
import { assertCartMember } from "./authz";
import { withinMutationRate } from "./rate";
import { getPostHogClient } from "./posthog-server";

// Honest pickup scheduling (M2·P2.2). Slots + capacity + the slot↔fire_at math are all in the DB
// (mms_pickup_slots / mms_set_pickup_slot, service-role only); these actions are the thin authorized
// edge. The client never invents a slot — it picks one the server offered, and the server re-validates.

export type PickupSlot = { slot: string; remaining: number };

/**
 * The restaurant's currently-bookable pickup slots for today, capacity-aware (full ones omitted).
 * Public availability — no membership needed (it reveals only open times, no diner data) — but it's
 * still server-only: the client can't enumerate or forge slots, only render what the kitchen can take.
 */
export async function getPickupSlots(excludeCart?: string): Promise<PickupSlot[]> {
  // `excludeCart` drops that cart's own hold from the capacity count, so a diner sees true availability
  // for re-picking their slot (without it, their own in-progress hold would make the slot look full).
  const { data, error } = await serviceClient().rpc("mms_pickup_slots", {
    p_exclude_cart: excludeCart,
  });
  if (error) {
    console.error("[pickup] mms_pickup_slots failed", error);
    return [];
  }
  return (data ?? []).map((r) => ({ slot: r.slot_time, remaining: r.remaining }));
}

/**
 * The configured kitchen prep estimate (minutes) — the single honest basis for the S4.2 "ready in ~X"
 * to-go signal (same value that drives the pickup ETA: fire_at = slot − prep). NOT a live countdown — an
 * estimate the owner tunes in `pickup_config`. Falls back to the column default (12) on a read miss so the
 * UI always has an honest-ish number rather than a blank.
 */
export async function getPrepMinutes(): Promise<number> {
  const { data, error } = await serviceClient()
    .from("pickup_config")
    .select("prep_minutes")
    .maybeSingle();
  if (error || !data) return 12; // matches the pickup_config.prep_minutes column default
  return data.prep_minutes;
}

export type SetSlotResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "cart_closed" | "locked" | "error" };

/**
 * Set the cart's pickup slot. Authorized like every mutation (member + not host-locked); the DB
 * re-checks the slot is still real and has room (capacity is server-authoritative — a stale pick that
 * filled in the meantime is rejected) and stores `pickup_slot` + the derived `fire_at`.
 */
export async function setPickupSlot(cartId: string, slot: string): Promise<SetSlotResult> {
  const input = setPickupSlotInput.parse({ cartId, slot });
  const { uid, locked } = await assertCartMember(input.cartId);
  // Per-device flood guard (P3.4). setPickupSlot returns a result discriminant (doesn't throw), so map
  // a rate trip to the generic "error" reason rather than throwing — honoring its contract.
  if (!(await withinMutationRate(uid))) return { ok: false, reason: "error" };
  if (locked) return { ok: false, reason: "locked" };

  const { data, error } = await serviceClient().rpc("mms_set_pickup_slot", {
    p_cart_id: input.cartId,
    p_slot: input.slot,
  });
  if (error) {
    console.error("[pickup] mms_set_pickup_slot failed", error);
    return { ok: false, reason: "error" };
  }
  const row = data?.[0];
  if (!row?.ok)
    return { ok: false, reason: (row?.reason as "unavailable" | "cart_closed") ?? "unavailable" };

  getPostHogClient().capture({
    distinctId: uid,
    event: "pickup_slot_set",
    properties: { cart_id: input.cartId, slot: input.slot },
  });
  return { ok: true };
}

/**
 * W5e — choose ASAP ("make it now"): clear any scheduled slot so the order fires immediately at
 * settlement (mms_fire_pending_food fires a null-fire_at to-go line now). Authorized like every
 * mutation (member + not host-locked + rate). Touches no amount — pickup_slot/fire_at are fulfillment.
 */
export async function setPickupAsap(cartId: string): Promise<SetSlotResult> {
  const input = clearPickupSlotInput.parse({ cartId });
  const { uid, locked } = await assertCartMember(input.cartId);
  if (!(await withinMutationRate(uid))) return { ok: false, reason: "error" };
  if (locked) return { ok: false, reason: "locked" };

  const { data, error } = await serviceClient().rpc("mms_clear_pickup_slot", {
    p_cart_id: input.cartId,
  });
  if (error) {
    console.error("[pickup] mms_clear_pickup_slot failed", error);
    return { ok: false, reason: "error" };
  }
  const row = data?.[0];
  if (!row?.ok) return { ok: false, reason: (row?.reason as "cart_closed") ?? "error" };

  getPostHogClient().capture({
    distinctId: uid,
    event: "pickup_asap_set",
    properties: { cart_id: input.cartId },
  });
  return { ok: true };
}
