"use server";
import { getSplitOrderId } from "./order";

/**
 * Client-callable resolver for a split-tender order's id (M-nav follow-up). A split order has no
 * PaymentIntent (the N per-payer PIs live on `qr_cart_shares`), so the header pill / homepage resume card
 * can't key live status off `payment_intent` like single-pay does — they resolve the order id from the cart
 * id via this action, then subscribe with `useOrderStatus`.
 *
 * Thin member-gated wrapper over the `server-only` `getSplitOrderId`, which authorizes via
 * `assertSessionMember` (the same `is_member` rule `qr_order_read` RLS uses) and validates the cart id
 * (`cartViewInput.parse`). So this leaks nothing to a non-member — a 403 there returns null here — and it's a
 * read-only resolve (no money, no mutation). Returns null until fulfillment stamps the order id (a brief
 * post-capture race), so the pill just stays generic ("Your order") until it lands.
 */
export async function resolveSplitOrderId(cartId: string): Promise<string | null> {
  try {
    return await getSplitOrderId(cartId);
  } catch {
    return null; // not a member / not yet stamped / bad id → no live key, pill stays generic
  }
}
