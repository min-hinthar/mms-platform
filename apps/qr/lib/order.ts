import "server-only";
import { serviceClient } from "@mms/db/server";
import { cartViewInput } from "@mms/db/schemas";
import { assertSessionMember } from "./authz";

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
