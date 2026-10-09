"use client";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button, Icon, matchesFocusVisible, useAnimationPreference } from "@mms/ui";
import { announceArrival } from "@/lib/arrival-action";
import {
  actionOutcome,
  clearPendingArrival,
  pendingArrivalCleared,
  readPendingArrival,
  reconcileDue,
  routeOutcome,
  safeLocalStorage,
  writePendingArrival,
  type ArrivalOutcome,
} from "@/lib/arrival-pending";
import { BRAND_PHONE_DISPLAY, BRAND_PHONE_TEL } from "@/lib/brand";
import { hasCelebrated, markCelebrated, safeSessionStorage } from "@/lib/celebration-latch";
import { TRACK } from "@/lib/i18n/track";
import type { Entry } from "@/lib/i18n/types";
import {
  ARRIVAL_UNDO_MS,
  arrivalCommitDue,
  arrivalTapHeld,
  pickupGuide,
  type PickupStage,
} from "@/lib/pickup-promise";
import { formatClock } from "@/lib/pickupTime";
import type { TrackedOrder } from "@/lib/track-order";
import { capRelease, heldFor, holdCapPhase, NO_HOLD, setHeld, type Hold } from "@/lib/undo-hold";
import { ClaimTicket } from "./ClaimTicket";

/**
 * PD3 — the pickup promise on /track (docs/path-design-2026-10-07/m3-pickup-promise.md; PATH_DESIGN
 * moment 3, decision 5, correction 16, round 3). The screen talks like a relative standing next to
 * you: a NOW sentence (the h1, said once), the where-am-I path, the claim ticket (ONE PASS), and
 * ONE question — "At the restaurant now?" — with the one thing to do.
 *
 * Every state comes from `pickupGuide` (lib/pickup-promise.ts, pure, mutated). This file owns the
 * WIRING that has nowhere else to live:
 *   - the 6-second take-back before the arrival is written (decision 10): "I’m here" and its Undo
 *     swap in ONE slot behind the same-gesture guard (A2), with the capped keyboard hold
 *     (lib/undo-hold.ts, B5) and its "about to go through" line in the one region;
 *   - commit-on-hide, the `pagehide` beacon and the pending record (m3 §E–§G): written at the
 *     COMMIT only, cleared by an ANSWER only, reconciled on the next visit;
 *   - the Ready edge: the TURN, once per order per tab (celebration-latch), never on a revisit or
 *     a first paint (hydration-safe: only a transition this mount OBSERVED turns), waiting for the
 *     next visible frame when it lands hidden; `document.title` at the edge, restored after;
 *   - the wake re-read (`visibilitychange→visible` / `focus`, coalesced) and, while the live read
 *     is no longer authorized, a visible-only re-read on the 30 s tick (B7).
 *
 * One live region per view: this `role="status"` replaces OrderTracker's for the pickup page.
 */
const EDGE_TITLE = "Ready for pickup · Morning Star";
const STEPS = ["Order placed", "In the kitchen", "Ready for pickup", "Picked up"] as const;

type Phase = "idle" | "window" | "committing" | "confirmed" | "refused";
type Window = { startedMs: number; armedAt: number; hold: Hold; capWarned: boolean };

