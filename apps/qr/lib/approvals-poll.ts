import { AuthzError } from "./authz";

/**
 * M34 — what the approvals poll says about a read that REJECTED, decided once and in `lib/`.
 *
 * `listPendingApprovals` throws on purpose (a queue that cannot be read must never render as "all
 * clear"), and the board used to fold every throw into one `unknown` miss — so an EXPIRED SESSION
 * read "Not updating right now … Reconnecting…" with no path to the login, while every other board
 * redirects on its own poll's `signin` verdict. The two throws the server itself raises are
 * distinguishable by their status: 401 (`requireStaff`, no session) is a person who must SIGN IN
 * again; 403 ("Insufficient role") is a person who is still signed in but no longer a manager —
 * reachable only if the role is lowered while the counter screen is open — and the honest surface
 * for them is the COUNTER, re-rendered without the manager zones, never the login (which would land
 * a signed-in staffer on their own profile with no word why; the blind pass); everything else — the
 * platform unreachable (503), a database library throw — is an OUTAGE, a side the board now knows
 * and can say. A hung or dropped transport never reaches here (it rejects on the CLIENT, in
 * `raceTimeout`), and stays `unknown` there.
 */
export type ApprovalsPollRefusal = "signin" | "role" | "outage";

export function approvalsPollVerdict(err: unknown): ApprovalsPollRefusal {
  if (err instanceof AuthzError && err.status === 401) return "signin";
  if (err instanceof AuthzError && err.status === 403) return "role";
  return "outage";
}
