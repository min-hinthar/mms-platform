/**
 * PD8 (m8 decisions 8 · 9 · 13) — WHO may sign a manager approval, decided once, as values.
 *
 * The shipped roster (`listApprovers`) filtered on role + active only, so the picker offered a manager
 * with no tablet PIN (a dead end learned from a refusal) and the asker themself (refused server-side as
 * `self_approve`, after a lockout attempt was spent). The rule is a bank's maker–checker: the list never
 * shows a checker who cannot sign, so the rule is visible BEFORE anyone types a PIN.
 *
 * The server stays the authority — `mms_resolve_approval` / `mms_void_line` re-check role + self in SQL
 * and `verifyStaffPin` refuses a missing PIN — these are the affordance. Pure, so each rule is
 * falsified by a value (`approvers.test.ts`) and mutated in `scripts/verify-slice.mjs`.
 */

export type ApproverCandidate = {
  staffId: string;
  displayName: string;
  /** The staff row's role as stored (`server` · `manager` · `owner`). */
  role: string;
  active: boolean;
  /** A tablet PIN is set (`staff_pins` has a row) — without one the PIN step cannot complete. */
  hasPin: boolean;
};

/** The roles that may sign a loss decision (the SQL's `role in ('manager','owner')`). */
function canSign(c: ApproverCandidate): boolean {
  return (c.role === "manager" || c.role === "owner") && c.active && c.hasPin;
}

/**
 * The people who can sign THIS request: an active manager or owner with a PIN, never the asker —
 * except on a CLOSE (`selfAllowed`), where the request's own asker may close it (round 3, D2: "the
 * request's own asker may close it"). Order is the roster's; nothing is invented.
 */
export function eligibleApprovers<T extends ApproverCandidate>(
  roster: readonly T[],
  askerStaffId: string,
  opts: { selfAllowed?: boolean } = {},
): T[] {
  return roster.filter(
    (c) => canSign(c) && (opts.selfAllowed === true || c.staffId !== askerStaffId),
  );
}

/**
 * Exactly one eligible signer arrives lit; two or more arrive with none lit — a pre-lit wrong name
 * would spend someone else's lockout attempts (decision 9). `""` is the picker's "nobody picked".
 */
export function preselectApprover<T extends { staffId: string }>(eligible: readonly T[]): string {
  return eligible.length === 1 ? eligible[0]!.staffId : "";
}

/**
 * Why nobody can sign — one of the two TRUE sentences that replaced the false "none are signed in
 * right now" (decision 13): (a) the asker is the only signer here, or (b) no manager has a tablet
 * PIN yet. `null` when someone else can sign.
 */
export function zeroEligibleReason(
  roster: readonly ApproverCandidate[],
  askerStaffId: string,
): { kind: "only_self"; name: string } | { kind: "no_pin" } | null {
  if (eligibleApprovers(roster, askerStaffId).length > 0) return null;
  const signers = roster.filter(canSign);
  const self = signers.find((c) => c.staffId === askerStaffId);
  return self ? { kind: "only_self", name: self.displayName } : { kind: "no_pin" };
}
