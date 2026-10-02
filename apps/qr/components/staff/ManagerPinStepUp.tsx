"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Button } from "@mms/ui";
import type { Approver } from "@/lib/voids";
import { plural, tf } from "@/lib/i18n/fill";
import { ts } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { raceTimeout } from "@/lib/staff-outage";
import { outReadSlot } from "@/lib/bounded-write";
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
 * Action. The sheets mount only while open, so each open is a fresh read (the fresh-mount rule) —
 * unless a read is still out, which the open attaches to (B2, below). The
 * `alive` ref is the `live` guard: re-armed at every setup (a cleanup-only latch stays false after the
 * first Strict-Mode pass) and checked before any state lands on an unmounted sheet.
 *
 * Phase 2h (P2fc) — both reads are BOUNDED (`raceTimeout`, STAFF_HANG_MS): Next runs Server Actions
 * one at a time per tab, so behind a stuck action the mount read sat on "Loading…" and a Try again
 * on "Trying again…" forever, with nothing saying why. A read with no answer at the bound is a
 * FAILURE like any other (`pin.manager.loadFailed`, whose Try again is the way forward) — never an
 * empty roster, never a spinner that cannot end.
 *
 * Codex round 1 on #310 (CX1) — ONE roster read in the queue. The bound frees the CALLER, never the
 * action: at STAFF_HANG_MS the race rejects while the raw read is still queued, so a Try again that
 * called `load()` again put a SECOND read behind the hung one — and every press another, all of them
 * draining later, ahead of every staff action tapped after. So the raw still out is kept by identity
 * (`outRaw`: set at dispatch, cleared in its OWN settle — never at a bound), and `read()` hands it
 * back instead of dispatching while it is out: a Try again then ATTACHES to it with a fresh bound
 * (`retrying` still ends at that bound). A bound that passed with the raw still out does not drop its
 * answer (`landLate`): whenever it comes, the roster loads and the failure clears. Only a raw that
 * has settled — answered or failed — lets the next ask read again.
 *
 * Codex round 2 on #310 (B2) — and the raw still out is the TAB's, never this hook instance's: it is
 * kept in the per-tab read register (`outReadSlot`, keyed by `load` — `listApprovers`, the one import
 * the loss and no-show sheets share). In a ref, closing and reopening a sheet while the read hung
 * mounted a NEW hook with an empty slot, and its mount sent a second read behind the first — every
 * reopen one more. A remounted hook now attaches to the read still out (a fresh bound), and that
 * read's late answer lands on whichever sheet is open when it comes.
 */
