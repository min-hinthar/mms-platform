/**
 * PD8 · M184 — what a pending request card IS, from the cart's status and the line as it stands now.
 *
 * The request row snapshots `qty` / `amount_cents` at the ask; the line can move afterwards (a qty
 * step, a re-price) and the cart can leave `open` (paid, or cancelled by a clear). The card's keys
 * follow this state: `open` offers Approve · Deny; `changed` and `paid` and `cleared` offer only
 * "Close it" (the `close` arm → `superseded`, never `denied`), because nothing on screen is the thing
 * that was asked about. The SQL (`mms_resolve_approval`, M184) decides the same question at the write;
 * this is the affordance, pure so each arm is a value here and a mutant in verify:slice.
 */

export type CartStatus = "open" | "paid" | "cancelled";
/** The line as it stands now; `null` when it is gone. */
export type RequestLineNow = { qty: number; unitPriceCents: number } | null;
export type RequestCardState = "open" | "paid" | "cleared" | "changed";

/** M184's compare: the qty AND the amount (qty × unit price) against the request's snapshot. */
export function lineChangedSinceRequest(
  snapshot: { qty: number; amountCents: number },
  now: RequestLineNow,
): boolean {
  if (now === null) return true;
  return now.qty !== snapshot.qty || now.qty * now.unitPriceCents !== snapshot.amountCents;
}

export function requestCardState(r: {
  cartStatus: CartStatus | null;
  qty: number;
  amountCents: number;
  lineNow: RequestLineNow;
}): RequestCardState {
  // The terminal cart states first: "paid" is `status === 'paid'`, never "not open" — a cancelled
  // cart is a cleared table, and its sentence says so (m8 appendix B3).
  if (r.cartStatus === "paid") return "paid";
  if (r.cartStatus !== "open") return "cleared";
  if (lineChangedSinceRequest({ qty: r.qty, amountCents: r.amountCents }, r.lineNow))
    return "changed";
  return "open";
}
