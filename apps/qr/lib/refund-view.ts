/**
 * W23b — what a refund looks like to the person it happened to (registry M2).
 *
 * The bug this closes is a sentence, not a calculation: a line-level refund (S4.3b) leaves
 * `qr_orders.status = 'paid'`, and W22r's itemized slip therefore printed every line at full price
 * under **"Paid in full · Card"** — on an order where money had already gone back. W1c shipped the
 * FULL-refund arm (status flips to 'refunded'), so only the partial case was ever wrong, which is
 * exactly the case a guest is most likely to be confused by: some of their money returned, and the
 * receipt insisting nothing had.
 *
 * PURE MODULE — the decisions live here so all four surfaces (the /track slip, the durable `?r=`
 * receipt, the receipt email, the /account history card) answer identically, and so the rules can
 * carry `verify:slice` mutants. The reads are in `track-order.ts` / `receipt-entry.ts` / `rewards.ts`.
 *
 * Money discipline, and the one place it bends: every row `buildReceiptRows` produces is still the
 * fulfillment-time snapshot rendered verbatim, and nothing here touches it. A refund is not a
 * correction to that snapshot — it is a LATER fact appended after it, which is why the Total row
 * stays exactly what was charged and the returned amount gets its own row beneath. `netPaidCents`
 * is the only derived number in this file: it is what the guest is out of pocket, it is derived
 * ONCE, here, and no surface computes it again.
 */
import type { ReceiptRow } from "./receipt-view";
import { dollars, tenderLabel } from "./receipt-view";

export type RefundState = "none" | "partial" | "full";

export type RefundSummary = {
  state: RefundState;
  /** Cents returned, as stated to the guest. */
  refundedCents: number;
  /** What the guest is actually out of pocket — `total − refunded`, floored at zero. */
  netPaidCents: number;
};

/**
 * The refund state of one order, from the two stored facts plus the payment status.
 *
 * `status` and `refundedCents` are written by DIFFERENT things and can legitimately disagree for a
 * beat, so both are consulted and the answer is always the one that claims LESS was paid:
 *
 *   • `status = 'refunded'` is flipped by `mms_apply_refund_reconcile` when Stripe reports the
 *     charge fully returned. A pre-W23b full refund — or one issued from the Stripe dashboard,
 *     which writes no ledger row — carries that status with `refunded_cents = 0`, so the amount is
 *     read as the whole total rather than reported as "$0.00 came back", which would be a lie in
 *     the guest's favour and no less wrong for it.
 *   • `refunded_cents >= total` can be true a beat BEFORE the status flip (the in-app path bumps
 *     the column inside `mms_record_refund`, and the webhook lands after). Treating that as full
 *     rather than partial keeps the receipt from briefly claiming a partial refund on an order that
 *     is entirely returned.
 *
 * A negative `refundedCents` cannot happen (the column carries a `>= 0` CHECK) but is floored
 * anyway: if a corrupt row ever reached here, the failure must not be a receipt that reads as
 * though the guest owes MORE than they were charged.
 */
export function summarizeRefund(
  totalCents: number,
  refundedCents: number,
  status: string,
): RefundSummary {
  const amount = Math.max(0, refundedCents);
  const fullByStatus = status === "refunded";
  const fullByAmount = totalCents > 0 && amount >= totalCents;
  if (fullByStatus || fullByAmount) {
    const shown = Math.max(amount, totalCents);
    return { state: "full", refundedCents: shown, netPaidCents: 0 };
  }
  if (amount > 0)
    return { state: "partial", refundedCents: amount, netPaidCents: totalCents - amount };
  return { state: "none", refundedCents: 0, netPaidCents: totalCents };
}

/**
 * The artifact's settled-state line. A REFUNDED order keeps its receipt (W7a review MED — the diner
 * needs documentation of a returned charge most of all) but must never claim "Paid in full".
 *
 * The state goes here and the AMOUNTS go in the rows below, deliberately: a receipt's settle line
 * names what happened and its money column names how much, and folding "$14.00 came back" into this
 * string would put a figure in the one place on the artifact a reader does not scan for figures.
 *
 * The full-refund string is W1c's, verbatim — it is shipped copy a guest may already have in their
 * inbox, and there is no improvement in it worth two receipts of the same order disagreeing.
 */
