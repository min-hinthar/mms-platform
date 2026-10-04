"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { undoFire } from "@/lib/cart";
import { TABLE_STARTER_MID } from "@/lib/confirm-copy";
import { graceDeadlineMs, graceRemainingSec, type GraceReceipt } from "@/lib/send-grace";

/**
 * Phase 3c-i (D15) — the send's server-clocked undo window, owned by CHECKOUT, not by the Send
 * button.
 *
 * Until 3c-i `undoUntil` was `SendToKitchenButton` state: a stage flip (the keyed step wrapper)
 * unmounted it and destroyed the only UI that could recall the send, so Checkout REFUSED the
 * View-bill door and the Forward entry for the whole ten seconds — a bill nobody could read while
 * the kitchen had not even seen the lines yet. The window now lives here: the mounted stage renders
 * the ONE Undo control (`SendToKitchenButton verb="undo"`), so a flip mid-grace keeps the undo
 * without a second home, the Bill is readable, and only Pay waits (`payBlock`, lib/checkout-verb).
 *
 * What it owns: `deadlineMs` (epoch ms on THIS device — `graceDeadlineMs`, the server-MEASURED
 * duration counted from the receipt, never the server's absolute stamp against `Date.now()`),
 * `batch` (the undo targets exactly the batch this send minted — S4-audit P1-3), the 250 ms tick,
 * `pending`, `message`, `graceWrites` (a serialized chain that NEVER rejects — each write owns its
 * errors — which `continueToPayment` drains before it mints), and `undoBtnRef` (focus lands on Undo
 * the moment the window OPENS — B4: move focus predictably on the state change).
 *
 * Three invariants, each with a mutant:
 *  - a FREEZE never shortens the window: a frozen tap is refused at the door with FROZEN_NOTE and
 *    the countdown keeps running — the SQL would still honour the undo once the lock clears;
 *  - the undo targets exactly `batch`;
 *  - `graceWrites` never rejects.
 *
 * The callbacks are options, not effects (a `setState` that mirrors hook state from an effect is a
 * cascading render the React Compiler lint rejects): `say` carries every outcome sentence to the
 * view's ONE live region, `onChanged` re-syncs the cart after every server attempt — and its
 * promise rides the chain, so a drain waits for the re-read that puts the drafts back.
 */

export type GraceMessage = { kind: "ok" | "err"; text: string; my?: string };

/** How the window last closed — the Bill says "Ready to pay." only for an ELAPSED window: an undo
 *  or an `expired` answer speaks for itself in the same commit. */
export type GraceClose = "elapsed" | "undone" | "expired";

export type UndoGrace = {
  deadlineMs: number | null;
  batch: string | null;
  /** Whole seconds left, rounded UP (lib/send-grace) — the Undo label's count, never a region's. */
  remaining: number;
  /** An undo write has not answered yet. */
  pending: boolean;
  message: GraceMessage | null;
  closedBy: GraceClose | null;
  /** The serialized write chain. Never rejects. Drain it (`await …current`) before any charge. */
  graceWrites: RefObject<Promise<void>>;
  /** A CALLBACK ref for the mounted Undo button (`ref={grace.undoBtnRef}`): the hook parks focus
   *  on it when the window opens. A callback, not a RefObject, so the React Compiler lint does not
   *  read the whole `grace` object as a ref in the button's render. */
  undoBtnRef: (el: HTMLButtonElement | null) => void;
  /** Open the window from a send receipt, counted from `receiptMs` (this device's clock). */
  open: (res: GraceReceipt, receiptMs: number) => void;
  /** Undo the batch this window holds. Resolves when the attempt AND its re-sync have settled. */
  undo: (cartId: string, frozen: boolean) => Promise<void>;
  /** The window as it stands RIGHT NOW — for a decision made after an `await`, where the rendered
   *  `deadlineMs` is the value from the render that started the wait. */
  isOpen: () => boolean;
};

