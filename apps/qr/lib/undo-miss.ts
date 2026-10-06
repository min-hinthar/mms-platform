import "server-only";
import { serviceClient } from "@mms/db/server";

/**
 * WHY an undo took back nothing — the ONE diagnosis, shared by both doors: the diner's `undoFire`
 * (lib/cart.ts) and the console's `staffUndoFire` (lib/staff-send.ts). `mms_undo_fire` and its counter
 * twin answer 0 for different facts, and neither door may tell them apart by guessing. Every verdict
 * rests on a line read, never on an absence the read cannot explain:
 *
 *  - `expired` — a line the kitchen has (any state but `voided`, comped included) still carries this
 *    batch and none of them is one the un-fire could still move: the grace ran out. Also the answer
 *    when the cart is no longer OPEN, and the answer to every unreadable check.
 *  - `frozen` — at least one batch line is still `fired`, not comped and inside its grace (`fire_at`
 *    later than now), yet the un-fire moved nothing. On an open cart the only legs left that refuse it
 *    are M258's fresh pay lock / split freeze, so the undo is REFUSED, not late (J45): the diner's door
 *    says the lock's sentence and keeps the window. Decided by the lines, not by a later re-read of the
 *    lock — a lock taken and freed inside one create-intent (an unsent draft, a sold-out line) is gone
 *    by any re-read, and the lines still say "in grace" (the self-review on #315). The comparison uses
 *    this server's clock against the DB-stamped `fire_at`; at the grace's edge a skew of a moment can
 *    say `frozen` for a line the RPC just called late (the window then closes on its own clock) or
 *    `expired` for one it would still have moved.
 *  - `voided` — no line the kitchen could have carries the batch, but a VOIDED one does
 *    (`mms_void_line` keeps `fire_batch`): staff removed what was sent. Nothing is with the kitchen and
 *    nothing came back as a draft that this read can prove — "Brought back" there was a lie (the
 *    self-review on #315). A batch whose undo landed beside a void reads the same; no column tells
 *    the two apart, and the sentence each door says is true of both.
 *  - `gone` — the cart is still OPEN and NO line carries the batch at all. Un-fire clears
 *    `fire_batch`, a void keeps it, a merge cancels the cart, and nothing else deletes a fired line —
 *    so this is an earlier undo of THIS batch whose answer was lost (a re-tap, a retry). "Too late —
 *    the kitchen has it" there would send a diner to a server, or staff to Void, over a dish nobody is
 *    cooking.
 *
 * The blind pass on #315 found three readings the first version got wrong:
 *
 *  - A VOIDED line keeps its `fire_batch`, so it is not evidence the kitchen has anything.
 *  - A COMPED line is: un-fire skips it (a committed loss), so it stays `fired` with the batch while
 *    the kitchen cooks it. A batch whose other lines came back on a lost answer therefore re-asks as
 *    `expired` — the conservative sentence, true of the comped dish; the read shows the rest back.
 *    Not counting it, an all-comped batch answered "brought back" over food on the pass, and
 *    "nothing is with the kitchen" is never said on no evidence.
 *  - A MERGE (`mms_merge_table_orders`) cancels the source cart and, in the same transaction, either
 *    re-parents each non-voided, non-comped line onto the target (batch, state and grace intact) or
 *    FOLDS it into a matching target line (the source line deleted, its units riding the target's
 *    batch and grace). Comped and voided lines stay behind on the cancelled cart. In every branch the
 *    source no longer proves an undo landed, so `gone` needs the cart still `open` — read AFTER the
 *    first line read: a merge committing between the two reads either left the lines visible to the
 *    first (→ not `gone`) or the cancelled status to the second. The other order straddles that commit.
 *
 * An unread check answers `expired`: of the sentences it is the one that sends people to LOOK at the
 * dishes.
 *
 * ⚠️ J37 — this LIVED in staff-send.ts as a private function and moved here when the diner's undo
 * became its second reader (`promo-refusal.ts`'s precedent: two copies of a refusal diagnosis WILL
 * drift). Deliberately a plain `server-only` module and NOT a `"use server"` file: exported from an
 * action module it would mint an unauthenticated public POST around a service-role read of any cart.
 */
export type UndoMiss = "expired" | "frozen" | "voided" | "gone";

export async function undoMissReason(cartId: string, batch: string): Promise<UndoMiss> {
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
  if (cart?.status !== "open") return "expired";
  if (data?.length) {
    // J45 — is any of them still one the un-fire could move? Then the 0 was a refusal, not the clock.
    const { data: live, error: liveErr } = await db
      .from("qr_cart_items")
      .select("id")
      .eq("cart_id", cartId)
      .eq("fire_batch", batch)
      .eq("state", "fired")
      .eq("comped", false)
      .gt("fire_at", new Date().toISOString())
      .limit(1);
    if (liveErr) {
      console.error("[undo-miss] undo grace check failed", { message: liveErr.message });
      return "expired"; // deliberate: unread is never "refused, try again"
    }
    return live?.length ? "frozen" : "expired";
  }
  // Nothing the kitchen could have carries the batch: an earlier undo cleared it, or staff voided it.
  const { data: voided, error: voidErr } = await db
    .from("qr_cart_items")
    .select("id")
    .eq("cart_id", cartId)
    .eq("fire_batch", batch)
    .eq("state", "voided")
    .limit(1);
  if (voidErr) {
    console.error("[undo-miss] undo void check failed", { message: voidErr.message });
    return "expired"; // deliberate: unread is never "brought back"
  }
  return voided?.length ? "voided" : "gone";
}