export function receiptStatusLabel(summary: RefundSummary, tender: string): string {
  if (summary.state === "full") return "Refunded — this charge was returned to you";
  if (summary.state === "partial") return `Partly refunded · ${tenderLabel(tender)}`;
  return `Paid in full · ${tenderLabel(tender)}`;
}

/**
 * The rows that follow the Total: what came back, then what the guest actually paid.
 *
 * Empty for an unrefunded order — the overwhelming case — so every surface can splice this in
 * unconditionally and nothing changes for the receipts that were already correct.
 *
 * "You paid" rather than "Net" or "Balance": the row answers the only question a guest reads a
 * refunded receipt to answer, and it should answer it in the words they would use.
 */
export function buildRefundRows(summary: RefundSummary): ReceiptRow[] {
  if (summary.state === "none") return [];
  return [
    { key: "refunded", label: "Refunded", amountCents: summary.refundedCents, negative: true },
    { key: "net", label: "You paid", amountCents: summary.netPaidCents, grand: true },
  ];
}

/**
 * The chip on a COLLAPSED order row, or null when nothing came back.
 *
 * Covers `full` as well as `partial`, and that is the whole point of it existing (Codex round 2 on
 * #201): `summarizeRefund` deliberately answers `full` when `refunded_cents >= total` BEFORE the
 * `charge.refunded` webhook flips the status, and `/account`'s history read filters `status='paid'`
 * — so a fully-returned order legitimately appears there in the `full` state. A partial-only
 * condition suppressed the chip for exactly that row, and the server-rendered card went on saying
 * "Paid · Card" over a wholly refunded order until the diner happened to reload. Deriving the label
 * from the state rather than testing one state at the call site is what makes that unrepeatable.
 */
export function refundChipLabel(summary: RefundSummary): string | null {
  if (summary.state === "full") return "Refunded";
  if (summary.state === "partial") return "Partly refunded";
  return null;
}

/**
 * The refund clause spoken inside a collapsed row's accessible name — "" when nothing came back.
 *
 * A screen-reader user must not have to expand a card to learn money moved, so the amounts go in
 * the name even though the visible chip carries only the state. Returns a leading-comma fragment
 * because it is spliced into a longer composed name.
 */
export function refundSpokenClause(summary: RefundSummary): string {
  if (summary.state === "none") return "";
  if (summary.state === "full")
    return `, fully refunded, ${dollars(summary.refundedCents)} returned to you`;
  return `, ${dollars(summary.refundedCents)} refunded, you paid ${dollars(summary.netPaidCents)}`;
}

/**
 * The mark on a single refunded line, or null.
 *
 * States the amount rather than crossing the line out: a refund can be clamped below the line's own
 * price by the order-level over-refund cap (`mms_refund_authorize`, W17 remediation P1-1), so a
 * struck-through line would claim the whole dish came back when only part of it did. The number is
 * never wrong; a strike-through sometimes is.
 */
export function lineRefundLabel(refundedCents: number): string | null {
  return refundedCents > 0 ? `Refunded ${dollars(refundedCents)}` : null;
}

/**
 * The one-line explanation shown beneath a partially-refunded receipt.
 *
 * Only for the PARTIAL case: a full refund's status line already says the whole charge went back,
 * and repeating it under a receipt whose every row is now moot reads as an apology rather than an
 * account. Says where the money went, because "refunded" without a destination is the question
 * every guest asks next, and promises no timing the code cannot keep — the bank's window is the
 * bank's, and inventing "3–5 days" here would be a fabricated fact on a money surface.
 */
export const PARTIAL_REFUND_NOTE =
  "The refunded amount goes back to the card you paid with. Your bank decides when it lands.";
