"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { terminalStatus, cancelTerminal, terminalResume } from "@/lib/terminal";
import { boundWrite, stalledSince, track } from "@/lib/bounded-write";
import { stashHandoff } from "@/lib/floor-pane";
import {
  READER_POLL_MS,
  READER_POLL_START,
  READER_RECORDING_ESCALATE_MS,
  adoptLegacyCollect,
  dropLanded,
  dropPending,
  dropReaderStash,
  landedHandoff,
  nextReaderPoll,
  pendStart,
  queueLanded,
  readLandedStash,
  readPendingStash,
  readReaderStash,
  readerLive,
  readerPendingExpired,
  readerPolling,
  readerRecordingLong,
  readerResumeDelay,
  readerSpoken,
  readerStartRefused,
  readerStatus,
  restoredReaderPoll,
  resumedCollect,
  silentMisses,
  takeLegacyCollect,
  writeLandedStash,
  writeReaderStash,
  type ReaderCancelError,
  type ReaderCollect,
  type ReaderLanded,
  type ReaderName,
  type ReaderPending,
  type ReaderPoll,
  type ReaderStart,
} from "@/lib/reader-collect";
import {
  ReaderCollectContext,
  type ReaderCollectApi,
  type ReaderViewer,
} from "./ReaderCollectContext";

/**
 * Phase 2g · reader (P2em · P2en · P2er · P2es) — THE card reader's collect, owned ABOVE navigation.
 *
 * Mounted by `app/staff/layout.tsx` — the one tree every staff route shares, so it survives every
 * client navigation (Lock included: `staffGate` does not read the console lock, so the poll keeps
 * answering behind the lock screen), `router.refresh()`, and the error boundary. A HARD navigation
 * (`window.location.assign`, a native link, a reload) resets it, and the one sessionStorage record
 * (`lib/reader-collect`) brings it back on mount. It renders NO chrome: the collect panel
 * (`TerminalCollectPanel`, on its own table) and the bar's chip (`ReaderCollectChip`, everywhere
 * else) are views over this.
 *
 * What it owns, and why each is HERE:
 *   · the RECORD — started from `TerminalSettleButton`'s resolved promise through `start`, a stable
 *     function, so a start that answers after its detail unmounted still polls (P2en);
 *   · the 2.5 s POLL — it slides the settle freeze (`terminalStatus` → `extendSettlementFor`) and is
 *     the only thing that turns a counter charge into its #CODE card. ONE poll in the air at a time
 *     (`flight`): Next runs Server Actions one at a time, so a poll dispatched over an unanswered one
 *     only queues behind it; a poll silent for `READER_POLL_SILENT_MS` counts as a miss instead;
 *   · CANCEL — its answer lands here even if the panel that asked has gone;
 *   · the LANDING — a counter order's card is stashed for its table (`stashHandoff`, the pane's closed
 *     state reads it) and handed to whoever shows that table (`shownHere`'s `onLanded`), else QUEUED
 *     in `landed` for the chip — a counter's card or a table's "Paid" (PT-1), one per table, oldest
 *     first, persisted beside the record (M1: one in-memory slot lost a #CODE to the next landing or
 *     to any hard navigation) — until it is dismissed or its table is shown;
 *   · the BOUND — a charge captured with no order for the freeze's lifetime is given up as
 *     `unrecorded` (C1): the poll stops, the reader is free, and the outcome is shown (never left put
 *     away) until Close — kept in the stash, marked, so a reload restores the warning (Codex r1);
 *   · `shownHere` — which tables are on screen now, so the chip never repeats the panel beside it;
 *   · the ONE refusal left: a start on another table while a collect is live (one reader);
 *   · the PENDING starts (Codex r2 on #310, A3) — a start is written down before it is sent and
 *     forgotten once it answers; one a reload stranded — or one that THREW on this page (R3) — is
 *     resolved here, read-only (`terminalResume`), asked again on a widening gap while the reader is
 *     idle under the table's held freeze or the read fails (R1), for no longer than the freeze could
 *     carry it; a failed read is SAID through the bar's chip (`unchecked`, R4).
 *
 * Strict Mode: `alive` is re-armed at setup, the poll effect is idempotent (the in-flight guard
 * means a re-run never dispatches a second poll over the first), and a viewer registers by count.
 */

