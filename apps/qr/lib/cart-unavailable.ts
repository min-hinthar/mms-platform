/**
 * W9d — the client-safe half of `cart-failure.ts` (which is `server-only`; this module holds the
 * type + the one predicate the /grocery page needs at render time). See cart-failure.ts for why the
 * reason is derived behind its own membership gate rather than forwarded from `AuthzError.code`.
 */
export type CartUnavailable =
  /** The cart was paid for — a fresh basket is the only way forward, and nothing is being lost. */
  | "paid"
  /** The cart was cancelled/voided out from under this device. */
  | "cancelled"
  /** The table session aged out or was closed. A re-mint recovers; the old lines are gone. */
  | "session_expired"
  /** Someone is in the pay window — a transient freeze, NOT a reason to abandon the basket. */
  | "locked"
  /** The table is splitting the bill — also transient, also not a reason to re-mint. */
  | "settling"
  /** We could not establish a terminal reason: a non-member, an unknown cart, or a failed read.
   *  The caller must offer Retry and MUST NOT offer to start a fresh basket — see isTerminal. */
  | "unreadable";

/**
 * Terminal reasons only: the ones where the old cart is genuinely finished, so re-minting is a
 * recovery rather than a silent data loss.
 *
 * ⚠️ This distinction is load-bearing. `/api/session`'s mint FIND-OR-CREATES: a re-mint against a
 * cart we merely failed to READ provisions a brand-new open cart, and every line the shopper
 * couldn't see is abandoned on the old one — still real, still theirs, now invisible. So the "Start
 * a fresh basket" affordance is gated on this predicate, and a transient failure only ever gets
 * Retry.
 */
export function isTerminal(reason: CartUnavailable): boolean {
  return reason === "paid" || reason === "cancelled" || reason === "session_expired";
}
