"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Approver } from "@/lib/voids";
import { tf } from "@/lib/i18n/fill";
import type { StaffLang } from "@/lib/staff-lang";
import { raceTimeout } from "@/lib/staff-outage";
import { outReadSlot, releaseOutRead } from "@/lib/bounded-write";
import type { StaffMsg } from "./StaffMsg";

/**
 * What is left of the shared manager-PIN step-up (S2-audit S13) after No-PIN (owner, 2026-10-24:
 * "Remove PIN for all requests"): no request asks for a PIN any more — a manager decides on their
 * own sign-in — so the picker, the PIN field and the PIN-failure copy are gone. Two pieces remain:
 *   • `useLockout()` + `secondsUntil()` — the lock screen's countdown (a person's OWN tablet PIN,
 *     `PinUnlock`, which is not a request and stays).
 *   • `useApproverRoster()` — the staff roster read whose `self` row says who is signed in, so the
 *     approvals decision can name the decider ("Deciding as Aye") or say why it cannot.
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

/** Seconds until `lockedUntil`, floored at zero — shared by the step-up and the lock screen. */
export function secondsUntil(lockedUntil: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - now) / 1000));
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
    // rejection handled — the bounded await that dispatched it reads and says it), and only while
    // the register still holds THIS raw (R4: never a newer read's).
    const settled = () => {
      releaseOutRead(load, raw);
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
    raceTimeout(read(), "read").then(
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
      const a = await raceTimeout(read(), "read");
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
