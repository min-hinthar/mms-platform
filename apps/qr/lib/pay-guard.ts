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
  // ⚠️ W10d pre-merge review — only a share backed by a PaymentIntent is money in flight. A $0
  // by-person seat (a diner who ordered nothing) is auto-settled to `captured` with a NULL PI purely so
  // it can't block the all-covered gate; counting it here returned `split_in_progress` INDEPENDENT of
  // the freshness TTL, which permanently refused cash-settle, clear-table, voids, comps, approvals,
  // merges and every staff line edit on that table — with no way out, because abort was refused too.
  //
  // ⚠️ W10d pre-merge RE-review — FAIL CLOSED on the read error. This count was the whole guard, and
  // dropping `error` made it fail OPEN: postgrest only parses `content-range` inside `if (res.ok)`, so
  // any transport failure yields `count: null`, `(count ?? 0) > 0` is false, and every caller
  // (`settleCash`, `clearTable`, merge, voids, comps, approvals) is told there is no payment in flight.
  // The window is real, not theoretical: `captureAllIfReady` deliberately captures on a STALE freeze
  // once the table is fully covered, so between that capture and the succeeded webhook the cart is
  // `open`, `settle_at` is stale — the `isFresh` branch above returns nothing — and this read is the
  // ONLY thing standing between captured cards and a second settlement. `mms_fulfill_cash_order` gates
  // on `cart.status = 'open'` alone. The sibling count read in `staff-cart.ts` already fails closed for
  // exactly this reason ("a failed count is not an EMPTY table").
  const { count, error } = await db
    .from("qr_cart_shares")
    .select("id", { count: "exact", head: true })
    .eq("cart_id", cart.id)
    .in("status", ["authorized", "captured"])
    .not("stripe_payment_intent_id", "is", null);
  if (error) {
    console.error("[pay-guard] in-flight share read failed", { cartId: cart.id, error });
    return "split_in_progress";
  }
  if ((count ?? 0) > 0) return "split_in_progress";
  return null;
}
