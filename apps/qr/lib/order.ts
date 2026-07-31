import "server-only";
import { serviceClient } from "@mms/db/server";
import { cartViewInput } from "@mms/db/schemas";
import { assertSessionMember, getCallerUid } from "./authz";

/**
 * Resolve the ONE order produced by a completed split-tender (M3·P3.3b), for the /track receipt.
 *
 * A split order has NO `stripe_payment_intent_id` (the N per-payer PIs live on `qr_cart_shares`), so
 * /track can't key it off `payment_intent` like single-pay does — it resolves the order via a share's
 * stamped `order_id` (set by `mms_fulfill_split_order`). By the time the table reaches /track the cart
 * is `paid`, so `assertCartMember` (which rejects non-open carts) is the wrong gate; authorize on
 * SESSION membership instead — the same `is_member` rule the `qr_order_read` RLS uses for the single-pay
 * tracker. Returns null until fulfillment stamps the order (a brief post-capture race) so the caller can
 * show an honest "confirming" state, never a dead-end "no order placed" stub. NOT a Server Action — a
 * plain server-only read for the RSC (no extra public POST surface).
 */
export async function getSplitOrderId(cartId: string): Promise<string | null> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  const db = serviceClient();

  // W9c — try the caller's OWN share row FIRST. `seat_id` is the payer's uid, so this is uid-scoped
  // and needs no session membership — which matters because `assertSessionMember` below fails the
  // moment a server clears the table, and every split payer then lost /track entirely: the page fell
  // to "Payment received — we're finalizing" with a Refresh that re-ran the same failing gate forever,
  // hours after the order was finalized. This path also covers NON-HOST payers, who are exactly the
  // diners `earned_by` never reaches (OPEN-ITEMS M29).
  const uid = await getCallerUid().catch(() => null);
  if (uid) {
    const { data: own } = await db
      .from("qr_cart_shares")
      .select("order_id")
      .eq("cart_id", id)
      .eq("seat_id", uid)
      .not("order_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (own?.order_id) return own.order_id;
  }

  // Otherwise fall back to session membership — still needed BEFORE the order is stamped (the brief
  // post-capture race, when no share carries an order_id yet) and for a member watching who did not
  // themselves pay a share.
  const { data: cart } = await db.from("qr_carts").select("session_id").eq("id", id).maybeSingle();
  if (!cart) return null;
  await assertSessionMember(cart.session_id); // throws 403 if not a member / session closed-or-expired
  const { data: share } = await db
    .from("qr_cart_shares")
    .select("order_id")
    .eq("cart_id", id)
    .not("order_id", "is", null)
    .limit(1)
    .maybeSingle();
  return share?.order_id ?? null;
}