export function useApproverRoster(load: () => Promise<Approver[]>) {
  const [approvers, setApprovers] = useState<Approver[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const alive = useRef(false);
  // The tap-time guard: two taps in one frame see the same render, so only a ref refuses the second.
  const retryInFlight = useRef(false);

  /** The raw read to await: the one still out, or — only when none is — a fresh one. */
  const read = useCallback((): Promise<Approver[]> => {
    // CX1 · B2 — the raw roster read still unanswered, by identity, in the TAB's register (see the
    // docblock): it outlives the Strict-Mode setup → cleanup → setup AND a closed-and-reopened sheet,
    // so the next mount attaches instead of reading twice.
    const outRaw = outReadSlot<Approver[]>(load);
    if (outRaw.current !== null) return outRaw.current;
    const raw = load();
    outRaw.current = raw;
    // Cleared in the raw's OWN settle, whichever way it went (the second handler also marks a
    // rejection handled — the bounded await that dispatched it reads and says it).
    const settled = () => {
      outRaw.current = null;
    };
    raw.then(settled, settled);
    return raw;
  }, [load]);

  /** A bound passed: the raw still out (if it is) lands its answer whenever it comes (CX1). */
  const landLate = useCallback(() => {
    const raw = outReadSlot<Approver[]>(load).current;
    if (raw === null) return; // it settled — a failure, already said
    raw.then(
      (a) => {
        if (!alive.current) return;
        setApprovers(a);
        setFailed(false);
      },
      // Deliberate swallow: a late failure changes nothing — the roster already reads `failed`.
      () => {},
    );
  }, [load]);

  useEffect(() => {
    alive.current = true;
    raceTimeout(read()).then(
      (a) => {
        if (alive.current) setApprovers(a);
      },
      () => {
        // Deliberate: an unreadable roster is an OUTAGE — never an empty roster.
        if (alive.current) setFailed(true);
        landLate();
      },
    );
    return () => {
      alive.current = false;
    };
  }, [read, landLate]);

  /** Re-read after a failure. Resolves `true` when the roster loaded, `false` when it failed again. */
  const retry = useCallback(async (): Promise<boolean> => {
    if (retryInFlight.current) return false;
    retryInFlight.current = true;
    setRetrying(true);
    try {
      // CX1 — the read still out, if there is one (a fresh bound on it); a new read only when none is.
      const a = await raceTimeout(read());
      if (!alive.current) return false;
      setApprovers(a);
      setFailed(false);
      return true;
    } catch {
      landLate();
      return false; // still `failed` — the caller says so in its one region
    } finally {
      retryInFlight.current = false;
      if (alive.current) setRetrying(false);
    }
  }, [read, landLate]);

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
 * Codex r1 follow-up on #310 (V1) — what the region may hold given the roster's state: the failure
 * sentence never stands over a list in hand. CX1 lets a read that answered AFTER its bound load the
 * roster (`landLate`) with no Try again result to say so, and the region kept "Couldn't load the list
 * of managers…" over the picker it had just filled — and the needs-manager line that sentence had
 * displaced never came back. So with the list in hand the failure sentence is retired exactly as an
 * on-time recovery retires it (`rosterRetryMsg(m, true, …)`); while it is still FAILED, and for any
 * other sentence, `m` is returned as the SAME object (nothing re-said).
 */
export function rosterHeldMsg(
  m: StaffMsg | null,
  failed: boolean,
  stepUpPending: boolean,
): StaffMsg | null {
  return failed ? m : rosterRetryMsg(m, true, stepUpPending);
}

/**
 * The ONE roster rule a loss sheet's region follows (V1) — both sheets call this, so the late path
 * and the on-time path cannot drift apart, nor the two sheets. It holds the region to `rosterHeldMsg`
 * on every render (the sanctioned adjust-while-rendering shape: React re-runs the render with the
 * retired sentence before committing — the late load lands in `roster.failed` with no handler of
 * the sheet's own to run), and returns the Try again handler, which says a second failure and
 * retires the failure on an on-time recovery (`rosterRetryMsg`). `stepUpPending` is the server's
 * `needs_pin` — never a step-up shown up-front.
 */
export function useRosterRegion(
  roster: { failed: boolean; retry: () => Promise<boolean> },
  msg: StaffMsg | null,
  setMsg: Dispatch<SetStateAction<StaffMsg | null>>,
  stepUpPending: boolean,
): () => Promise<boolean> {
  const held = rosterHeldMsg(msg, roster.failed, stepUpPending);
  if (held !== msg) setMsg(held);
  return async () => {
    const ok = await roster.retry();
    setMsg((m) => rosterRetryMsg(m, ok, stepUpPending));
    return ok;
  };
}

/**
 * The manager <select> + PIN <input>. `approvers === null` reads as "Loading…"; an empty roster shows the
 * honest dead-end note (a manager has to approve and none are on shift). A roster that could not be READ
 * (`rosterFailed`) says exactly that — never "none on shift" — with a Try again that calls `onRetry`
 * (focus moves to the picker once it loads — after the tap that asked, or, for a late answer, when
 * focus was on the Try again as it left; a second failure is the caller's region's to say). `idPrefix` keeps the label↔control
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
  // Codex r1 follow-up on #310 (V2) — a LATE answer clears the failure with no tap pending, and the
  // Try again unmounts under whatever focus it holds (it falls to the dialog). So whether focus was
  // ON it as it left is recorded in its box's ref cleanup — React detaches a ref BEFORE it removes the
  // node, so `document.activeElement` still reads where focus really was. Assigned fresh at every
  // vanish, which is the only moment it is read (the box leaves exactly when the failure clears).
  // Focus anywhere else is the person's, and is never taken.
  const retryHadFocus = useRef(false);
  const retryBox = useCallback((el: HTMLDivElement | null) => {
    if (el === null) return;
    return () => {
      retryHadFocus.current = el.contains(document.activeElement);
    };
  }, []);
  useEffect(() => {
    if (!rosterFailed && (focusPicker.current || retryHadFocus.current)) {
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
            <div ref={retryBox} style={{ marginTop: 8 }}>
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