/**
 * What the undo says when a frozen tap arrives — naming THIS control, never the lock's holder.
 *
 * ⚠️ An earlier draft echoed Checkout's `freezeNotice` through a `frozenNote` prop. Two defects,
 * both caught pre-merge: (1) `frozenNote` carries the SUPPRESSED freeze while `frozen` carries the
 * RAW one, so `frozen && frozenNote === null` is reachable in exactly one state — the viewer's own
 * in-flight `create-intent` — and the `??` fallback would have blamed a peer in the one window
 * where the code knows the holder is the reader (the M116 fabricated-diagnosis class); and (2)
 * setting the region to the string it already holds is a no-op React bails on, so nothing is
 * announced. A sentence about this control is true under every freeze and differs from the bar's.
 */
export const FROZEN_NOTE = "The order’s locked while a checkout finishes.";

/**
 * Codex rounds 3–5 on #313 — the undo LANDED but no re-read has shown it yet. The window stays open,
 * `pending` stays TRUE (the Undo reads "Bringing it back…", Pay and the counter door stay held, the
 * tick cannot close the window even past its deadline) and the read is retried in the background until
 * one applies — then "Brought back" and the close. "Taking a moment" is what the code does. EN-only
 * (J29 ledger).
 */
/** The undo landed and the view shows it. Said once per landed undo — on the answer, or on the later
 *  tap whose read finally applied. */
export const BROUGHT_BACK_NOTE = "Brought back to your order — change it and send again.";
export const RESYNC_FAILED_NOTE =
  "Brought back to your order — the list is taking a moment to refresh.";
/** A failed re-sync is retried this many times in all, this far apart, with the gate still shut. */
export const RESYNC_ATTEMPTS = 3;

/**
 * Did the host's re-sync put a view ON THE SCREEN? Only `readTicketed`'s `"applied"` says so — an
 * `"overtaken"` read reached the server but lost the screen, and the watermark it lost to can have
 * advanced WITHOUT a view (`confirmedWrite`: a counter ask during the re-sync), so the lines may still
 * read `fired` (Codex round 6 on #313). A host whose `onChanged` returns nothing counts as applied —
 * the contract for callers that do not report.
 */
export function viewApplied(outcome: unknown): boolean {
  return outcome === undefined || outcome === "applied";
}
export const RESYNC_RETRY_MS = 750;

export const reasonCopy: Record<
  "not_host" | "locked" | "settling" | "nothing" | "rate_limited" | "error",
  string
> = {
  not_host: `Ask ${TABLE_STARTER_MID} to send the order to the kitchen.`,
  // ⚠️ THE SAME STRING AS THE CLIENT-SIDE REFUSAL, DELIBERATELY (Codex round 2 on #247). This is
  // the RACED path: the tap started while the cart was editable and the server took the lock before
  // authorization, so `frozen` was false and the client said nothing. It used to read "Someone’s
  // checking out", which is the peer claim the whole copy change removed — and the lock can be
  // self-held (two tabs on one device) or unattributable, so that sentence is a diagnosis the code
  // never established. Naming it ONCE also means Checkout's lock-edge announcement, which rewrites
  // the view's region when the freeze lifts, replaces this one too instead of leaving it stale.
  // ⚠️ NOT `FROZEN_NOTE` (Codex round 5 on #247, correcting round 2). This is the RACED path — the
  // tap started editable and the server met the lock — so `frozen` is false here by construction
  // and the lock may already have lifted by the time this renders. Round 2 unified the two strings
  // so the unfreeze effect would clear this one too; that only works while an unfreeze EDGE is
  // still coming, and on a lock that took and released mid-request it already went by. A sentence
  // that makes no claim about the lock needs no edge and cannot go stale.
  locked: "That didn’t go through — please try again.",
  settling: "Your table is paying — you can’t send while everyone pays.",
  nothing: "Everything’s already with the kitchen.",
  rate_limited: "One moment — too many taps. Try again in a few seconds.",
  error: "Couldn’t send that just now — please try again.",
};

