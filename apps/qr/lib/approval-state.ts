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
/**
 * The line as it stands now; `null` when it is gone. `offTheBill` — removed or made free SINCE the ask
 * (a manager's own PIN void or comp; `mms_request_approval` refuses a line that already was): the
 * dish is already off, so approving the request would record the loss twice (the blind pass on #333).
 */
export type RequestLineNow = { qty: number; unitPriceCents: number; offTheBill: boolean } | null;
export type RequestCardState = "open" | "paid" | "cleared" | "changed";

/** The live line from its `qr_cart_items` row — the ONE derivation both readers use (the queue's
 *  `listPendingApprovals` and the pane's `readPendingApprovalFlags`). */
export function lineNowFromRow(
  row:
    | { qty: number; unit_price_cents: number; state?: string | null; comped?: boolean | null }
    | null
    | undefined,
): RequestLineNow {
  if (!row) return null;
  const offTheBill = row.state === "voided" || row.comped === true;
  return { qty: row.qty, unitPriceCents: row.unit_price_cents, offTheBill };
}

/** M184's compare: the qty AND the amount (qty × unit price) against the request's snapshot — and a
 *  line already off the bill is not the line that was asked about either. */
export function lineChangedSinceRequest(
  snapshot: { qty: number; amountCents: number },
  now: RequestLineNow,
): boolean {
  if (now === null) return true;
  if (now.offTheBill) return true;
  return now.qty !== snapshot.qty || now.qty * now.unitPriceCents !== snapshot.amountCents;
}

/**
 * The sentence a changed request says — ONE choice, read by the card body and by the close-only
 * decision under it (the blind pass on #333: the inset said "no longer on the order" over a line the
 * card showed at its new qty). Gone → `goneNote`; already removed or made free → `doneNote`; still on
 * the order at a new figure → `note` with the live qty and amount.
 */
export type ChangedNote =
  | { k: "table.appr.changed.goneNote" }
  | { k: "table.appr.changed.doneNote" }
  | { k: "table.appr.changed.note"; qty: number; amountCents: number };

export function changedNote(now: RequestLineNow): ChangedNote {
  if (now === null) return { k: "table.appr.changed.goneNote" };
  if (now.offTheBill) return { k: "table.appr.changed.doneNote" };
  return { k: "table.appr.changed.note", qty: now.qty, amountCents: now.qty * now.unitPriceCents };
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
