/**
 * PD8 — "Warn, then take payment" (PATH_DESIGN decision 4): a dish waiting for a manager never
 * blocks a staff payment door. The warning sits above Take cash; tapping Take cash (or the reader, or
 * the tab close — each door its own snapshot, Codex correction 13) with a flag up IS the
 * acknowledgement, and the tap carries exactly the pending request ids it displayed. The server
 * refuses `approval_pending` ONLY when a request is pending that the acknowledgement did not cover —
 * the card then returns naming the new dish, and one more tap passes it: a re-warning, never a block.
 *
 * The compare is a set operation (m8 decision 24, ONE binding for the three doors), pure so it is
 * falsified by a value (`settle-approvals.test.ts`) and mutated in verify:slice. The read behind it is
 * `./approvals-read` (plumbing); `null` there is UNREADABLE, and the staff doors fail closed on it
 * (P2dc's rule, owner decision 5a) with a retry sentence — never the write-outage "keep it on paper".
 */

/** One pending request as a settle door displays it, and as the server hands it back. */
export type PendingFlag = {
  id: string;
  kind: "void" | "comp";
  lineId: string | null;
  lineName: string;
  /** The dish's Burmese name (advisory; the English snapshot stands when none). */
  nameMy: string | null;
  qty: number;
  amountCents: number;
  cooked: boolean;
  initiatorName: string;
  createdAt: string;
};

export type ApprovalSettleVerdict = null | "unreadable" | { unacknowledged: string[] };

export function staffSettleApprovalVerdict(
  pendingIds: readonly string[] | null,
  acknowledgedIds: readonly string[],
): ApprovalSettleVerdict {
  if (pendingIds === null) return "unreadable";
  const acked = new Set(acknowledgedIds);
  const unacknowledged = pendingIds.filter((id) => !acked.has(id));
  return unacknowledged.length === 0 ? null : { unacknowledged };
}

/** Plain words for a bundle older than the typed code; every current client says the dictionary's. */
export const APPROVAL_PENDING_REFUSAL =
  "A dish on this table is still waiting for a manager — tap again to take payment with it on the bill.";

export type ApprovalPendingRefusal = {
  ok: false;
  error: string;
  code: "approval_pending";
  /** EVERY request still pending on the cart (not only the uncovered ones): the card re-draws the
   *  whole set, and the next tap acknowledges exactly what it drew. */
  pending: PendingFlag[];
};

export function approvalPendingRefusal(pending: PendingFlag[]): ApprovalPendingRefusal {
  return { ok: false, error: APPROVAL_PENDING_REFUSAL, code: "approval_pending", pending };
}

export const APPROVALS_UNREADABLE_REFUSAL = "Couldn’t check for waiting requests — try again.";

export type ApprovalsUnreadableRefusal = { ok: false; error: string; code: "approval_unreadable" };

export function approvalsUnreadableRefusal(): ApprovalsUnreadableRefusal {
  return { ok: false, error: APPROVALS_UNREADABLE_REFUSAL, code: "approval_unreadable" };
}
