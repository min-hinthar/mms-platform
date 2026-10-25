/**
 * WHO approves a manager-gated loss — decided once, as values.
 *
 * No-PIN (owner, 2026-10-24: "Remove PIN for all requests"): there is no PIN step-up and no approver
 * picker any more. The approver of a gated void, comp, counter no-show or queued request is the
 * SIGNED-IN caller, and only when their role may sign (the SQL's `role in ('manager','owner')`). A
 * server's gated ask goes to the approvals queue instead, where a manager decides it on their own
 * sign-in.
 *
 * The server stays the authority — `mms_void_line` / `mms_counter_no_show` / `mms_resolve_approval`
 * re-check the approver's role and that they are active, in SQL. These are the app's half: they decide
 * what to SEND, so a server's id never reaches the approver slot. Pure, so each rule is falsified by a
 * value (`approvers.test.ts`) and mutated in `scripts/verify-slice.mjs`.
 */

/** Whether a role may approve a loss decision on its own sign-in. */
export function canApproveLoss(role: string): boolean {
  return role === "manager" || role === "owner";
}

/**
 * The approver to SEND with a gated write: the caller themself when their role may sign, else none —
 * the RPC then answers `needs_approval` and the sheet offers the request. `undefined` (not null), so
 * an omitted approver falls through to the RPC's `p_approver default null`.
 */
export function approverFor(caller: { staffId: string; role: string }): string | undefined {
  return canApproveLoss(caller.role) ? caller.staffId : undefined;
}

/** One roster row, as much of it as the decision reads. */
export type DeciderRow = { staffId: string; displayName: string; role: string; self: boolean };

/**
 * WHO decides a queued request on this device — the signed-in caller (the roster's `self` row), and
 * only when they may: a manager or owner, and (approve / deny) never on their own request — a CLOSE is
 * the exception (PD8 · D2: the asker may close their own stale request). The SQL re-checks all of it.
 */
export type DecideAs =
  | { kind: "loading" }
  | { kind: "unknown" }
  | { kind: "not_manager" }
  | { kind: "own_request" }
  | { kind: "as"; staffId: string; name: string };

export function decideAs(
  roster: readonly DeciderRow[] | null,
  rosterFailed: boolean,
  initiatorStaffId: string,
  closeOnly: boolean,
): DecideAs {
  if (roster === null) return rosterFailed ? { kind: "unknown" } : { kind: "loading" };
  const me = roster.find((r) => r.self);
  if (!me) return { kind: "unknown" };
  if (!canApproveLoss(me.role)) return { kind: "not_manager" };
  if (!closeOnly && me.staffId === initiatorStaffId) return { kind: "own_request" };
  return { kind: "as", staffId: me.staffId, name: me.displayName };
}
