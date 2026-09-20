import { AuthzError } from "./authz";

/**
 * M34 — what the approvals poll says about a read that REJECTED, decided once and in `lib/`.
 *
 * `listPendingApprovals` throws on purpose (a queue that cannot be read must never render as "all
 * clear"), and the board used to fold every throw into one `unknown` miss — so an EXPIRED SESSION
 * read "Not updating right now … Reconnecting…" with no path to the login, while every other board
 * redirects on its own poll's `signin` verdict. The two throws the server itself raises are
 * distinguishable by their status: a gate refusal (`requireStaff` → 401 anon · 403 not a manager) is
 * a person who must sign in again; everything else — the platform unreachable (503), a database
 * library throw — is an OUTAGE, a side the board now knows and can say. A hung or dropped transport
 * never reaches here (it rejects on the CLIENT, in `raceTimeout`), and stays `unknown` there.
 */
export type ApprovalsPollRefusal = "signin" | "outage";

export function approvalsPollVerdict(err: unknown): ApprovalsPollRefusal {
  if (err instanceof AuthzError && (err.status === 401 || err.status === 403)) return "signin";
  return "outage";
}