const samePoll = (a: ReaderPoll, b: ReaderPoll) =>
  a.phase === b.phase &&
  a.misses === b.misses &&
  a.recordingSince === b.recordingSince &&
  a.failCopy === b.failCopy;

export function ReaderCollectProvider({ children }: { children: ReactNode }) {
  const [record, setRecordState] = useState<ReaderCollect | null>(null);
  const recordRef = useRef<ReaderCollect | null>(null);
  const [poll, setPollState] = useState<ReaderPoll>(READER_POLL_START);
  const pollRef = useRef<ReaderPoll>(READER_POLL_START);
  const [landed, setLanded] = useState<readonly ReaderLanded[]>([]);
  const landedRef = useRef<readonly ReaderLanded[]>([]);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<ReaderCancelError | null>(null);
  const cancelInFlight = useRef(false);
  // Phase 2h (S2 critic D4) — the collect (its PaymentIntent) whose cancel is still unanswered past
  // the bound: a re-tap for it is a no-op (the waiting line stands — it says "check it before you
  // take another payment"), never the stalled refusal that would replace it with "this did nothing".
  const cancelWaitingFor = useRef<string | null>(null);
  const [focusOwed, setFocusOwed] = useState<string | null>(null);
  const [alertSaid, setAlertSaid] = useState<ReadonlySet<string>>(() => new Set());
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const viewers = useRef(new Map<string, ReaderViewer[]>());
  const pane = useRef<((sessionId: string, name: ReaderName) => void) | null>(null);
  // The one poll in the air: when it went out, how many misses its silence already cost, and for
  // which collect. Shared across effect runs on purpose — the guard is per PROVIDER, not per effect.
  const flight = useRef<{ since: number; counted: number; pi: string } | null>(null);
  // Re-armed at setup: Strict Mode runs the cleanup once on mount, and a cleanup-only latch would
  // read "gone" forever (the CLAUDE.md gotcha).
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** The record, its ref twin and its stash — written together, always. */
  const commitRecord = useCallback((next: ReaderCollect | null) => {
    recordRef.current = next;
    setRecordState(next);
    if (next) writeReaderStash(next);
    else dropReaderStash();
  }, []);
  const commitPoll = useCallback((next: ReaderPoll) => {
    // Codex r3 on #309 — a cancel refusal ("too late…") answers the phase it was asked in. Once a poll
    // learns a NEW outcome (recorded, declined, given up) that outcome is the newer fact: a refusal
    // left standing would mask it in the region, while the panel marks the alert said behind it.
    if (next.phase !== pollRef.current.phase) setCancelError(null);
    pollRef.current = next;
    setPollState((prev) => (samePoll(prev, next) ? prev : next));
  }, []);
  /** The landed queue, its ref twin and its stash — written together, always (M1). */
  const commitLanded = useCallback((next: readonly ReaderLanded[]) => {
    landedRef.current = next;
    setLanded(next);
    writeLandedStash(next);
  }, []);

  // Codex r2 on #310 follow-up (R4) — the stranded starts whose LAST resume read could not be made,
  // oldest first: the bar's chip says the reader could not be checked while one stands.
  const [unchecked, setUnchecked] = useState<readonly ReaderPending[]>([]);
  const markUnchecked = useCallback((p: ReaderPending, on: boolean) => {
    setUnchecked((prev) => {
      const has = prev.some((x) => x.token === p.token);
      if (has === on) return prev;
      return on ? [...prev, p] : prev.filter((x) => x.token !== p.token);
    });
  }, []);
  // The pending starts THIS document wrote, in memory beside the stash: a tablet whose storage refuses
  // the write still resolves its own thrown start (R3).
  const pendingMem = useRef(new Map<string, ReaderPending>());
  // R1 — the re-asks waiting out their gap. Cleared with the provider (a document unload, in life).
  const resumeTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = resumeTimers.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  /**
   * Codex r2 on #310 (A3) — ask the server, READ-ONLY, what the reader is doing for a start this tab
   * lost the answer to, and act on it (`resumedCollect`): re-adopt the collect — the poll, Cancel and
   * the landing exactly as a start would have — or forget the record, or keep it. Bounded and on the
   * stall ledger like every action (`boundWrite`); a late answer is applied when it lands. No focus is
   * owed: this is a re-attach, not a start made in view.
   *
   * Follow-up (R1) — KEPT is asked again, after `readerResumeDelay(asked)`: an idle reader under the
   * table's held freeze is a start still on its way to it, and an outage is no verdict (R4: it is
   * said). Never past the record's own expiry (the freeze's lifetime: nothing can still be on its way),
   * and never while a collect stands (one reader, one record — the newer fact). `first` is how many
   * reads came before this one; `onAdopted` tells the control that tapped (R3), if it asked.
   */
  const resume = useCallback(
    (p: ReaderPending, first: number, onAdopted?: () => void) => {
      const forget = () => {
        dropPending(p.token, Date.now());
        pendingMem.current.delete(p.token);
        markUnchecked(p, false);
      };
      const ask = async (asked: number): Promise<void> => {
        if (recordRef.current !== null || readerPendingExpired(p, Date.now())) {
          forget();
          return;
        }
        const apply = (res: Awaited<ReturnType<typeof terminalResume>> | null) => {
          if (!alive.current) return;
          const now = Date.now();
          const step = resumedCollect(p, res, now);
          if (step.kind === "keep") {
            markUnchecked(p, step.unchecked);
            const t = setTimeout(
              () => {
                resumeTimers.current.delete(t);
                void ask(asked + 1);
              },
              readerResumeDelay(asked + 1),
            );
            resumeTimers.current.add(t);
            return;
          }
          forget();
          // A collect that stands by now (a start made meanwhile, another pending start adopted) is
          // the newer fact — there is one reader, and one record.
          if (step.kind === "drop" || recordRef.current !== null) return;
          commitRecord(step.record);
          commitPoll(READER_POLL_START);
          setCancelError(null);
          onAdopted?.();
        };
        const out = await boundWrite(terminalResume({ sessionId: p.sessionId, startId: p.token }));
        if (out.kind === "answer") apply(out.value);
        else if (out.kind === "threw") apply(null);
        else void out.late.then((late) => apply(late.kind === "answer" ? late.value : null));
      };
      void ask(first);
    },
    [commitRecord, commitPoll, markUnchecked],
  );

  // Restore after a hard navigation (scheduled — never a synchronous setState in the effect). A
  // record already standing (a start, a legacy adoption) is newer than the stash and wins.
  useEffect(() => {
    // Codex r2 on #310 (A3) — the pending starts a PREVIOUS document left, read at mount (never in
    // the scheduled tick below): a start THIS document sends writes its own record, and resolving it
    // here would ask the reader before the start reached it — and forget the start's record.
    const stranded = readPendingStash(Date.now());
    const t = setTimeout(() => {
      const now = Date.now();
      // The landed queue first: the stash is OLDER than anything landed since mount. A landing whose
      // table is already on screen (the hard navigation went straight to it) goes to that view, never
      // back to the chip.
      const stored = readLandedStash(now);
      if (stored.length > 0) {
        let q: ReaderLanded[] = [];
        for (const e of stored) {
          const vs = viewers.current.get(e.sessionId) ?? [];
          if (vs.length > 0) for (const v of vs) v.onLanded?.(e.handoff);
          else q = queueLanded(q, e);
        }
        for (const e of landedRef.current) q = queueLanded(q, e);
        commitLanded(q);
      }
      if (recordRef.current === null) {
        const restored = readReaderStash(now);
        if (restored !== null) {
          commitRecord(restored);
          commitPoll(restoredReaderPoll(restored));
        }
      }
      // Codex r2 on #310 (A3) — a start this tab sent and never heard back from (the reload that
      // `settle.reader.waiting` asks for aborted its answer). Each is resolved — and a collect that
      // stands is the newer fact (its start answered, or a newer one did): `resume` forgets the
      // record unasked.
      for (const p of stranded) resume(p, 0);
    }, 0);
    return () => clearTimeout(t);
  }, [commitRecord, commitPoll, commitLanded, resume]);

  /** A charge that LANDED: the card (a counter's), the stash, and whoever shows its table. */
  const land = useCallback(
    (rec: ReaderCollect, orderId: string) => {
      const h = landedHandoff(rec, orderId);
      // The card follows its table: the pane's closed state (a counter session closes behind its
      // charge) reads this stash. A close of the table BEFORE the card existed dropped nothing — this
      // card is newer than that close, so it stands.
      if (h) stashHandoff(rec.sessionId, h);
      commitRecord(null);
      commitPoll(READER_POLL_START);
      setCancelError(null);
      const vs = viewers.current.get(rec.sessionId) ?? [];
      if (vs.length > 0) {
        for (const v of vs) v.onLanded?.(h);
        return;
      }
      // Off screen: QUEUED for the chip — a counter's card, and a table's landing too (PT-1: the chip
      // had said the order was being recorded; vanishing when it is reads exactly like "lost").
      commitLanded(
        queueLanded(landedRef.current, {
          sessionId: rec.sessionId,
          name: rec.name,
          orderId,
          totalCents: rec.totalCents,
          handoff: h,
          landedAt: Date.now(),
        }),
      );
    },
    [commitRecord, commitPoll, commitLanded],
  );

  const answer = useCallback(
    (rec: ReaderCollect, res: Parameters<typeof nextReaderPoll>[1], nowMs: number) => {
      const step = nextReaderPoll(pollRef.current, res, nowMs);
      if (step.landed) {
        land(rec, step.landed.orderId);
        return;
      }
      if (res?.ok && readerPolling(step.poll.phase)) {
        // A LIVE answer: the freeze was just extended — the stash's expiry clock moves with it, and
        // so does the recording clock (C1: a reload resumes the bound, never restarts it).
        const next = { ...rec, liveAt: nowMs, recordingSince: step.poll.recordingSince };
        recordRef.current = next;
        writeReaderStash(next);
      } else if (!readerPolling(step.poll.phase)) {
        // Declined or cancelled: nothing left to re-attach to after a reload — the outcome stays on
        // screen (panel or chip) until it is dismissed.
        if (step.poll.phase === "unrecorded") {
          // C1 — a charge given up as unrecorded is a WARNING a person must see and close: one put
          // away while it recorded (D4) comes back, and it STAYS in the stash, marked, so a reload
          // or a hard navigation restores the warning instead of erasing it (Codex r1 on #309: the
          // stash was the only durable copy of "don't take payment again"). Close drops it.
          const kept = { ...rec, hidden: false, unrecordedAt: nowMs };
          recordRef.current = kept;
          setRecordState(kept);
          writeReaderStash(kept);
        } else dropReaderStash();
      }
      commitPoll(step.poll);
    },
    [land, commitPoll],
  );

  // THE POLL — keyed on the collect's handle and whether it still polls (never on its phase, so a
  // collecting → recording step does not restart it).
  const pi = record?.paymentIntentId ?? null;
  const polling = record !== null && readerPolling(poll.phase);
  useEffect(() => {
    if (!polling || pi === null) return;
    const tick = () => {
      const rec = recordRef.current;
      if (rec === null || rec.paymentIntentId !== pi) return;
      const now = Date.now();
      const f = flight.current;
      if (f !== null) {
        // A poll is still in the air — never a second one over it. Its silence is a miss per span
        // (only for THIS collect: an old collect's straggler costs a new one nothing).
        if (f.pi !== pi) return;
        const due = silentMisses(f.since, now);
        if (due > f.counted) {
          const add = due - f.counted;
          f.counted = due;
          const p = pollRef.current;
          if (readerPolling(p.phase)) commitPoll({ ...p, misses: p.misses + add });
        }
        return;
      }
      const ticket = { since: now, counted: 0, pi };
      flight.current = ticket;
      // Phase 2h (9d) — on the stall ledger until it answers: a hung status read holds the action
      // queue like any action, so a money tap behind it is refused instead of queued.
      track(terminalStatus({ sessionId: rec.sessionId, paymentIntentId: pi }))
        .catch(() => null)
        .then((res) => {
          if (flight.current === ticket) flight.current = null;
          if (!alive.current) return;
          const cur = recordRef.current;
          // A collect dismissed or replaced while this was in the air: its answer is not this one's.
          if (cur === null || cur.paymentIntentId !== pi) return;
          answer(cur, res, Date.now());
        });
    };
    const id = setInterval(tick, READER_POLL_MS);
    tick();
    return () => clearInterval(id);
  }, [pi, polling, answer, commitPoll]);

  // "Recording…" escalates honestly after a bound — one re-render at the bound, never a ticking clock
  // (a per-tick state would re-render every consumer, the whole table detail included, every 2.5 s).
  const [clock, setClock] = useState(0);
  const since = poll.recordingSince;
  useEffect(() => {
    if (since == null) return;
    const t = setTimeout(
      () => setClock(Date.now()),
      Math.max(0, since + READER_RECORDING_ESCALATE_MS + 1 - Date.now()),
    );
    return () => clearTimeout(t);
  }, [since]);
  const recordingLong = readerRecordingLong(poll, clock);

  const start = useCallback(
    (s: ReaderStart) => {
      const now = Date.now();
      commitRecord({
        ...s,
        startedAt: now,
        liveAt: now,
        hidden: false,
        recordingSince: null,
        unrecordedAt: null,
      });
      commitPoll(READER_POLL_START);
      setCancelError(null);
      // The settle section unmounts under the cashier as the freeze lands: its panel takes focus —
      // but only when the start was made IN VIEW. A start answering after its detail left (P2en)
      // must not pull focus onto a panel the person comes back to later (a re-attach).
      setFocusOwed(viewers.current.has(s.sessionId) ? s.paymentIntentId : null);
    },
    [commitRecord, commitPoll],
  );

  const focusTaken = useCallback((paymentIntentId: string) => {
    setFocusOwed((cur) => (cur === paymentIntentId ? null : cur));
  }, []);

  // Codex r2 on #310 (A3) — a start about to be sent is written down first (the tap's facts and
  // when), so a reload that aborts its answer leaves this tab a record to resolve; its answer drops
  // it again, by its own token. A storage failure is a deliberate swallow (`pendStart`). Codex r3 on
  // #310 — the token is a UUID because the SERVER matches it: it rides the start (`settleCard`'s
  // `startId`) onto the PaymentIntent, and a resume adopts only the charge carrying this exact token,
  // never another tablet's for the same table (a per-tab counter could collide across tablets).
  const startPending = useCallback((at: Omit<ReaderPending, "token" | "startedAt">) => {
    const now = Date.now();
    const token = crypto.randomUUID();
    const p = { ...at, token, startedAt: now };
    pendingMem.current.set(token, p);
    pendStart(p, now);
    return token;
  }, []);
  const startAnswered = useCallback((token: string) => {
    pendingMem.current.delete(token);
    dropPending(token, Date.now());
  }, []);
  // Codex r2 on #310 follow-up (R3) — a start that THREW on this page is resolved here too, never only
  // by the next document: the same read and loop as a stranded one. Its server may still be running
  // it (a lost response, not a refusal), so the first read waits the first gap. `onAdopted`: the
  // reader IS asking for the card — the tapping control (or the page, through it) retracts its
  // "couldn't confirm".
  const resumeStart = useCallback(
    (token: string, onAdopted?: () => void) => {
      const p =
        pendingMem.current.get(token) ??
        readPendingStash(Date.now()).find((x) => x.token === token);
      if (p === undefined) return;
      const t = setTimeout(() => {
        resumeTimers.current.delete(t);
        resume(p, 0, onAdopted);
      }, readerResumeDelay(0));
      resumeTimers.current.add(t);
    },
    [resume],
  );

  const cancel = useCallback(async () => {
    const rec = recordRef.current;
    if (rec === null || cancelInFlight.current) return;
    // Phase 2h (S2 critic D4) — this collect's cancel is still out past the bound: nothing to add.
    if (cancelWaitingFor.current === rec.paymentIntentId) return;
    // Phase 2h (9d) — refused AT THE TAP, never sent, while an earlier action has been unanswered for
    // the bound: Next runs Server Actions one at a time, so this cancel would only queue behind the
    // stuck one and could reach the reader minutes from now. Read now, never from render state.
    if (stalledSince() !== null) {
      setCancelError({ kind: "stalled" });
      return;
    }
    cancelInFlight.current = true;
    setCancelBusy(true);
    setCancelError(null);
    // Codex r4 on #309 — a refusal answers the phase the cancel was ASKED in. A poll already in the
    // air can move the collect on (declined, given up) before this answers; a refusal landing after
    // that would mask the newer outcome for good, since those phases never poll (or clear) again.
    // Phase 2h — the same guard holds for EVERY refusal this cancel writes, the bound's `waiting`
    // and a late answer's included: written after the collect moved on, each masks the newer fact.
    const askedIn = pollRef.current.phase;
    const stillAsked = () =>
      recordRef.current?.paymentIntentId === rec.paymentIntentId &&
      pollRef.current.phase === askedIn;
    /** The cancel's answer, whenever it lands — at once, or late (9e: never dropped). */
    const landCancel = (res: Awaited<ReturnType<typeof cancelTerminal>>) => {
      if (!res.ok) {
        // "Too late" (the tap won) or a transport miss — the poll keeps reporting the truth.
        if (stillAsked()) setCancelError({ kind: "server", text: res.error });
        return;
      }
      if (recordRef.current?.paymentIntentId !== rec.paymentIntentId) return;
      const p = pollRef.current;
      // The phase change clears a standing `waiting` (commitPoll's rule): the cancel is the newer fact.
      if (readerPolling(p.phase)) commitPoll({ ...p, phase: "canceled" });
      dropReaderStash();
    };
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      const out = await boundWrite(
        cancelTerminal({ sessionId: rec.sessionId, paymentIntentId: rec.paymentIntentId }),
      );
      if (out.kind === "answer") {
        landCancel(out.value);
        return;
      }
      if (out.kind === "threw") {
        // The answer was lost — the reader may already be cancelled, or still take the card (9e).
        if (stillAsked()) setCancelError({ kind: "local" });
        return;
      }
      // Still out at the bound: no answer yet, and the reader may still take the card. The provider
      // never unmounts mid-service, and the poll keeps reporting the truth meanwhile.
      if (stillAsked()) setCancelError({ kind: "waiting" });
      cancelWaitingFor.current = rec.paymentIntentId;
      void out.late.then((late) => {
        if (cancelWaitingFor.current === rec.paymentIntentId) cancelWaitingFor.current = null;
        if (late.kind === "answer") landCancel(late.value);
        else if (stillAsked()) setCancelError({ kind: "local" });
      });
    } finally {
      cancelInFlight.current = false;
      setCancelBusy(false); // frees AT THE BOUND (fact 3) — never held by the raw
    }
  }, [commitPoll]);

  const dismiss = useCallback(() => {
    const rec = recordRef.current;
    if (rec === null) return;
    if (pollRef.current.phase === "recording") {
      // D4 — charged, not yet recorded: put the panel away, keep polling. The order still lands, and
      // its #CODE reaches the stash and the chip; dropping the poll here was how the card got lost.
      // (Bounded: past `READER_UNRECORDED_MS` it is given up and comes back — C1.)
      commitRecord({ ...rec, hidden: true });
      return;
    }
    commitRecord(null);
    commitPoll(READER_POLL_START);
    setCancelError(null);
  }, [commitRecord, commitPoll]);

  const dismissLanded = useCallback(
    (sessionId: string) => commitLanded(dropLanded(landedRef.current, sessionId)),
    [commitLanded],
  );

  const shownHere = useCallback(
    (sessionId: string, viewer: ReaderViewer = {}) => {
      const list = viewers.current.get(sessionId) ?? [];
      viewers.current.set(sessionId, [...list, viewer]);
      setShown((prev) => (prev.has(sessionId) ? prev : new Set([...prev, sessionId])));
      // A charge that landed while its table was off screen: handed to the view that shows it now,
      // and the chip's job for it is done (the others stay queued).
      const l = landedRef.current.find((x) => x.sessionId === sessionId);
      if (l !== undefined) {
        viewer.onLanded?.(l.handoff);
        commitLanded(dropLanded(landedRef.current, sessionId));
      }
      return () => {
        const now = (viewers.current.get(sessionId) ?? []).filter((v) => v !== viewer);
        if (now.length > 0) {
          viewers.current.set(sessionId, now);
          return;
        }
        viewers.current.delete(sessionId);
        setShown((prev) => {
          if (!prev.has(sessionId)) return prev;
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      };
    },
    [commitLanded],
  );

  const startRefused = useCallback(
    (sessionId: string) =>
      readerStartRefused({
        collect: recordRef.current,
        phase: pollRef.current.phase,
        sessionId,
      }),
    [],
  );

  const adoptLegacy = useCallback(
    (at: Omit<ReaderStart, "paymentIntentId" | "totalCents">) => {
      const now = Date.now();
      const legacy = takeLegacyCollect(at.sessionId);
      // The stash not yet restored counts as standing too (this runs before the restore's tick).
      const next = adoptLegacyCollect(recordRef.current ?? readReaderStash(now), legacy, at, now);
      if (next === null) return;
      commitRecord(next);
      commitPoll(READER_POLL_START);
    },
    [commitRecord, commitPoll],
  );

  const registerPane = useCallback((open: (sessionId: string, name: ReaderName) => void) => {
    pane.current = open;
    return () => {
      if (pane.current === open) pane.current = null;
    };
  }, []);
  const openInPane = useCallback((sessionId: string, name: ReaderName) => {
    if (pane.current === null) return false;
    pane.current(sessionId, name);
    return true;
  }, []);

  // EVERY outcome said is remembered (a queue of landings and a decline can take turns in the chip —
  // one slot would say the first landing again once the decline is closed).
  const markAlertSaid = useCallback(
    (key: string) => setAlertSaid((prev) => (prev.has(key) ? prev : new Set([...prev, key]))),
    [],
  );

  const live = record !== null && readerLive(poll.phase);
  const value = useMemo<ReaderCollectApi>(() => {
    const status = record === null ? null : readerStatus(poll, recordingLong);
    return {
      record,
      poll,
      live,
      status,
      spoken: status === null ? null : readerSpoken(status, cancelError),
      recordingLong,
      cancelBusy,
      cancelError,
      landed,
      shown,
      focusOwed,
      focusTaken,
      start,
      startPending,
      startAnswered,
      resumeStart,
      unchecked,
      cancel,
      dismiss,
      dismissLanded,
      shownHere,
      startRefused,
      adoptLegacy,
      registerPane,
      openInPane,
      alertSaid,
      markAlertSaid,
    };
  }, [
    record,
    poll,
    live,
    recordingLong,
    cancelBusy,
    cancelError,
    landed,
    shown,
    focusOwed,
    focusTaken,
    start,
    startPending,
    startAnswered,
    resumeStart,
    unchecked,
    cancel,
    dismiss,
    dismissLanded,
    shownHere,
    startRefused,
    adoptLegacy,
    registerPane,
    openInPane,
    alertSaid,
    markAlertSaid,
  ]);
  return <ReaderCollectContext.Provider value={value}>{children}</ReaderCollectContext.Provider>;
}