export function useUndoGrace(opts?: {
  /** Every outcome sentence, as it is decided — Checkout routes it to the view's one region. */
  say?: (m: GraceMessage) => void;
  /** Re-sync after every server attempt; a returned promise rides the write chain. A resolved
   *  `"failed"` OR `"overtaken"` (Checkout's `refresh` — `readTicketed`'s outcome) means NO view
   *  reached the screen: the hook retries and never closes the window on it. `"applied"`, or no
   *  outcome at all, counts as applied (`viewApplied`). */
  onChanged?: () => void | Promise<unknown>;
}): UndoGrace {
  // Client-local undo deadline (epoch ms, = receipt + server-measured grace) + a tick so the
  // countdown re-renders. The ref is the SAME value, written synchronously beside the setter, for
  // the one reader that asks after an `await` (`isOpen`) and for the tick's own close.
  const [deadlineMs, setDeadlineMsState] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  // The fire_batch the server handed back for THIS send — undo targets exactly it (S4-audit P1-3),
  // so the host's Undo never claws back a guest's make-it-now line that shares the grace window.
  const [batch, setBatch] = useState<string | null>(null);
  const batchRef = useRef<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  // Mirrors `pending` for the tick and `isOpen`, which read after an await (state would be a render late).
  const pendingRef = useRef(false);
  const [message, setMessage] = useState<GraceMessage | null>(null);
  const [closedBy, setClosedBy] = useState<GraceClose | null>(null);
  const graceWrites = useRef<Promise<void>>(Promise.resolve());
  // The batch whose undo LANDED on the server but whose re-sync never applied (Codex round 4 on
  // #313): a later tap for it owes only the READ. A second `undoFire` finds nothing in grace and
  // answers `expired` — "already with the kitchen" over dishes that are drafts.
  const restoredRef = useRef<string | null>(null);
  // The background read retry for a landed-but-unapplied undo (Codex round 5): cleared on a new
  // window and on unmount.
  const resyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoBtn = useRef<HTMLButtonElement | null>(null);
  const undoBtnRef = useCallback((el: HTMLButtonElement | null) => {
    undoBtn.current = el;
  }, []);
  // The latest callbacks, read at fire time (a continuation must not call a stale closure).
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const setDeadline = useCallback((v: number | null, closed: GraceClose | null) => {
    deadlineRef.current = v;
    setDeadlineMsState(v);
    if (v === null) setClosedBy(closed);
  }, []);
  const say = useCallback((m: GraceMessage) => {
    setMessage(m);
    optsRef.current?.say?.(m);
  }, []);

  /**
   * Codex round 5 on #313 — a landed undo whose reads keep failing is RETRIED IN THE BACKGROUND, with
   * the gate shut, until one applies. Releasing `pending` after the bounded attempts let the tick
   * close the window as "elapsed" the moment the deadline passed — over a view that still showed the
   * lines fired, so Pay went live over drafts the server had restored and create-intent refused it.
   * The state that gates money waits on the READ, never on the clock (LEARNINGS #219, #228). Stops
   * on its own when the window is superseded (`open`) or the hook unmounts.
   */
  const retryRead = useCallback(
    function retry(target: string) {
      resyncTimer.current = setTimeout(async () => {
        resyncTimer.current = null;
        if (restoredRef.current !== target || deadlineRef.current === null) return;
        let applied = false;
        try {
          applied = viewApplied(await optsRef.current?.onChanged?.());
        } catch {
          // The read's failure is its own; the next attempt asks again.
        }
        if (restoredRef.current !== target) return; // superseded while the read was out
        if (!applied) return retry(target);
        restoredRef.current = null;
        say({ kind: "ok", text: BROUGHT_BACK_NOTE }); // the read finally shows it
        setDeadline(null, "undone");
        pendingRef.current = false;
        setPending(false);
      }, RESYNC_RETRY_MS);
    },
    [say, setDeadline],
  );
  useEffect(
    () => () => {
      // Codex round 7 on #313 — a timer cleared here is not a read cancelled: the callback nulls
      // `resyncTimer` BEFORE it awaits, so a read that is out at unmount resolves afterwards and
      // `retry` would re-arm from a hook nobody renders (the abandoned checkout polling its cart every
      // 750 ms for the length of an outage). Cancellation is the TARGET, which every continuation
      // checks before it goes on.
      restoredRef.current = null;
      if (resyncTimer.current) clearTimeout(resyncTimer.current);
    },
    [],
  );

  // Drive the countdown while a window is open, and close it (drop the Undo affordance — the lines
  // are now truly with the kitchen) the moment it elapses. The clear happens inside the interval
  // callback, not the effect body, so it doesn't trigger a synchronous mid-render setState.
  useEffect(() => {
    if (deadlineMs === null) return;
    // The Send control just gave way to Undo — land focus on it so a keyboard/SR host can reverse
    // the send without hunting for it (B4). This fires on the OPEN edge, wherever the Undo is
    // mounted: on the Order stage normally, on the Bill when the send's answer lands after a flip.
    // Stage flips themselves are the <h1>'s (Checkout).
    undoBtn.current?.focus();
    const timer = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      // Phase 2a · send — `graceRemainingSec` is the ONE client reading of the window (lib/send-grace).
      // Never while an undo is still answering or re-syncing: the window ends on the read that shows
      // the truth, not on the clock (the close edge is the undo's own, above). And never over a
      // window ANOTHER path has just closed (`deadlineRef` null, this interval not yet torn down by
      // the re-render): a tick there would rewrite `closedBy` from "undone" to "elapsed".
      if (
        deadlineRef.current !== null &&
        graceRemainingSec(deadlineMs, now) === 0 &&
        !pendingRef.current
      )
        setDeadline(null, "elapsed");
    }, 250);
    return () => clearInterval(timer);
  }, [deadlineMs, setDeadline]);

  const remaining = graceRemainingSec(deadlineMs, nowMs);

  const open = useCallback(
    (res: GraceReceipt, receiptMs: number) => {
      // Open the undo window for the server-MEASURED grace, counted from THIS client's receipt
      // (`graceDeadlineMs`): immune to client-clock skew, and re-seeding `nowMs` to the same instant
      // avoids a first-paint flash. null ⇒ no window (still sent). The server re-checks fire_at on
      // undo regardless, so the countdown is advisory.
      setNowMs(receiptMs);
      // A new send, a new batch — nothing landed for it yet; a background retry for the old one stops.
      restoredRef.current = null;
      if (resyncTimer.current) clearTimeout(resyncTimer.current);
      resyncTimer.current = null;
      pendingRef.current = false;
      setPending(false);
      batchRef.current = res.undoBatch;
      setBatch(res.undoBatch);
      setClosedBy(null);
      setDeadline(graceDeadlineMs(res, receiptMs), null);
    },
    [setDeadline],
  );

  const undo = useCallback(
    (cartId: string, frozen: boolean): Promise<void> => {
      // The window only opens with a batch id (see `open`); guard so undo always targets a concrete batch.
      const target = batchRef.current;
      if (target === null || deadlineRef.current === null) return Promise.resolve();
      if (frozen) {
        // ⚠️ The window is NOT closed here. Ending it early would forfeit an undo the SQL would
        // still honour once the lock clears. The countdown keeps running; only the tap is refused,
        // and it says why.
        say({ kind: "err", text: FROZEN_NOTE });
        return Promise.resolve();
      }
      pendingRef.current = true;
      setPending(true);
      // Chained after any write already in flight; the attempt owns its errors, so the chain can
      // never reject — which is what lets Pay `await` it without a try.
      const write = graceWrites.current.then(async () => {
        // ⚠️ The window CLOSES only after the re-sync below has landed (blind pass on 3c-i, all
        // three lenses). Closing it on the server's answer left a render in which the window was
        // shut, nothing was pending and the lines still read `fired` — Pay live over drafts the undo
        // had just returned, the counter door live, "Brought back" beside "with the kitchen" — for
        // the whole round trip of the read. The answer is SAID at once (it is true); the state that
        // gates money moves only when the view can keep it.
        let close: GraceClose | null = null;
        // Codex round 4 on #313 — the undo for THIS batch already landed on an earlier tap and only
        // its re-sync failed: the write is not repeated (it would read `expired`), the read is.
        const alreadyLanded = restoredRef.current === target;
        if (alreadyLanded) close = "undone";
        else
          try {
            const res = await undoFire(cartId, target);
            if (res.ok) {
              say({ kind: "ok", text: BROUGHT_BACK_NOTE });
              close = "undone"; // the batch is back in draft → the window closes once the view says so
            } else if (res.reason === "expired") {
              // The grace passed mid-tap — honest steer to a server, and the window is genuinely over.
              say({
                kind: "ok",
                text: "That’s already with the kitchen — ask a server to change it.",
              });
              close = "expired";
            } else {
              // locked / settling / rate_limited / error: NOTHING was un-fired and the lines may still
              // be in grace — keep the window open so the host can retry; it expires on its own.
              say({ kind: "err", text: reasonCopy[res.reason] });
            }
          } catch {
            // Uncertain outcome — leave the window to expire naturally; the re-sync shows the true state.
            say({ kind: "err", text: "Couldn’t undo that just now — please try again." });
          }
        // Re-sync regardless — reveals the true state after an undo. ON the chain: a drain that
        // resolved before this read landed would decide Pay against a view the undo has outdated.
        // ⚠️ AND THE WINDOW CLOSES ONLY ON A RE-SYNC THAT APPLIED (Codex round 3 on #313). Checkout's
        // `refresh` RESOLVES "failed" on a read that never landed — it does not throw — so a close on
        // that answer left the old fired lines on screen under "Brought back", with Pay live (no
        // drafts in view, no grace) until create-intent refused the drafts the undo had restored. A
        // failed read is retried, bounded, with the gate still shut; if none lands the window stays
        // OPEN and `pending` STAYS TRUE (round 5: releasing it let the tick close an expired deadline
        // over the stale view), the sentence says what happened, and `retryRead` keeps asking in the
        // background until a read applies. `expired` closes regardless: the kitchen has the lines,
        // and an Undo that can never land is the defect `expired-keeps-the-window` pins.
        let applied = false;
        for (let attempt = 0; attempt < RESYNC_ATTEMPTS && !applied; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, RESYNC_RETRY_MS));
          try {
            const r = await optsRef.current?.onChanged?.();
            applied = viewApplied(r);
          } catch {
            // The re-sync's failure is its own (refresh swallows and probes); the chain stays whole.
          }
        }
        if (close === "expired" || (close && applied)) {
          // The read finally shows it — unless the background retry got there first and already said so.
          if (alreadyLanded && restoredRef.current === target)
            say({ kind: "ok", text: BROUGHT_BACK_NOTE });
          restoredRef.current = null;
          setDeadline(null, close);
          pendingRef.current = false;
          setPending(false);
        } else if (close) {
          restoredRef.current = target; // landed; only the read is owed from here
          say({ kind: "err", text: RESYNC_FAILED_NOTE });
          retryRead(target);
        } else {
          pendingRef.current = false;
          setPending(false);
        }
      });
      graceWrites.current = write;
      return write;
    },
    [say, setDeadline, retryRead],
  );

  // Open while the window still has time OR an undo is still settling against it (the deadline may
  // pass mid-answer; the window ends on the re-sync, not the clock).
  const isOpen = useCallback(
    () =>
      deadlineRef.current !== null &&
      (graceRemainingSec(deadlineRef.current, Date.now()) > 0 || pendingRef.current),
    [],
  );

  return {
    deadlineMs,
    batch,
    remaining,
    pending,
    message,
    closedBy,
    graceWrites,
    undoBtnRef,
    open,
    undo,
    isOpen,
  };
}
