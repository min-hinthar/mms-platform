"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { Approver } from "@/lib/voids";

/**
 * Shared manager-PIN step-up (S2-audit S13). Both loss sites — the LossActionSheet (void/comp) and the
 * ApprovalsBoard (resolve) — verify a manager the same way: tap your name → enter your PIN, with a
 * server-clocked lockout. This module owns the three pieces that were copy-pasted between them:
 *   • `<ManagerPinFields>` — the manager <select> + PIN <input> (one accessible name each, 44px+ targets).
 *   • `useLockout()` — the lockout countdown (server seconds → a local tick, self-stops at 0).
 *   • `pinFailureCopy()` — the pin_wrong / pin_locked / pin_no_pin → honest microcopy mapping.
 * The server stays authoritative (role + self + lockout); these are the affordance + the shared strings.
 */

/** The lockout countdown shared by both PIN sites. */
export function useLockout() {
  const [lockLeft, setLockLeft] = useState(0);
  const locked = lockLeft > 0;
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setLockLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [locked]);
  const mins = Math.floor(lockLeft / 60);
  const secs = lockLeft % 60;
  const lockCopy = locked ? `Locked — try again in ${mins > 0 ? `${mins}m ` : ""}${secs}s.` : null;
  return { lockLeft, setLockLeft, locked, lockCopy };
}

// The two PIN failures that carry extra fields (so they narrow to their own member at each call site) — the
// only ones worth a shared mapper. `pin_no_pin` is a bare constant; callers use PIN_NO_PIN_COPY.
export type SharedPinFailure =
  | { reason: "pin_wrong"; attemptsRemaining: number }
  | { reason: "pin_locked"; lockedUntil: string };

export const PIN_NO_PIN_COPY = "That manager hasn’t set a PIN yet.";

/**
 * Map the field-carrying PIN failures to honest copy. `pin_locked` also seeds the lockout countdown via
 * `setLockLeft` (server `lockedUntil` → remaining seconds), so the caller just shows the returned string.
 */
export function pinFailureCopy(
  res: SharedPinFailure,
  setLockLeft: (seconds: number) => void,
): string {
  if (res.reason === "pin_wrong") {
    return res.attemptsRemaining > 0
      ? `Wrong PIN — ${res.attemptsRemaining} ${res.attemptsRemaining === 1 ? "try" : "tries"} left.`
      : "Wrong PIN.";
  }
  const left = Math.max(0, Math.ceil((new Date(res.lockedUntil).getTime() - Date.now()) / 1000));
  setLockLeft(left);
  return "Too many tries on that PIN.";
}

/**
 * The manager <select> + PIN <input>. `approvers === null` reads as "Loading…"; an empty roster shows the
 * honest dead-end note (a manager has to approve and none are on shift). `idPrefix` keeps the label↔control
 * `htmlFor` wiring unique when several cards render at once (the approvals queue).
 */
export function ManagerPinFields({
  idPrefix,
  approvers,
  approverStaffId,
  onApproverChange,
  pin,
  onPinChange,
  locked,
}: {
  idPrefix: string;
  approvers: Approver[] | null;
  approverStaffId: string;
  onApproverChange: (staffId: string) => void;
  pin: string;
  onPinChange: (pin: string) => void;
  locked: boolean;
}) {
  const managers = approvers ?? [];
  const loading = approvers === null;
  const noManagers = !loading && managers.length === 0;

  return (
    <>
      <label htmlFor={`${idPrefix}-mgr`} style={label}>
        Manager
      </label>
      <select
        id={`${idPrefix}-mgr`}
        value={approverStaffId}
        onChange={(e) => onApproverChange(e.target.value)}
        disabled={locked || noManagers}
        style={select}
      >
        <option value="">
          {loading ? "Loading…" : noManagers ? "No managers available" : "Tap your name"}
        </option>
        {managers.map((m) => (
          <option key={m.staffId} value={m.staffId}>
            {m.displayName}
          </option>
        ))}
      </select>
      {noManagers && (
        // Honest dead-end note: this action needs a manager and none are signed in.
        <p style={noteCopy}>A manager has to approve this — none are signed in right now.</p>
      )}
      <label htmlFor={`${idPrefix}-pin`} style={{ ...label, marginTop: 12 }}>
        PIN
      </label>
      <input
        id={`${idPrefix}-pin`}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        value={pin}
        onChange={(e) => onPinChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
        placeholder="••••"
        disabled={locked}
        // S2-audit S10: NOT described-by the live region — a node can't be both a field description and a
        // transactional live region without double-announcing; the label + placeholder suffice.
        style={input}
      />
    </>
  );
}

const label: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--tx)",
};
const noteCopy: CSSProperties = { margin: "6px 0 0", fontSize: "var(--fs-sm)", color: "var(--t2)" };
const select: CSSProperties = {
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  padding: "0 12px",
  fontSize: "var(--fs-body)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
};
const input: CSSProperties = {
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  padding: "0 14px",
  fontSize: "var(--fs-body)",
  letterSpacing: "0.3em",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
};
