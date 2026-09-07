"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { Approver } from "@/lib/voids";
import { plural, tf } from "@/lib/i18n/fill";
import { ts } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
import type { StaffMsg } from "./StaffMsg";

/**
 * Shared manager-PIN step-up (S2-audit S13). Both loss sites — the LossActionSheet (void/comp) and the
 * ApprovalsBoard (resolve) — verify a manager the same way: tap your name → enter your PIN, with a
 * server-clocked lockout. This module owns the three pieces that were copy-pasted between them:
 *   • `<ManagerPinFields>` — the manager <select> + PIN <input> (one accessible name each, 44px+ targets).
 *   • `useLockout()` — the lockout countdown (server seconds → a local tick, self-stops at 0).
 *   • `pinFailureCopy()` — the pin_wrong / pin_locked / pin_no_pin → honest microcopy mapping.
 * The server stays authoritative (role + self + lockout); these are the affordance + the shared strings.
 *
 * P7·2 — the strings are `pin.*` dictionary KEYS now, not English. Every failure this module names is
 * a `StaffMsg` (a key with its slots) that the caller's live region renders through `<MsgText>`, and
 * the lock screen — a person's OWN PIN, not a manager's — reads the same vocabulary. The lockout's
 * remaining time is pre-formatted in the device language by `lockoutDuration`, because "1m 05s" is a
 * DURATION and the dictionary's `{t}` slot is a clock, always Latin.
 */

/** "1m 05s" / "45s" — or "၁ မိနစ် ၀၅ စက္ကန့်" / "၄၅ စက္ကန့်": the two unit keys, composed. */
export function lockoutDuration(lang: StaffLang, seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  // Seconds are zero-padded only beside a minute figure, so a countdown does not jump width.
  const s = tf(lang, "pin.unit.sec", { n: mins > 0 ? String(secs).padStart(2, "0") : secs });
  return mins > 0 ? `${tf(lang, "pin.unit.min", { n: mins })} ${s}` : s;
}

/** The lockout countdown shared by both PIN sites and the lock screen. */
export function useLockout(lang: StaffLang) {
  const [lockLeft, setLockLeft] = useState(0);
  const locked = lockLeft > 0;
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setLockLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [locked]);
  const lockCopy: StaffMsg | null = locked
    ? { k: "pin.lockedFor", vars: { x: lockoutDuration(lang, lockLeft) } }
    : null;
  return { lockLeft, setLockLeft, locked, lockCopy };
}

// The two PIN failures that carry extra fields (so they narrow to their own member at each call site) — the
// only ones worth a shared mapper. `pin_no_pin` is a bare constant; callers use PIN_NO_PIN_COPY.
export type SharedPinFailure =
  | { reason: "pin_wrong"; attemptsRemaining: number }
  | { reason: "pin_locked"; lockedUntil: string };

export const PIN_NO_PIN_COPY: StaffMsg = { k: "pin.noPin.manager" };

/** Seconds until `lockedUntil`, floored at zero — shared by the step-up and the lock screen. */
export function secondsUntil(lockedUntil: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - now) / 1000));
}

/**
 * Map the field-carrying PIN failures to honest copy. `pin_locked` seeds the lockout countdown via
 * `setLockLeft` (server `lockedUntil` → remaining seconds) and returns NO message of its own: the
 * countdown (`useLockout().lockCopy`, "Too many tries — try again in {x}.") IS the lockout sentence,
 * and it leaves the region when the lockout does. A separate "Too many tries." returned here stayed
 * behind after expiry, announcing a refusal over a field that had just re-opened (blind pass,
 * CRITICAL) — so a caller must render `lockCopy ?? msg`, and `msg` must be null for a lockout.
 */
export function pinFailureCopy(
  res: SharedPinFailure,
  setLockLeft: (seconds: number) => void,
): StaffMsg | null {
  if (res.reason === "pin_wrong") {
    const n = res.attemptsRemaining;
    return n > 0
      ? { k: plural(n, "pin.wrong.one", "pin.wrong.many"), vars: { n } }
      : { k: "pin.wrong" };
  }
  setLockLeft(secondsUntil(res.lockedUntil));
  return null;
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
  const lang = useStaffLang();
  const managers = approvers ?? [];
  const loading = approvers === null;
  const noManagers = !loading && managers.length === 0;

  return (
    <>
      <label htmlFor={`${idPrefix}-mgr`} style={label}>
        <Chrome lang={lang} k="pin.manager.label" echo="stack" />
      </label>
      <select
        id={`${idPrefix}-mgr`}
        value={approverStaffId}
        onChange={(e) => onApproverChange(e.target.value)}
        disabled={locked || noManagers}
        style={select}
      >
        {/* An <option> can hold only text, so the mark rides the element itself (rule 5). */}
        <option value="" lang={lang}>
          {loading
            ? ts(lang, "pin.manager.loading")
            : noManagers
              ? ts(lang, "pin.manager.none")
              : ts(lang, "pin.manager.pick")}
        </option>
        {managers.map((m) => (
          <option key={m.staffId} value={m.staffId}>
            {m.displayName}
          </option>
        ))}
      </select>
      {noManagers && (
        // Honest dead-end note: this action needs a manager and none are signed in.
        <p style={noteCopy}>
          <Chrome lang={lang} k="pin.manager.noneNote" echo="stack" />
        </p>
      )}
      <label htmlFor={`${idPrefix}-pin`} style={{ ...label, marginTop: 12 }}>
        <Chrome lang={lang} k="pin.label" echo="stack" />
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
