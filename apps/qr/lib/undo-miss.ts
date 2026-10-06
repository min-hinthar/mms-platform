import "server-only";
import { serviceClient } from "@mms/db/server";

/**
 * WHY an undo took back nothing — the ONE diagnosis, shared by both doors: the diner's `undoFire`
 * (lib/cart.ts) and the console's `staffUndoFire` (lib/staff-send.ts). `mms_undo_fire` and its counter
 * twin answer 0 for different facts, and neither door may tell them apart by guessing:
 *
 *  - `expired` — a line carrying this batch is still with the kitchen (any state but `voided`): the
 *    grace ran out, or (since M258) a fresh pay lock / split freeze refused the un-fire in the statement
 *    itself — the diner's door re-reads the lock before it says so (J45, lib/cart.ts).
 *  - `gone` — the cart is still OPEN and no line on it that the kitchen could have carries the batch.
 *    Un-fire clears `fire_batch`, so this is an earlier undo of THIS batch whose answer was lost (a
 *    re-tap, a retry). "Too late — the kitchen has it" there would send a diner to a server, or staff
 *    to Void, over a dish nobody is cooking.
 *
 * Three readings the blind pass on #315 found, each a false "brought back" or a false "too late":
 *
 *  - A VOIDED line keeps its `fire_batch` (`mms_void_line` never clears it), so it is not evidence the
 *    kitchen has anything — a batch whose undo landed beside a voided line read `expired` forever.
 *  - A COMPED line is: un-fire skips it (a committed loss), so it stays `fired` with the batch, and the
 *    kitchen is cooking it. A batch whose other lines came back on a lost answer therefore re-asks as
 *    `expired` — the conservative sentence, true of the comped dish; the read shows the rest back. The
 *    other way round (comped not counted) an all-comped batch answered "brought back" over food on the
 *    pass, and "nothing is with the kitchen" is never said on no evidence.
 *  - A MERGE (`mms_merge_table_orders`) re-parents the source cart's lines — batch, state and grace
 *    intact — onto the target and cancels the source, in one transaction. The source then carries no
 *    line with the batch and read `gone`: "brought back" over dishes cooking on the merged table. So
 *    `gone` needs the cart still `open`, read AFTER the lines: a merge committing between the two reads
 *    either left the lines visible to the first (→ `expired`) or the cancelled status to the second.
 *    The other order — cart first, lines second — straddles exactly that commit.
 *
 * An unread check answers `expired`: of the two sentences it is the one that sends people to LOOK at
 * the dishes.
 *
 * ⚠️ J37 — this LIVED in staff-send.ts as a private function and moved here when the diner's undo
 * became its second reader (`promo-refusal.ts`'s precedent: two copies of a refusal diagnosis WILL
 * drift). Deliberately a plain `server-only` module and NOT a `"use server"` file: exported from an
 * action module it would mint an unauthenticated public POST around a service-role read of any cart.
 */
export async function undoMissReason(cartId: string, batch: string): Promise<"expired" | "gone"> {
  const db = serviceClient();
  const { data, error } = await db
    .from("qr_cart_items")
    .select("id")
    .eq("cart_id", cartId)
    .eq("fire_batch", batch)
    .neq("state", "voided")
    .limit(1);
  if (error) {
    console.error("[undo-miss] undo batch check failed", { message: error.message });
    return "expired"; // deliberate: the conservative steer (see above)
  }
  if (data?.length) return "expired";
  // Only now the cart (the docblock's merge): a status read BEFORE the lines could straddle the commit.
  const { data: cart, error: cartErr } = await db
    .from("qr_carts")
    .select("status")
    .eq("id", cartId)
    .maybeSingle();
  if (cartErr) {
    console.error("[undo-miss] undo cart check failed", { message: cartErr.message });
    return "expired"; // deliberate: the same conservative steer
  }
  return cart?.status === "open" ? "gone" : "expired";
}
