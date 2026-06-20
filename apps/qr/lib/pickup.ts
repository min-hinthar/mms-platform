"use server";
import { serviceClient } from "@mms/db/server";
import { setPickupSlotInput } from "@mms/db/schemas";
import { assertCartMember } from "./authz";
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
