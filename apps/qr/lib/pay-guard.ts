import "server-only";
import { serviceClient } from "@mms/db/server";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock";

/**
 * The shared "is money moving on this cart?" guard (S1.3) — the single source for the two staff actions
 * that would invalidate an in-flight payment: clear-table turnover (lib/floor.ts) and cash settle
 * (lib/staff-cart.ts). Single-sourced so the two can't drift on a money path. Returns a reason the
 * caller maps to honest copy, or null when it's safe to proceed.
 */

/** Within the TTL window (same app-clock basis as lib/lock.ts) → an active (not stale/abandoned) hold. */
export function isFresh(ts: string | null, ttlMs: number): boolean {
  return ts != null && Date.now() - new Date(ts).getTime() < ttlMs;
}

export type PaymentInFlight = "mid_payment" | "split_in_progress";

type CartPayState = {
  id: string;
  locked: boolean;
  locked_at: string | null;
  settle_at: string | null;
};

/**
 * Why an action that closes/settles the cart must be refused right now, or null if clear.
 *  - "mid_payment": a FRESH single-pay lock or an open split-settlement freeze (the TTLs auto-release an
 *    abandoned one, so this only blocks an ACTIVE payment).
 *  - "split_in_progress": a split where any share is already authorized/captured — independent of the
 *    freshness TTL: a settlement abandoned past SETTLE_TTL can still hold a captured share, and
 *    cancelling/settling the cart out from under it would strand a charge with no order. Closing this
 *    window is why this check is separate from the freshness one.
 */
export async function paymentInFlightReason(
  cart: CartPayState | null,
): Promise<PaymentInFlight | null> {
  if (!cart) return null;
  if (
    isFresh(cart.settle_at, SETTLE_TTL_MS) ||
    (cart.locked && isFresh(cart.locked_at, CART_LOCK_TTL_MS))
  )
    return "mid_payment";
  const db = serviceClient();
  const { count } = await db
    .from("qr_cart_shares")
    .select("id", { count: "exact", head: true })
    .eq("cart_id", cart.id)
    .in("status", ["authorized", "captured"]);
  if ((count ?? 0) > 0) return "split_in_progress";
  return null;
}
