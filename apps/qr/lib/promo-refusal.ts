import "server-only";
import { serviceClient } from "@mms/db/server";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";

/**
 * Why a promo write matched no row — READ, never assumed. The ONE diagnosis, shared by both doors.
 *
 * Three different facts land on the same zero row count (the cart closed, a tablemate took the pay
 * lock, the table began settling), and answering `cart_closed` for all three is the fabricated
 * diagnosis this repo spent M116 and M119 removing: a diner whose tablemate is simply mid-checkout
 * would be told their order is no longer open. A fourth outcome is honest too — if this read fails
 * we do not KNOW why the write was refused, and `error` says exactly that rather than inventing a
 * verdict. Same shape as `acquireCartLock`'s "0 rows: read the status to message it honestly".
 *
 * ⚠️ P3 — this LIVED in `cart.ts` as a private function, and it moved here the moment a SECOND
 * writer of `qr_carts.promo_code` shipped (`lib/staff-promo.ts`, the register's apply/remove).
 * Two copies of a refusal diagnosis is the drift shape CLAUDE.md's W17 rules name outright: a value
 * computed in one place and quoted in another WILL drift, and this one decides what a diner and a
 * server are TOLD about a refused money write. One function, one verdict, and the two mutants that
 * guard it (`cart/promo-diagnosis-read-swallows-its-error`,
 * `cart/promo-diagnosis-ignores-the-live-intent`) now cover both doors instead of one.
 *
 * Deliberately a plain `server-only` module and NOT a `"use server"` file: exporting this from an
 * action module would mint an unauthenticated public POST around a service-role read of any cart's
 * pay state (the same rule `staff-open-cart.ts` states for `openCartFor`).
 */
export type PromoRefusal = "error" | "cart_closed" | "locked";

/**
 * `anySettleStarted` — the STAFF doors' stricter settle axis, in the diagnosis as well as the write.
 *
 * `lib/staff-promo.ts` refuses on a NON-NULL `settle_at` rather than a fresh one (see its docblock:
 * a Stripe Terminal reader charge writes neither the pin nor `live_payment_intent_id` and creates no
 * share row, so a freeze that went stale because the collect panel stopped polling is the ONLY thing
 * left standing between a capturable reader PI and a promo write). Without telling the diagnosis
 * that, a staff refusal in exactly that window would fall through every branch below and answer
 * `cart_closed` on a cart that is open — a fabricated verdict of the M116/M119 shape, on the one
 * refusal that exists to prevent a charged card with no order.
 *
 * The DINER caller passes nothing and is unchanged: its write is TTL-aware on this axis, so a stale
 * `settle_at` is not a reason it was refused and must not be reported as one.
 */
export async function refusedPromoReason(
  cartId: string,
  { anySettleStarted = false }: { anySettleStarted?: boolean } = {},
): Promise<PromoRefusal> {
  const { data: cart, error } = await serviceClient()
    .from("qr_carts")
    .select("status,locked,locked_at,settle_at,live_payment_intent_id")
    .eq("id", cartId)
    .maybeSingle();
  // `maybeSingle` so a genuinely missing cart is `{ data: null, error: null }` and not an error —
  // the same separation `order-lines.ts` needed for exactly this reason.
  if (error) return "error";
  if (!cart || cart.status !== "open") return "cart_closed";
  const lockedFresh =
    cart.locked &&
    cart.locked_at !== null &&
    new Date(cart.locked_at).getTime() > Date.now() - CART_LOCK_TTL_MS;
  const settlingFresh =
    cart.settle_at !== null && new Date(cart.settle_at).getTime() > Date.now() - SETTLE_TTL_MS;
  // "locked" is the shared frozen-order copy — the same reason the pre-check above returns for a
  // settling cart, so the diner sees one consistent explanation for one consistent situation.
  if (lockedFresh || settlingFresh) return "locked";
  // The staff axis: a settlement was STARTED on this open cart and never cleanly ended. "Locked" is
  // the honest word — a payment for this order may still be collectable on the reader.
  if (anySettleStarted && cart.settle_at !== null) return "locked";
  // M152 (a) — a live single-pay intent past the lock TTL. "Locked" is the honest word: a payment
  // for this order is still open on someone's phone, which is exactly what the lock sentence says.
  if (cart.live_payment_intent_id) return "locked";
  // Open, unfrozen, and still no row: the cart vanished between the two statements. `cart_closed` is
  // the honest floor here — we read the cart and it does not justify a freeze answer.
  return "cart_closed";
}
