import "server-only";
import { serviceClient } from "@mms/db/server";

/**
 * WHY an undo took back nothing — the ONE diagnosis, shared by both doors: the diner's `undoFire`
 * (lib/cart.ts) and the console's `staffUndoFire` (lib/staff-send.ts). `mms_undo_fire` and its counter
 * twin answer 0 for different facts, and neither door may tell them apart by guessing:
 *
 *  - `expired` — lines carrying this batch still exist: the grace ran out and the kitchen has them
 *    (or, since M258, a fresh pay lock / split freeze refused the un-fire in the statement itself).
 *  - `gone` — NO line on the cart carries the batch any more. Un-fire clears `fire_batch` (and a void
 *    keeps it), so this is an earlier undo of THIS batch whose answer was lost (a re-tap, a retry).
 *    "Too late — the kitchen has it" there would send a diner to a server, or staff to Void, over a
 *    dish nobody is cooking.
 *
 * An unread check answers `expired`: of the two sentences it is the one that sends people to LOOK at
 * the dishes, and "nothing is with the kitchen" must never be said on no evidence.
 *
 * ⚠️ J37 — this LIVED in staff-send.ts as a private function and moved here when the diner's undo
 * became its second reader (`promo-refusal.ts`'s precedent: two copies of a refusal diagnosis WILL
 * drift). Deliberately a plain `server-only` module and NOT a `"use server"` file: exported from an
 * action module it would mint an unauthenticated public POST around a service-role read of any cart.
 */
export async function undoMissReason(cartId: string, batch: string): Promise<"expired" | "gone"> {
  const { data, error } = await serviceClient()
    .from("qr_cart_items")
    .select("id")
    .eq("cart_id", cartId)
    .eq("fire_batch", batch)
    .limit(1);
  if (error) {
    console.error("[undo-miss] undo batch check failed", { message: error.message });
    return "expired"; // deliberate: the conservative steer (see above)
  }
  return data?.length ? "expired" : "gone";
}
