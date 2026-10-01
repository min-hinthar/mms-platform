"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@mms/ui";
import type { Approver } from "@/lib/voids";
import { plural, tf } from "@/lib/i18n/fill";
import { ts } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { raceTimeout } from "@/lib/staff-outage";
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
 * The manager roster a loss sheet reads on mount — with its OUTAGE kept distinct from an empty answer.
 * `listApprovers` THROWS on a failed read precisely so "we couldn't read the list" never renders as
 * "no managers on shift" (W10b); a `.catch(() => [])` at the call site undid that, and a write-off that
 * needs a manager became impossible with one standing there (Codex round 2 on #308, P2). So a failure
 * is `failed`, never `[]`, and `retry()` re-reads it on a tap.
 *
 * `load` is passed in (the sheet's own `listApprovers` import) so this module stays free of the Server
 * Action. The sheets mount only while open, so each open is a fresh read (the fresh-mount rule). The
 * `alive` ref is the `live` guard: re-armed at every setup (a cleanup-only latch stays false after the
 * first Strict-Mode pass) and checked before any state lands on an unmounted sheet.
 *
 * Phase 2h (P2fc) — both reads are BOUNDED (`raceTimeout`, STAFF_HANG_MS): Next runs Server Actions
 * one at a time per tab, so behind a stuck action the mount read sat on "Loading…" and a Try again
 * on "Trying again…" forever, with nothing saying why. A read with no answer at the bound is a
 * FAILURE like any other (`pin.manager.loadFailed`, whose Try again is the way forward) — never an
 * empty roster, never a spinner that cannot end.
 */
export function useApproverRoster(load: () => Promise<Approver[]>) {
  const [approvers, setApprovers] = useState<Approver[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const alive = useRef(false);
  // The tap-time guard: two taps in one frame see the same render, so only a ref refuses the second.
  const retryInFlight = useRef(false);

  useEffect(() => {
    alive.current = true;
    raceTimeout(load()).then(
      (a) => {
        if (alive.current) setApprovers(a);
      },
      () => {
        // Deliberate: an unreadable roster is an OUTAGE — never an empty roster.
        if (alive.current) setFailed(true);
      },
    );
    return () => {
      alive.current = false;
    };
  }, [load]);

  /** Re-read after a failure. Resolves `true` when the roster loaded, `false` when it failed again. */
  const retry = useCallback(async (): Promise<boolean> => {
    if (retryInFlight.current) return false;
    retryInFlight.current = true;
    setRetrying(true);
    try {
      const a = await raceTimeout(load());
      if (!alive.current) return false;
      setApprovers(a);
      setFailed(false);
      return true;
    } catch {
      return false; // still `failed` — the caller says so in its one region
    } finally {
      retryInFlight.current = false;
      if (alive.current) setRetrying(false);
    }
  }, [load]);

  return { approvers, failed, retrying, retry };
}

/** The roster-failure sentence a sheet puts in its ONE region when a retry fails again. */
export const ROSTER_FAILED_COPY: StaffMsg = { k: "pin.manager.loadFailed" };

/**
 * The sheet's ONE region after a roster Try again — shared by both sheets that use the hook. A retry
 * that fails again says so (`ROSTER_FAILED_COPY`), replacing whatever was there. A recovery clears
 * exactly that sentence — and when the manager step-up is still PENDING (the server said `needs_pin`),
 * the region goes back to "a manager needs to approve", not to silence: the failure had displaced
 * that sentence, and the step-up it describes never went away (Phase 2f review — a blank region left
 * the manager fields standing with nothing saying why). Any other sentence is left alone.
 */
export function rosterRetryMsg(
  m: StaffMsg | null,
  ok: boolean,
  stepUpPending: boolean,
): StaffMsg | null {
  if (!ok) return ROSTER_FAILED_COPY;
  if (m !== ROSTER_FAILED_COPY) return m;
  return stepUpPending ? { k: "pin.needsManager" } : null;
}

/**
 * The manager <select> + PIN <input>. `approvers === null` reads as "Loading…"; an empty roster shows the
 * honest dead-end note (a manager has to approve and none are on shift). A roster that could not be READ
 * (`rosterFailed`) says exactly that — never "none on shift" — with a Try again that calls `onRetry`
 * (focus moves to the picker once it loads; a second failure is the caller's region's to say). `idPrefix` keeps the label↔control
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
  rosterFailed = false,
  retrying = false,
  onRetry,
}: {
  idPrefix: string;
  approvers: Approver[] | null;
  approverStaffId: string;
  onApproverChange: (staffId: string) => void;
  pin: string;
  onPinChange: (pin: string) => void;
  locked: boolean;
  /** The roster read FAILED (an outage, not an empty answer) — see `useApproverRoster`. */
  rosterFailed?: boolean;
  retrying?: boolean;
  onRetry?: () => Promise<boolean>;
}) {
  const lang = useStaffLang();
  const managers = approvers ?? [];
  const loading = !rosterFailed && approvers === null;
  const noManagers = !rosterFailed && !loading && managers.length === 0;
  const selectRef = useRef<HTMLSelectElement>(null);
  // Set by the Try again tap; the picker takes focus when the failure clears (the button that held it
  // unmounts), and is dropped when the retry fails again (focus stays on the button).
  const focusPicker = useRef(false);
  useEffect(() => {
    if (!rosterFailed && focusPicker.current) {
      focusPicker.current = false;
      selectRef.current?.focus();
    }
  }, [rosterFailed]);

  return (
    <>
      <label htmlFor={`${idPrefix}-mgr`} style={label}>
        <Chrome lang={lang} k="pin.manager.label" echo="stack" />
      </label>
      <select
        ref={selectRef}
        id={`${idPrefix}-mgr`}
        value={approverStaffId}
        onChange={(e) => onApproverChange(e.target.value)}
        // A dead-end state, not a tapped control: with no manager on shift — or no list to read —
        // there is nothing to pick. The lockout no longer disables it (§17 — the lockout is the PIN
        // field's, read-only).
        disabled={noManagers || rosterFailed}
        style={select}
      >
        {/* An <option> can hold only text, so the mark rides the element itself (rule 5). */}
        <option value="" lang={lang}>
          {rosterFailed
            ? ts(lang, "pin.manager.unavailable")
            : loading
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
      {rosterFailed && (
        // The list could not be READ — said as that, never as "nobody on shift". A static note (the
        // caller's region carries any announcement), and the one way forward: read it again.
        <>
          <p style={noteCopy} data-roster-failed="">
            <Chrome lang={lang} k="pin.manager.loadFailed" echo="stack" />
          </p>
          {onRetry && (
            <div style={{ marginTop: 8 }}>
              <Button
                type="button"
                variant="secondary"
                block
                busy={retrying}
                busyLabel={<Chrome lang={lang} k="out.shell.retrying" />}
                onClick={async () => {
                  focusPicker.current = true;
                  if (!(await onRetry())) focusPicker.current = false;
                }}
              >
                <Chrome lang={lang} k="out.shell.retry" echo="stack" />
              </Button>
            </div>
          )}
        </>
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
        // §17 — a lockout makes the field READ-ONLY, never disabled: the refused submit just moved
        // focus into it (or will), and a disabled field drops that focus to <body>.
        readOnly={locked}
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
  fontWeight: "var(--fw-semibold)",
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