export function PickupPromise({
  order,
  justPaid,
  live,
  onWake,
}: {
  order: TrackedOrder;
  /** PaySuccess holds the page's h1, so the Now sentence renders as an h2 beneath it. */
  justPaid: boolean;
  /** The Realtime read is still authorized (a stale fallback snapshot is `false`). */
  live: boolean;
  /** Re-read the order once (the wake; the 30 s tick while `live` is false). */
  onWake: () => void;
}) {
  const pickupSlot = order.pickupSlot ?? order.createdAt; // the host renders this only for a pickup
  const { shouldAnimate } = useAnimationPreference();
  const kickerId = useId();
  const cardTitleId = useId();

  // ── the clock: a 30 s tick re-derives the guide (countdown, the late arm); wake re-reads ────────
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (order.togoStatus === "picked_up") return;
    const t = setInterval(() => setNowTick(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, [order.togoStatus]);
  const guide = pickupGuide(
    {
      status: order.status,
      pickupSlot,
      fireAt: order.fireAt,
      togoStatus: order.togoStatus,
      arrivedAt: order.arrivedAt,
      createdAt: order.createdAt,
    },
    nowTick,
  );
  const { stage } = guide;
  const terminal = stage === "pickedUp";

  // Wake: on return to the foreground, ONE re-read (coalesced across `visibilitychange` + `focus`).
  // The callback is read through a ref (Codex r1 on #330, P1): the host's `wake` is rebuilt every
  // time its fallback snapshot changes, and an effect keyed on it re-fired on every answer — a tight
  // request loop where a 30 s poll was meant.
  const onWakeRef = useRef(onWake);
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);
  const lastWakeRef = useRef(0);
  useEffect(() => {
    // The wake only advances the clock; the effect below does the ONE re-read per clock change
    // (blind pass on #330: this handler used to read too, so every wake cost two reads).
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastWakeRef.current < 1000) return;
      lastWakeRef.current = now;
      setNowTick(now);
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, []);
  // B7 — ONE re-read on every clock change (the 30 s tick, a wake) while the page is visible and the
  // order not yet collected, LIVE OR NOT (blind pass on #330, critical). The 4-hour session lapses
  // under a far-booked pickup with no event at all — Realtime simply goes quiet — so the first draft,
  // which read only while not live, never noticed: `live` stayed true and Ready never landed. A live
  // read that comes back empty is what flips the host to its snapshot (`useOrderStatus.stale`), and
  // the `live` dependency then reads that snapshot at once. Never at mount (the host's own read is
  // the first), and keyed on the clock and the live transition only, never the callback's identity.
  const mountedReadRef = useRef(false);
  useEffect(() => {
    if (!mountedReadRef.current) {
      mountedReadRef.current = true;
      return;
    }
    if (terminal) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    onWakeRef.current();
  }, [nowTick, live, terminal]);

  // ── the one live region: the Now pair on every stage change, the arrival's own lines ──────────
  // ── the Ready edge: the TURN, once; the title while away ───────────────────────────────────────
  // Render-time compare-with-previous (the useOrderStatus pattern; the codebase's lint bans the
  // setState-in-effect form). A first paint has no previous stage, so it never speaks or turns —
  // hydration-safe by construction; a revisit renders the pass at rest (a resume is not an
  // arrival, §15); the latch keeps a remount in the same tab quiet.
  const [spoken, setSpoken] = useState<Entry>(() => guide.now);
  const [turning, setTurning] = useState(false);
  const [turnArmed, setTurnArmed] = useState(false);
  const [edge, setEdge] = useState(0);
  const [prevStage, setPrevStage] = useState<PickupStage | null>(null);
  if (stage !== prevStage) {
    setPrevStage(stage);
    if (prevStage !== null) {
      setSpoken(guide.now);
      if (
        prevStage !== "ready" &&
        stage === "ready" &&
        !hasCelebrated(safeSessionStorage(), `ready:${order.id}`)
      ) {
        setEdge((n) => n + 1);
        // Reduced motion: the instant swap is the base style, and the latch is still written below.
        if (shouldAnimate) {
          if (document.visibilityState === "hidden")
            setTurnArmed(true); // the next visible frame
          else setTurning(true);
        }
      }
    }
  }
  useEffect(() => {
    if (edge > 0) markCelebrated(safeSessionStorage(), `ready:${order.id}`);
  }, [edge, order.id]);
  useEffect(() => {
    if (!turnArmed) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setTurnArmed(false);
      setTurning(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [turnArmed]);
  const onTurnEnd = useCallback(() => setTurning(false), []);
  useEffect(() => {
    if (stage !== "ready") return;
    const before = document.title;
    document.title = EDGE_TITLE;
    return () => {
      if (document.title === EDGE_TITLE) document.title = before;
    };
  }, [stage]);

  // ── "I’m here": the take-back window, the commit, the pending record ───────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [win, setWin] = useState<Window | null>(null);
  /** When the "I’m here" control last (re)mounted under a finger — the same-gesture guard. */
  const [hereArmedAt, setHereArmedAt] = useState<number | null>(null);
  const [confirmedLocal, setConfirmedLocal] = useState(false);
  const announced = !!order.arrivedAt || confirmedLocal;
  const hereRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const winRef = useRef<Window | null>(null);
  useEffect(() => {
    winRef.current = win;
  }, [win]);
  /** An in-page send is out and unanswered: the arrival is still beacon-able on a teardown (Codex r1
   *  on #330, P1 — `visibilitychange→hidden` commits and empties the window BEFORE `pagehide`, so a
   *  tab closed right after it never sent the beacon the record exists to repair). */
  const sendOutRef = useRef(false);

  const settle = useCallback(
    (outcome: ArrivalOutcome, error?: string) => {
      sendOutRef.current = false;
      if (pendingArrivalCleared(outcome)) clearPendingArrival(safeLocalStorage(), order.id);
      if (outcome.answered && outcome.ok) {
        setPhase("confirmed");
        setConfirmedLocal(true);
        setSpoken(TRACK.confirmed);
      } else {
        setPhase("refused");
        setSpoken({ en: error ?? TRACK.refused.en, my: TRACK.refused.my });
      }
    },
    [order.id],
  );
  /** The window ended (or the page hid inside it): write the record, then the in-page send. */
  const commit = useCallback(() => {
    const w = winRef.current;
    if (!w) return;
    winRef.current = null;
    setWin(null);
    setPhase("committing");
    writePendingArrival(safeLocalStorage(), order.id, Date.now());
    sendOutRef.current = true;
    // A resolved `failed` / `rate` is not an answer (`actionOutcome`, lib/arrival-pending.ts).
    announceArrival({ orderId: order.id })
      .then((r) => settle(actionOutcome(r), r.ok ? undefined : r.error))
      .catch(() => settle({ answered: false }));
  }, [order.id, settle]);

  function tapHere() {
    const now = Date.now();
    if (arrivalTapHeld(hereArmedAt, now)) return;
    setWin({ startedMs: now, armedAt: now, hold: NO_HOLD, capWarned: false });
    setPhase("window");
    setSpoken(TRACK.takeBack);
  }
  function tapUndo() {
    const w = winRef.current;
    const now = Date.now();
    if (!w || arrivalTapHeld(w.armedAt, now)) return;
    winRef.current = null;
    setWin(null);
    setPhase("idle");
    setHereArmedAt(now);
    setSpoken(TRACK.undone);
  }
  // Focus follows the swap in the one slot (2.4.3): Undo after the tap, "I’m here" after the undo,
  // the card after THIS device's confirmation — never on a load that arrives already stamped.
  useEffect(() => {
    if (phase === "window") undoRef.current?.focus({ preventScroll: true });
    else if (phase === "idle" && hereArmedAt !== null)
      hereRef.current?.focus({ preventScroll: true });
  }, [phase, hereArmedAt]);
  useEffect(() => {
    if (confirmedLocal && document.activeElement === document.body)
      cardRef.current?.focus({ preventScroll: true });
  }, [confirmedLocal]);

  // The window's tick: the commit when due (held time added), the cap's warn and release.
  useEffect(() => {
    if (phase !== "window") return;
    const id = setInterval(() => {
      const w = winRef.current;
      if (!w) return;
      const now = Date.now();
      const cap = holdCapPhase(w.hold, now);
      if (cap === "release") {
        const next = { ...w, hold: capRelease(w.hold, now) };
        winRef.current = next;
        setWin(next);
      } else if (cap === "warn" && !w.capWarned) {
        const next = { ...w, capWarned: true };
        winRef.current = next;
        setWin(next);
        setSpoken(TRACK.capSoon);
      }
      const held = heldFor(winRef.current?.hold ?? NO_HOLD, now);
      if (arrivalCommitDue(w.startedMs, held, now)) commit();
    }, 250);
    return () => clearInterval(id);
  }, [phase, commit]);
  // Commit-on-hide: the tap was deliberate, so the page hiding inside the window commits at once.
  // `visibilitychange→hidden` keeps the page alive (the in-page send runs); `pagehide` tears it
  // down, where only a beacon survives — the record is written first, so a dropped beacon is
  // repaired on the next visit (§E, §F).
  useEffect(() => {
    if (phase !== "window" && phase !== "committing") return;
    const onHidden = () => {
      if (document.visibilityState === "hidden" && winRef.current) commit();
    };
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return; // a bfcache freeze comes back with the window (or the send) intact
      // An open window commits here; a send still out is beaconed too, so the arrival reaches Dad
      // whether or not the page lives long enough to hear the action's answer.
      if (!winRef.current && !sendOutRef.current) return;
      winRef.current = null;
      writePendingArrival(safeLocalStorage(), order.id, Date.now());
      try {
        navigator.sendBeacon?.(
          "/api/track/arrival",
          new Blob([JSON.stringify({ orderId: order.id })], { type: "application/json" }),
        );
      } catch {
        /* beacon unavailable — the record above is retried on the next visit */
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [phase, commit, order.id]);
  // Reconcile on mount (§F): a RECENT committed arrival nobody answered is re-sent; a stamped order,
  // or a record past the replay window, retires its record without a send. Once per order per mount.
  const reconciledRef = useRef<string | null>(null);
  useEffect(() => {
    if (reconciledRef.current === order.id) return;
    reconciledRef.current = order.id;
    const store = safeLocalStorage();
    const rec = readPendingArrival(store, order.id);
    if (!rec) return;
    if (!reconcileDue(rec, order.arrivedAt, Date.now())) {
      clearPendingArrival(store, order.id);
      return;
    }
    let active = true;
    fetch("/api/track/arrival", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: order.id }),
    })
      .then(async (res) => {
        if (!active) return;
        // Only the route's own answers clear the record (`routeOutcome`, lib/arrival-pending.ts).
        const body: unknown = await res.json().catch(() => null);
        const outcome = routeOutcome(res.status, body);
        if (!pendingArrivalCleared(outcome)) return;
        clearPendingArrival(store, order.id);
        if (outcome.answered && outcome.ok) {
          setConfirmedLocal(true);
          setPhase("confirmed");
        }
      })
      .catch(() => {
        /* no answer — the record stays for the next visit */
      });
    return () => {
      active = false;
    };
  }, [order.id, order.arrivedAt]);

  // The keyboard hold (WCAG 2.2.1): only `:focus-visible` focus holds; a touch never stalls the write.
  function holdUndo(held: boolean) {
    const w = winRef.current;
    if (!w) return;
    const next = { ...w, hold: setHeld(w.hold, "slot", held, Date.now()) };
    winRef.current = next;
    setWin(next);
  }
  function onUndoFocus(e: React.FocusEvent<HTMLButtonElement>) {
    if (matchesFocusVisible(e.currentTarget)) holdUndo(true);
  }
  function onUndoBlur() {
    holdUndo(false);
  }

  // ── render ─────────────────────────────────────────────────────────────────────────────────────
  const NowTag = justPaid ? "h2" : "h1";
  const code = order.id.slice(-6).toUpperCase();
  const stepTimes: (string | null)[] = [
    order.createdAt,
    null,
    order.togoReadyAt,
    order.togoPickedUpAt,
  ];
  const offered = guide.arrivalOffered && !announced;
  // The late sub promises the moment; only the live read keeps it (B7 / Codex r1 on #330). On the
  // 30 s snapshot the foot's "catches up whenever you come back" is the true sentence.
  const sub = guide.stage === "late" && !live ? null : guide.sub;
  const showCard = terminal
    ? false
    : announced || offered || phase === "window" || phase === "committing";
  const lateDoor = stage === "late";
  // B10 — the quiet human fallback comes LAST: once a pickup runs late, the restaurant's phone as a
  // 44px paper door, labelled by the language-neutral number. It is the stuck state's ONE way out,
  // so it never depends on the arrival card being open (Codex r2 on #330): past the restaurant's
  // midnight an unbagged order is still late while the arrival is no longer offered.
  const door = (
    <a
      href={`tel:${BRAND_PHONE_TEL}`}
      className="ui-btn ui-btn-secondary ui-btn-sm pickup-door"
      aria-label={`Call ${BRAND_PHONE_DISPLAY}`}
    >
      <Icon name="phone" size={16} aria-hidden />
      <span className="pickup-door-number">{BRAND_PHONE_DISPLAY}</span>
    </a>
  );

  return (
    <>
      <NowTag className="pickup-now">
        {guide.now.en}
        <span lang="my" className="pickup-now-my">
          {guide.now.my}
        </span>
      </NowTag>
      {sub && (
        <p className="pickup-sub">
          {sub.en}
          <span lang="my" className="pickup-sub-my">
            {sub.my}
          </span>
        </p>
      )}

      {/* The one live region. role="status" implies aria-live=polite. */}
      <p role="status" className="sr-only">
        {spoken.en} <span lang="my">{spoken.my}</span>
      </p>

      {/* The where-am-I path: four stops, a glyph AND a word for every state, real clocks only. */}
      <ol role="list" aria-label="Order status" className="pickup-path" data-step={guide.step}>
        <span aria-hidden className="pickup-rail">
          <span className="pickup-rail-fill" style={{ transform: `scaleX(${guide.step / 3})` }} />
        </span>
        {STEPS.map((title, i) => {
          const state = i < guide.step ? "done" : i === guide.step ? "now" : "next";
          const clock = state !== "next" ? stepTimes[i] : null;
          return (
            <li
              key={title}
              className="pickup-stop"
              data-state={state}
              aria-current={state === "now" ? "step" : undefined}
            >
              {/* D4: the halo runs at most 3 cycles per step change (keyed on the step), off under RM. */}
              <span
                key={guide.step}
                aria-hidden
                className={`pickup-dot${state === "now" && shouldAnimate ? " mms-track-now" : ""}`}
              >
                {state === "done" && <Icon name="check" size={10} />}
              </span>
              <span className="pickup-stop-label">{title}</span>
              <span className="sr-only">{state}</span>
              {clock && <span className="pickup-stop-clock">{formatClock(clock)}</span>}
            </li>
          );
        })}
      </ol>

      <ClaimTicket
        face={guide.face}
        turning={turning}
        onTurnEnd={onTurnEnd}
        slotLabel={guide.slotLabel}
        code={code}
        name={order.customerName}
        countdownMin={guide.countdownMin}
        pickedUpLabel={order.togoPickedUpAt ? formatClock(order.togoPickedUpAt) : null}
        labelId={kickerId}
      />

      {showCard && (
        <section
          ref={cardRef}
          tabIndex={-1}
          className="card pickup-guide"
          aria-labelledby={announced ? undefined : cardTitleId}
          aria-label={announced ? "Arrival" : undefined}
        >
          {announced ? (
            <div className="pickup-confirmed">
              <span aria-hidden className="pickup-done-disc">
                <Icon name="check" size={16} />
              </span>
              <p className="pickup-confirmed-line">
                {TRACK.confirmed.en}
                <span lang="my" className="pickup-line-my">
                  {TRACK.confirmed.my}
                </span>
              </p>
            </div>
          ) : (
            <>
              <h2 id={cardTitleId} className="pickup-guide-title">
                {phase === "window" || phase === "committing"
                  ? TRACK.takeBack.en
                  : TRACK.question.en}
                <span lang="my" className="pickup-line-my">
                  {phase === "window" || phase === "committing"
                    ? TRACK.takeBack.my
                    : TRACK.question.my}
                </span>
              </h2>
              {phase === "window" || phase === "committing" ? (
                // One Undo form: the lane's dashed --ac posture on --sf, in the SAME 64px slot, the
                // seconds as an aria-hidden leaf (A1 / B1). Committing drops the dashed edge (C3).
                <Button
                  ref={undoRef}
                  variant="secondary"
                  size="xl"
                  block
                  className={phase === "window" ? "arrival-undo" : undefined}
                  busy={phase === "committing"}
                  busyLabel="Letting them know…"
                  onClick={tapUndo}
                  onFocus={onUndoFocus}
                  onBlur={onUndoBlur}
                >
                  <span className="pickup-btn-stack">
                    <span>
                      {TRACK.undo.en}
                      {win && <ArrivalUndoCount startedMs={win.startedMs} hold={win.hold} />}
                    </span>
                    <span lang="my" className="pickup-btn-my">
                      {TRACK.undo.my}
                    </span>
                  </span>
                </Button>
              ) : (
                <Button ref={hereRef} variant="primary" size="xl" block onClick={tapHere}>
                  <span className="pickup-btn-stack">
                    <span>{TRACK.imHere.en}</span>
                    <span lang="my" className="pickup-btn-my">
                      {TRACK.imHere.my}
                    </span>
                  </span>
                </Button>
              )}
              {phase === "refused" && (
                <p className="pickup-refused">
                  {TRACK.refused.en}
                  <span lang="my" className="pickup-line-my">
                    {TRACK.refused.my}
                  </span>
                </p>
              )}
            </>
          )}
          {/* The door is the card's LAST line when the card is open (B10). */}
          {lateDoor && door}
        </section>
      )}
      {/* …and stands on its own when the card is not (no arrival offered or announced). */}
      {lateDoor && !showCard && <p className="pickup-door-alone">{door}</p>}
    </>
  );
}

/** The Undo label's count: " — 6s", aria-hidden (the name is "Undo ပြန်ဖျက်"), re-read on a 250 ms
 *  tick by THIS leaf only. The count freezes while a keyboard user holds the window. */
function ArrivalUndoCount({ startedMs, hold }: { startedMs: number; hold: Hold }) {
  const read = () => {
    const now = Date.now();
    const deadline = startedMs + heldFor(hold, now) + ARRIVAL_UNDO_MS;
    return Math.max(0, Math.ceil((deadline - now) / 1000));
  };
  const left = useSyncExternalStore(subscribeTick, read, read);
  return <span aria-hidden>{` — ${left}s`}</span>;
}
function subscribeTick(onTick: () => void): () => void {
  const id = setInterval(onTick, 250);
  return () => clearInterval(id);
}
