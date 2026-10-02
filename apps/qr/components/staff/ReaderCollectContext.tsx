"use client";
import { createContext, useContext, useLayoutEffect, useRef } from "react";
import type { Handoff } from "@/lib/register-ui";
import type {
  ReaderCancelError,
  ReaderCollect,
  ReaderLanded,
  ReaderName,
  ReaderPending,
  ReaderPoll,
  ReaderStart,
  ReaderStatus,
} from "@/lib/reader-collect";

/**
 * Phase 2g · reader — the reader collect's API, in its OWN module (the `TablePaneContext` precedent):
 * the bar's chip, the split and the pane's closed state read it without importing the provider —
 * and with it the reader's Server Actions — into every bar's graph (StaffBar renders on fourteen
 * surfaces, several of them mounted bare by their suites). `ReaderCollectProvider` provides it.
 */
/** Who is showing a table, and what it does when that table's charge lands (the card — or null for a
 *  table, whose paid state is the signal — so it can re-read and adopt it). */
export type ReaderViewer = { onLanded?: (h: Handoff | null) => void };

export type { ReaderLanded };

export type ReaderCollectApi = {
  /** The collect, or null. Its phase and status below. */
  record: ReaderCollect | null;
  poll: ReaderPoll;
  /** Collecting, or charged and waiting for its order. */
  live: boolean;
  /** THE status binding (`readerStatus`) — the panel's line and the chip's; null with no record. */
  status: ReaderStatus | null;
  /** What the page's region says: the status, or a cancel refusal while it stands. */
  spoken: ReaderStatus | null;
  recordingLong: boolean;
  cancelBusy: boolean;
  cancelError: ReaderCancelError | null;
  /** Charges that landed while their table was not on screen — a counter's card or a table's "Paid" —
   *  one per table, oldest first (the chip shows the first whose table is not shown). */
  landed: readonly ReaderLanded[];
  /** Tables on screen now (registered through `shownHere`). */
  shown: ReadonlySet<string>;
  /** The PI whose panel takes focus on its first mount — set only by a start made in view. */
  focusOwed: string | null;
  focusTaken: (paymentIntentId: string) => void;
  start: (s: ReaderStart) => void;
  /** Codex r2 on #310 (A3) — write a start down BEFORE it is sent (returns its token), so a reload
   *  that aborts its answer leaves a record this provider resolves on the next document. */
  startPending: (at: Omit<ReaderPending, "token" | "startedAt">) => string;
  /** The start answered (any answer: a start, a refusal) — its record goes, by its own token. */
  startAnswered: (token: string) => void;
  cancel: () => Promise<void>;
  /** The panel's "Back to payment" / Close and the chip's ✕: a declined, cancelled or unrecorded
   *  collect is cleared; a charged-not-recorded one ("Hide this") is put away and keeps polling
   *  silently until it lands or is given up (D4 · C1). */
  dismiss: () => void;
  /** The chip's ✕ on a landing: that table's landing goes; the rest stay queued. */
  dismissLanded: (sessionId: string) => void;
  /** Register a table as shown; returns the unregister. A landed card standing for it is handed over. */
  shownHere: (sessionId: string, viewer?: ReaderViewer) => () => void;
  /** The one refusal, read at TAP time (refs, never a render). */
  startRefused: (sessionId: string) => boolean;
  /** A table's detail mounting with a pre-2g per-table stash: adopt it once (never over a record). */
  adoptLegacy: (at: Omit<ReaderStart, "paymentIntentId" | "totalCents">) => void;
  /** The counter split, while mounted: opens a table in its pane (the chip's View at split width — a
   *  router push of a hash on the same page fires no `hashchange`, so it could never select). */
  registerPane: (open: (sessionId: string, name: ReaderName) => void) => () => void;
  openInPane: (sessionId: string, name: ReaderName) => boolean;
  /** The outcomes already SAID (the chip's alert, or the table's own region — `readerAlertKey`): said
   *  once per outcome, not once per page the chip remounts on. */
  alertSaid: ReadonlySet<string>;
  markAlertSaid: (key: string) => void;
};

export const ReaderCollectContext = createContext<ReaderCollectApi | null>(null);

/**
 * THROWS outside the provider: a reader control with no provider above it would start a collect
 * nobody polls — exactly the orphan this module exists to remove. Every staff route has one (the
 * layout); a test mounts its own.
 */
export function useReaderCollect(): ReaderCollectApi {
  const v = useContext(ReaderCollectContext);
  if (v === null)
    throw new Error(
      "useReaderCollect() outside <ReaderCollectProvider> — the reader's collect lives in app/staff/layout.tsx",
    );
  return v;
}

/**
 * The tolerant read, for the two consumers that only ever DISPLAY or OFFER (the bar's chip, the
 * split's pane registration): StaffBar renders on surfaces a test mounts bare, and no collect can
 * start without the throwing hook above.
 */
export function useReaderCollectOptional(): ReaderCollectApi | null {
  return useContext(ReaderCollectContext);
}

/** Marks a table as shown while mounted (the pane's selection from the tap — loading, detail or
 *  closed — and a server-rendered closed page). */
export function ReaderShown({
  sessionId,
  onLanded,
}: {
  sessionId: string;
  onLanded?: (h: Handoff | null) => void;
}) {
  const reader = useReaderCollectOptional();
  const shownHere = reader?.shownHere;
  const landedRef = useRef(onLanded);
  // A LAYOUT effect declared BEFORE the registration (layout effects run in order): a pane that
  // switches A → B reuses this instance, and `shownHere(B)` hands B's queued landing over SYNC —
  // a passive update would still hold A's handler then, filing B's card under A (Codex r2 on #309).
  useLayoutEffect(() => {
    landedRef.current = onLanded;
  }, [onLanded]);
  // A LAYOUT effect: registered before paint, so the bar's chip never flashes over its own table.
  useLayoutEffect(() => {
    if (!shownHere) return;
    return shownHere(sessionId, { onLanded: (h) => landedRef.current?.(h) });
  }, [sessionId, shownHere]);
  return null;
}
