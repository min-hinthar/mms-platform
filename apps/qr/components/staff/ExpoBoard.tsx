"use client";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { getExpoQueue, setTogoStatus } from "@/lib/expo";
import {
  expoAge,
  isScanGoBasket,
  PICKED_UNDO_ARM_MS,
  PICKED_UNDO_MS,
  pickedUndoArmed,
  pickedUndoOpen,
  toastPick,
} from "@/lib/expo-rules";
import { heldFor, NO_HOLD, setHeld, type Hold, type HoldSource } from "@/lib/undo-hold";
import { expoErrOutcome, expoFailedMsg, type ExpoMsg, type ExpoSubject } from "@/lib/expo-errors";
import { actionErrorStale, ERR_DWELL_MS } from "@/lib/kds-errors";
import { fmtElapsed, spokenElapsed } from "@/lib/kds-time";
import { haptic } from "@/lib/haptics";
import type { ExpoErrCode } from "@/lib/expo-types";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { useWakeLock } from "@/lib/useWakeLock";
import { formatSlotLong } from "@/lib/pickupTime";
import { tf } from "@/lib/i18n/fill";
import { al, sx } from "@/lib/staff-labels";
import type { ExpoLine, ExpoQueue, ExpoTicket } from "@/lib/expo-types";
import { ExpoLineMy, TicketNote } from "./TicketText";
import { MsgText } from "./StaffMsg";
import { StaggerList } from "./StaggerList";
import {
  Badge,
  EmptyState,
  Icon,
  matchesFocusVisible,
  removeHeld,
  SAME_GESTURE_MS,
  Toast,
  TOAST_LEAVE_MS,
} from "@mms/ui";
import { useLiveBoardState, useReportLive } from "./LiveConnection";
import { ts } from "@/lib/i18n/staff";
import { useStaffLang } from "./StaffLangProvider";
import { bumpBtn, pickedBtn, readyBtn, undoBtn } from "./expo-stage";
import { Chrome } from "./Chrome";

/**
 * Expo / bagging station (S4.3a, W3a) — the takeaway counterpart to the KDS. Server-rendered initial
 * queue, kept live by Postgres-Changes (useFloorRealtime watches qr_orders → re-fetch the server-
 * authoritative getExpoQueue; never client state-math) with a 5s poll BACKSTOP. Re-fetches debounced.
 * ONE polite live region (bump error takes precedence over the count). Two-stage bump: "Bagged & ready"
 * (preparing→ready, lights the diner's /track AND the order-ready board) then "Picked up" (ready→
 * picked_up, drops off both). W3a: the queue arrives sorted by EFFECTIVE DUE TIME with "Here now"
 * pinned; pickup/scango bags headline the first name + short code. K10: an expired staff cookie or a
 * locked console redirects honestly instead of wearing "Reconnecting…" forever.
 *
 * A4·2 — a LANE of the counter's one screen, not a page: the page's bar carries the help door and
 * the language control (rule 4 holds a page to ONE), so the board mounts no bar and no column of
 * its own; its h2 is the section's name and the focus target after a bump. The kitchen's own
 * progress (K30 (B)) badges a bag whose to-go food is done and lifts it above bags still cooking.
 */
export function ExpoBoard({
  initial,
  initialOutage = false,
}: {
  initial: ExpoQueue;
  /** A4·2 — the server's own read of the lane failed as an OUTAGE while the floor's succeeded: the
   *  lane starts frozen (its empty-as-of-the-last-update face, never an all-clear) and the floor
   *  beside it stays live — the same posture the client takes on a failed poll. */
  initialOutage?: boolean;
}) {
  // P2 — the device language, from app/staff/layout.tsx. The outage banner below is the first
  // thing on this board to speak it; the rest of the chrome follows in its own commit.
  const lang = useStaffLang();
  const [snap, setSnap] = useState(initial);
  // The lane's ONE region: a KEY with its slots or a server sentence, never only a string (§17,
  // the KDS's kitchen-3 — the same wall stood here as P2p).
  const [err, setErr] = useState<ExpoMsg | null>(null);
  const [notice, setNotice] = useState<ExpoMsg | null>(null); // one-shot (the picked-up window)
  // kitchen-10's dwell, on the lane too: a refusal outlives the poll that follows it.
  const errSince = useRef<number | null>(null);
  const showErr = useCallback((m: ExpoMsg | null) => {
    errSince.current = m ? Date.now() : null;
    setErr(m);
  }, []);
  const onRefused = useCallback(
    (res: { error: string; code: ExpoErrCode }, subject: ExpoSubject) => {
      const out = expoErrOutcome(res, subject);
      if (out.kind === "leave") {
        window.location.assign(out.href);
        return;
      }
      showErr(out.msg);
    },
    [showErr],
  );
  // W10b — one degraded state carrying WHEN it started and WHY (see KdsBoard for the full note).
  // `since` and `nowMs` are BOTH the device clock here, so the elapsed driving the paper-flow
  // escalation is measured in one domain — a skewed tablet can't shorten or extend it.
  // SERVER-space clock (the KDS pattern, counter-7): seeded from the snapshot's own stamp — pure
  // in render — and advanced every second in a callback as `Date.now() + offset`, the offset taken
  // whenever a snapshot lands. Ages, the picked-up windows and the escalation all read the one
  // clock, and every `since` is stamped in the same space, so a skewed tablet can neither age a
  // bag early nor shorten the paper-flow escalation.
  const [nowMs, setNowMs] = useState(() => Date.parse(initial.serverNow));
  const clockOffset = useRef<number | null>(null);
  // The offset is taken AT MOUNT (the KDS's line) — a first tick a second later would seed it a
  // second short and every age would read one second young for the rest of the shift.
  useEffect(() => {
    clockOffset.current ??= Date.parse(initial.serverNow) - Date.now();
    // initial.serverNow is a mount-time snapshot — the prop never changes meaningfully.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stampNow = useCallback(() => {
    // ASSIGN the mount-time offset once (`??=`, the KDS's line) — a fallback that recomputed
    // `Date.parse(initial.serverNow) - Date.now()` on every call collapses to the constant
    // `Date.parse(initial.serverNow)`, and a lane that mounts into an outage then never advances:
    // no age, no escalation, "reconnecting" forever (blind pass, critical 1).
    clockOffset.current ??= Date.parse(initial.serverNow) - Date.now();
    return Date.now() + clockOffset.current;
    // initial.serverNow is a mount-time snapshot — the prop never changes meaningfully.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [degraded, setDegraded] = useState<StaffDegraded | null>(() =>
    initialOutage ? nextDegraded(null, "outage", Date.parse(initial.serverNow)) : null,
  );
  const fails = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  // counter-1 — the picked-up windows, keyed by ORDER in the lane (a card re-renders from `snap`
  // on every poll and would lose its own state): when each was tapped, and the subject its
  // sentences name. See the tick below and `PICKED_UNDO_MS`.
  const [picked, setPicked] = useState<
    ReadonlyMap<string, { at: number; subject: ExpoSubject; committing: boolean }>
  >(() => new Map());
  // A mirror for the two readers that run outside render and outside the tick's closure: the
  // poll's redirect and the unmount flush. Written in an effect, never during render.
  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);
  // ── Phase 2b · feedback ── the thumb-zone Undo (see the Toast below).
  // The HOLDS on each window (lib/undo-hold): a keyboard user sitting on an Undo stops the window
  // running (WCAG 2.2.1). A REF, because the tick reads it and a focus change must never re-arm the
  // tick's interval; `heldIds` is a separate state for the one thing that draws a hold — the pill's
  // drain. Neither is in the tick's deps.
  const holdsRef = useRef<Map<string, Hold>>(new Map());
  const [heldIds, setHeldIds] = useState<ReadonlySet<string>>(() => new Set());
  const markHeld = useCallback((orderId: string, h: Hold) => {
    holdsRef.current.set(orderId, h);
    const on = h.sources.size > 0;
    setHeldIds((ids) => {
      if (ids.has(orderId) === on) return ids;
      const next = new Set(ids);
      if (on) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }, []);
  const hold = useCallback(
    (orderId: string, source: HoldSource, held: boolean) => {
      const prev = holdsRef.current.get(orderId) ?? NO_HOLD;
      const next = setHeld(prev, source, held, Date.now());
      if (next !== prev) markHeld(orderId, next);
    },
    [markHeld],
  );
  // When each card was last UNDONE — the slot refuses a re-pick for the same gesture after it, so
  // the second half of a double-tapped Undo cannot pick the bag straight back up.
  const undoneAt = useRef<Map<string, number>>(new Map());
  // The pill: the pick that opened it (never an older one — `toastPick`), its phase, and whether its
  // Undo has armed. `key` replays the entrance when a new pick replaces it.
  const [toast, setToast] = useState<{
    id: string;
    subject: ExpoSubject;
    key: number;
    phase: "open" | "shield" | "leave";
    armed: boolean;
  } | null>(null);
  const toastSeq = useRef(0);

  useWakeLock(); // O-F: the bagging tablet is always-on too

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // raceTimeout (W10b): a hung poll must degrade into the catch path, not freeze inFlight.
      const res = await raceTimeout(getExpoQueue());
      if (!res.ok) {
        // W10b (M32): outage ≠ signed out — keep the last-known bags instead of redirecting the
        // counter to login mid-service.
        if (res.reason === "outage") {
          setNowMs(stampNow());
          setDegraded((d) => nextDegraded(d, "outage", stampNow()));
          return;
        }
        // A window still open when the console is leaving (a lock, an expired cookie) is a bag the
        // counter already handed over: send its write NOW, then go. A refused write (the cookie
        // really is gone) leaves the bag "ready", which is the honest state for a bag whose pick
        // was never recorded — the same outcome, minus the silence.
        await Promise.allSettled(
          [...pickedRef.current]
            .filter(([, p]) => !p.committing)
            .map(([orderId]) => setTogoStatus({ orderId, to: "picked_up" })),
        );
        window.location.assign(res.reason === "locked" ? "/staff/lock" : "/staff/login");
        return;
      }
      setSnap(res.queue);
      clockOffset.current = Date.parse(res.queue.serverNow) - Date.now();
      // A bag that left the queue under an open picked-up window (someone else's tap, a refund)
      // takes its window with it — writing picked_up to a gone order would only earn a "stale"
      // banner. Pruned HERE, in the poll's own callback, never in an effect on `snap`.
      const live = new Set(res.queue.tickets.map((t) => t.orderId));
      setPicked((prev) =>
        [...prev.keys()].every((id) => live.has(id))
          ? prev
          : new Map([...prev].filter(([id]) => live.has(id))),
      );
      if (actionErrorStale(errSince.current, Date.now(), ERR_DWELL_MS)) {
        errSince.current = null;
        setErr(null);
      }
      fails.current = 0;
      setDegraded(null);
    } catch (e) {
      // Cause `unknown` — this end failed, which isn't evidence the platform is down.
      fails.current += 1;
      setNowMs(stampNow());
      if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", stampNow()));
      console.error("[ExpoBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, [stampNow]);

  // counter-1 — the deferred write. The 1 s tick below closes windows on the LOCAL clock and sends
  // it — the same tick that expires the KDS's undo. A tab closed inside the window loses the write,
  // and the bag stays "ready": the safe direction.
  const dropPicked = useCallback(
    (orderId: string) => {
      setPicked((prev) => {
        if (!prev.has(orderId)) return prev;
        const next = new Map(prev);
        next.delete(orderId);
        return next;
      });
      markHeld(orderId, NO_HOLD); // Phase 2b · feedback — a gone window holds nothing
    },
    [markHeld],
  );
  // The deferred write. The entry STAYS in the map, marked `committing`, for the whole round trip:
  // the card keeps its picked posture (Undo inert) until the refetch drops the bag from the queue
  // — dropping the entry first flipped the card back to a live "Picked up" for the write + poll
  // round trip on every single pick (blind pass, critical 2). A refusal or a throw drops the entry:
  // the bag is back, honestly, with the sentence beside it.
  const commitPicked = useCallback(
    async (orderId: string, subject: ExpoSubject) => {
      try {
        const res = await setTogoStatus({ orderId, to: "picked_up" });
        if (!res.ok) {
          onRefused(res, subject);
          dropPicked(orderId);
        } else await refresh(); // the poll's prune removes the entry with the bag
      } catch {
        showErr(expoFailedMsg(subject));
        dropPicked(orderId);
      }
    },
    [dropPicked, onRefused, refresh, showErr],
  );
  // The interval is re-armed when the map changes (a tap, an undo, a bag leaving) so the tick
  // always reads the live windows without a ref written during render.
  useEffect(() => {
    const id = setInterval(() => {
      const localNow = Date.now();
      setNowMs(stampNow());
      // Phase 2b · feedback — a held window's start slides by the time held (capped).
      const due = [...picked].filter(
        ([id, p]) =>
          !p.committing &&
          !pickedUndoOpen(p.at + heldFor(holdsRef.current.get(id) ?? NO_HOLD, localNow), localNow),
      );
      if (due.length === 0) return;
      setPicked((prev) => {
        const next = new Map(prev);
        for (const [orderId, p] of due) next.set(orderId, { ...p, committing: true });
        return next;
      });
      for (const [orderId, p] of due) void commitPicked(orderId, p.subject);
    }, 1000);
    return () => clearInterval(id);
  }, [picked, commitPicked, stampNow]);
  // The lane leaving with windows open (a route change, a remount) sends their writes at once —
  // the counter saw "picked up" and handed the bag over; the undo affordance is what is gone, not
  // the pick. Fire-and-forget: a server action outlives the component that called it.
  useEffect(
    () => () => {
      for (const [orderId, p] of pickedRef.current)
        if (!p.committing) void setTogoStatus({ orderId, to: "picked_up" });
    },
    [],
  );
  const onPicked = useCallback(
    (orderId: string, subject: ExpoSubject, keyboard: boolean) => {
      const at = Date.now();
      // Phase 2b · feedback — the second half of a double-tapped Undo lands on the restored
      // "Picked up" under the same finger: inside the same gesture it is refused, not a new pick.
      if (removeHeld(undoneAt.current.get(orderId) ?? null, at)) return;
      haptic("commit");
      showErr(null); // a user action replaces a standing refusal — the region must say THIS
      // A KEYBOARD pick sits on the Undo by morph (the same node — no focus event fires), so the
      // pick itself opens the slot's hold; a tap never does.
      markHeld(orderId, keyboard ? setHeld(NO_HOLD, "slot", true, at) : NO_HOLD);
      // There is ONE pill, and this pick takes it over: a keyboard hold on the pill's Undo for any
      // OTHER bag ends here — its button unmounts without a blur, which would hold that bag's window
      // to the cap.
      for (const [id, h] of holdsRef.current)
        if (id !== orderId && h.sources.has("toast")) markHeld(id, setHeld(h, "toast", false, at));
      setPicked((prev) => new Map(prev).set(orderId, { at, subject, committing: false }));
      // A scan-and-go hand-over is spoken as what its button said — "handed over", not "picked up".
      setNotice(
        subject.kind === "table"
          ? { k: "expo.live.pickedTable", vars: { id: subject.id } }
          : subject.kind === "verify"
            ? { k: "expo.live.handedOver", vars: { x: subject.x } }
            : { k: "expo.live.picked", vars: { x: subject.x } },
      );
      toastSeq.current += 1;
      setToast({ id: orderId, subject, key: toastSeq.current, phase: "open", armed: false });
    },
    [showErr, markHeld],
  );
  const onUndoPicked = useCallback(
    (orderId: string, subject: ExpoSubject): boolean => {
      const entry = picked.get(orderId);
      // Inert while the write is in flight, and for the arm after the pick: the second tap of a
      // double-tap lands here (same slot, same node) and is not a change of mind.
      if (!entry || entry.committing || !pickedUndoArmed(entry.at, Date.now())) return false;
      haptic("commit");
      showErr(null);
      dropPicked(orderId);
      undoneAt.current.set(orderId, Date.now());
      setNotice(
        subject.kind === "table"
          ? { k: "expo.live.pickedUndoneTable", vars: { id: subject.id } }
          : { k: "expo.live.pickedUndone", vars: { x: subject.x } },
      );
      return true;
    },
    [picked, dropPicked, showErr],
  );
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const onChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 400);
  }, [refresh]);

  // A4·2 — the lane's OWN channel name: the floor beside it holds "floor", and a repeated topic on
  // the singleton client returns the floor's already-subscribed channel, whose `.on()` throws.
  useFloorRealtime(true, onChange, undefined, undefined, "expo");
  // …and the lane reports its feed to the screen's help door (a report filed while frozen says so).
  useReportLive("bags", degraded ? "not_updating" : "live");

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => {
      clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  // Focus catch-all (WCAG 2.4.3; the KdsBoard pattern): a picked-up bump drops the card — restore focus
  // to the heading only when it fell to <body> from a real control (edge-triggered; poll-safe).
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Set at interaction time too (onFocusCapture on the root) — closes the blind window where the FIRST
  // bump after load lands before any snapshot has sampled focus (Codex P2).
  const hadRealFocus = useRef(false);
  const markFocus = useCallback(() => {
    hadRealFocus.current = true;
  }, []);
  useEffect(() => {
    if (document.activeElement === document.body && hadRealFocus.current)
      headingRef.current?.focus({ preventScroll: true });
    hadRealFocus.current = document.activeElement !== document.body;
  }, [snap]);

  // ── Phase 2b · feedback ── THE THUMB-ZONE UNDO. "Picked up" / "Handed over" drops the bag off the
  // guest's tracker and the wall with no reverse edge in SQL, so its only way back is the deferred
  // write's window — and the card's own slot may be mid-screen or scrolled off on a phone. The pill
  // puts that Undo where the thumb is. Phases (the pill's, derived here):
  //   showing — the pick that opened it is open (`toastPick`: never an older one);
  //   shield  — after the pill's OWN Undo, visible and inert for the same gesture (a double-tap's
  //             second half lands on something the person can see, and does nothing);
  //   leaving — the window closed (committing), a refusal dropped the pick, an in-slot Undo took it
  //             back, or the shield ended: `TOAST_LEAVE_MS` of exit, taking no taps; then gone.
  // A committing pick NEVER keeps the pill, so a write held in flight (or an outage) cannot leave a
  // dead 64px strip over the page. The pill is `live={false}`: the lane's region above already
  // speaks the pick — one voice per fact.
  const sectionRef = useRef<HTMLElement>(null);
  const toastOpen =
    toast !== null && toast.phase === "open" && toastPick(picked, toast.id) !== null;
  const toastPhase =
    toast === null ? null : toast.phase === "shield" ? "shield" : toastOpen ? "showing" : "leaving";
  const toastKey = toast?.key;
  const toastArmed = toast?.armed;
  const toastState = toast?.phase;
  // The pill's Undo arms with the card's (`PICKED_UNDO_ARM_MS` after the pick): until then it reads
  // refused, and the handler refuses too.
  useEffect(() => {
    if (toastKey === undefined || toastArmed || toastState !== "open") return;
    const id = setTimeout(
      () => setToast((t) => (t?.key === toastKey ? { ...t, armed: true } : t)),
      PICKED_UNDO_ARM_MS,
    );
    return () => clearTimeout(id);
  }, [toastKey, toastArmed, toastState]);
  useEffect(() => {
    if (toastKey === undefined || toastState !== "shield") return;
    const id = setTimeout(
      () => setToast((t) => (t?.key === toastKey ? { ...t, phase: "leave" } : t)),
      SAME_GESTURE_MS,
    );
    return () => clearTimeout(id);
  }, [toastKey, toastState]);
  useEffect(() => {
    if (toastKey === undefined || toastPhase !== "leaving") return;
    const id = setTimeout(() => {
      // A pill leaving from under keyboard focus (its window hit the hold cap and committed) must
      // not drop focus to <body> as it unmounts: the lane's heading takes it.
      if (sectionRef.current?.querySelector(".ui-toast")?.contains(document.activeElement))
        headingRef.current?.focus({ preventScroll: true });
      setToast((t) => (t?.key === toastKey ? null : t));
    }, TOAST_LEAVE_MS);
    return () => clearTimeout(id);
  }, [toastKey, toastPhase]);
  const onToastUndo = useCallback(() => {
    if (toast === null || toastPhase !== "showing") return;
    // Read BEFORE anything moves focus: a keyboard Undo scrolls its card into view, a tap does not.
    const active = document.activeElement;
    const keyboard = active instanceof HTMLElement && matchesFocusVisible(active);
    if (!onUndoPicked(toast.id, toast.subject)) return;
    setToast((t) => (t?.key === toast.key ? { ...t, phase: "shield" } : t));
    // Focus goes to the restored card slot (the same node that held Undo becomes "Picked up"), or
    // the lane's heading when the card has gone — never left to fall to <body> with the pill.
    const slot = [
      ...(sectionRef.current?.querySelectorAll<HTMLElement>("[data-expo-slot]") ?? []),
    ].find((el) => el.dataset.expoSlot === toast.id);
    (slot ?? headingRef.current)?.focus({ preventScroll: !keyboard });
    // …and that focus lands on the in-slot Undo of a window that is already gone: nothing holds it.
    markHeld(toast.id, NO_HOLD);
  }, [toast, toastPhase, onUndoPicked, markHeld]);

  const tickets = snap.tickets;
  const count = tickets.length;
  // W9d — a PURE-grocery (scan-&-go) order has nothing to bag: the shopper already holds the goods,
  // and the counter's job is to check the exit pass. Counting it as a "bag waiting" handed staff
  // phantom bagging work, so the header names the two kinds separately. Vocabulary only — the
  // status machine (mms_set_togo_status / mms_init_togo_status) is untouched.
  // Only PREPARING grocery tickets await verification — a ready one was already verified (its
  // remaining action is recording the hand-over), so counting it here would show staff a shopper
  // they just checked as still pending (Codex). Verified-not-yet-cleared tickets get their OWN
  // segment: without it, a queue of only ready grocery tickets rendered a nonzero grid under a
  // BLANK header status (both other counts zero → empty join), silencing the live region's summary
  // of remaining work (Codex round 3). Every ticket lands in exactly one of the three counts.
  const verifyCount = tickets.filter(
    (t) => t.status === "preparing" && isScanGoBasket(t.lines),
  ).length;
  const handOverCount = tickets.filter(
    (t) => t.status === "ready" && isScanGoBasket(t.lines),
  ).length;
  const bagCount = tickets.filter((t) => !isScanGoBasket(t.lines)).length;

  // What the lane's region ANNOUNCES (Codex round 1 on A4·2): the counts as they change — a bag
  // arriving or leaving is a state change a screen-reader user was hearing before this slice — and
  // the freeze, but only while the floor is live. When the floor is frozen too, its region is the
  // screen's one voice for that (the blind pass measured two regions flipping to the same frozen
  // sentence in one second) and this one falls silent. Visually hidden: the visible line below
  // draws the same facts.
  const floorState = useLiveBoardState("floor");
  const announced = degraded
    ? floorState === "not_updating"
      ? ""
      : frozenBoardCopy(lang, snap.serverNow, nowMs - degraded.since, "what.bags", degraded.cause)
    : count === 0
      ? ts(lang, "expo.none")
      : [
          bagCount > 0
            ? tf(lang, bagCount === 1 ? "expo.count.one" : "expo.count.many", { n: bagCount })
            : null,
          verifyCount > 0 ? tf(lang, "expo.count.verify", { n: verifyCount }) : null,
          handOverCount > 0 ? tf(lang, "expo.count.handOver", { n: handOverCount }) : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <section
      ref={sectionRef}
      aria-labelledby="expo-h"
      onFocusCapture={markFocus}
      className="staff-zone"
    >
      <div style={headRow}>
        {/* A4·2 — the lane's own heading, in the place the board's bar used to hold it: the
                section's `aria-labelledby` target (no echo — a chrome-pair echo would name it in
                both scripts at once) and the focus target after a picked-up bump drops a card. */}
        <h2 id="expo-h" ref={headingRef} tabIndex={-1} className="staff-zone-head">
          <Chrome lang={lang} k="expo.title" />
        </h2>
        {/* P2 — the `lang` mark is STILL conditional, and now for one reason only: `frozenBoardCopy`
              returns a flat STRING and `<OutageText>`'s passthrough arm returns a bare text node, so
              those two branches have nowhere else to carry a mark. Every other branch renders
              <Chrome>, which marks itself. (It used to be conditional because the other branches
              were English literals "until PR B converts them" — this is PR B.) */}
        {/* A4·2 — the lane's ONE live region: a bump that did not save when there is one, else the
            lane's own state, visually hidden and deduped against the floor's region (`announced`,
            above). The visible count/freeze line beneath stays plain text — one voice per fact. */}
        <p role="status" className={err ? "expo-status expo-status-warn" : "expo-status"}>
          {err !== null ? (
            // A keyed refusal arrives marked through <Chrome>; a server sentence goes through
            // <OutageText>, which swaps the one twin it owns and shows anything else verbatim — and
            // the mark rides the branch, never the region (a twin-less sentence must not be
            // announced as Burmese).
            <MsgText lang={lang} msg={err} />
          ) : notice !== null ? (
            <MsgText lang={lang} msg={notice} />
          ) : (
            <span className="sr-only" lang={lang}>
              {announced}
            </span>
          )}
        </p>
        <p
          lang={degraded ? lang : undefined}
          className={degraded ? "expo-status expo-status-warn" : "expo-status"}
        >
          {degraded ? (
            frozenBoardCopy(
              lang,
              snap.serverNow,
              nowMs - degraded.since,
              "what.bags",
              degraded.cause,
            )
          ) : count === 0 ? (
            <Chrome lang={lang} k="expo.none" />
          ) : (
            // The three counts are ELEMENTS now, not strings, so `.join(" · ")` cannot make the
            // line: the middot is rendered between the surviving segments instead. Same output,
            // same order, and each segment carries its own `lang` mark.
            [
              bagCount > 0 ? (
                <Chrome
                  key="bags"
                  lang={lang}
                  k={bagCount === 1 ? "expo.count.one" : "expo.count.many"}
                  vars={{ n: bagCount }}
                />
              ) : null,
              verifyCount > 0 ? (
                <Chrome key="verify" lang={lang} k="expo.count.verify" vars={{ n: verifyCount }} />
              ) : null,
              handOverCount > 0 ? (
                <Chrome
                  key="hand"
                  lang={lang}
                  k="expo.count.handOver"
                  vars={{ n: handOverCount }}
                />
              ) : null,
            ]
              .filter(Boolean)
              .map((seg, i) => (
                <Fragment key={i}>
                  {i > 0 ? " · " : null}
                  {seg}
                </Fragment>
              ))
          )}
        </p>
      </div>

      {count === 0 ? (
        // W10b — mid-freeze this must not read as an all-clear, nor promise bags we can't hear about.
        <EmptyState
          title={
            <Chrome lang={lang} k={degraded ? "expo.emptyFrozen" : "expo.empty"} echo="stack" />
          }
          subtitle={
            <Chrome
              lang={lang}
              k={degraded ? "expo.emptyFrozenSub" : "expo.emptySub"}
              echo="stack"
            />
          }
          icon={<Icon name="bag" size={30} style={{ color: "var(--ac)" }} />}
        />
      ) : (
        <StaggerList
          items={tickets}
          getKey={(t) => t.orderId}
          ariaLabel={sx(lang, "expo.a11y.bags")}
          style={grid}
          renderItem={(t) => (
            <ExpoCard
              ticket={t}
              nowMs={nowMs}
              picked={picked.has(t.orderId)}
              committing={picked.get(t.orderId)?.committing ?? false}
              onBumped={refresh}
              onError={showErr}
              onRefused={onRefused}
              onPicked={onPicked}
              onUndoPicked={onUndoPicked}
              onHold={hold}
            />
          )}
        />
      )}
      {/* Phase 2b · feedback — the thumb-zone Undo pill (see the phases above). Bottom-centred at
          16px + the safe area (the region's own placement; `--cta-dock-h` is 0px on staff pages). */}
      <Toast
        live={false}
        size="xl"
        shield={toastPhase === "shield"}
        leaving={toastPhase === "leaving"}
        message={
          toast === null
            ? null
            : {
                key: toast.key,
                text:
                  toast.subject.kind === "table" ? (
                    <Chrome
                      lang={lang}
                      k="expo.toast.pickedTable"
                      vars={{ id: toast.subject.id }}
                    />
                  ) : toast.subject.kind === "verify" ? (
                    <Chrome lang={lang} k="expo.toast.handedOver" vars={{ x: toast.subject.x }} />
                  ) : (
                    <Chrome lang={lang} k="expo.toast.picked" vars={{ x: toast.subject.x }} />
                  ),
                action: {
                  // The name is the visible word — no aria-label channel (it differs from the
                  // card's own "Undo — Table 7", so the two are never identical twins).
                  label: <Chrome lang={lang} k="kds.undo" />,
                  onAction: onToastUndo,
                  disabled: !toast.armed || toastPhase !== "showing",
                  onHold: (held) => hold(toast.id, "toast", held),
                },
                drainMs: PICKED_UNDO_MS,
                held: heldIds.has(toast.id),
              }
        }
      />
    </section>
  );
}

function ExpoCard({
  ticket,
  nowMs,
  picked,
  committing,
  onBumped,
  onError,
  onRefused,
  onPicked,
  onUndoPicked,
  onHold,
}: {
  ticket: ExpoTicket;
  /** Server-space now (the lane's tick + its offset) — the age clock and its tone read it. */
  nowMs: number;
  /** counter-1 — this bag's picked-up write is waiting on its undo window. */
  picked: boolean;
  /** …and the window has closed: the write is in flight, Undo is inert, the bag is leaving. */
  committing: boolean;
  onBumped: () => void | Promise<void>;
  onError: (msg: ExpoMsg | null) => void;
  onRefused: (res: { error: string; code: ExpoErrCode }, subject: ExpoSubject) => void;
  /** `keyboard` — the tap came the keyboard way (`:focus-visible`): the pick opens a slot hold. */
  onPicked: (orderId: string, subject: ExpoSubject, keyboard: boolean) => void;
  onUndoPicked: (orderId: string, subject: ExpoSubject) => boolean;
  /** Phase 2b · feedback — a keyboard user arriving on (or leaving) the in-slot Undo. */
  onHold: (orderId: string, source: HoldSource, held: boolean) => void;
}) {
  const lang = useStaffLang();
  const [pending, startTransition] = useTransition();
  const age = expoAge(ticket, nowMs);
  // The stage this card is AT, named once: it decides the next status, the button's word, the
  // button's tint and the card's own name. Four separate `=== "preparing"` tests were four chances
  // for one of them to drift.
  const firstStage = ticket.status === "preparing";
  const to = firstStage ? "ready" : "picked_up";
  // W9d — a pure-grocery (scan-&-go) order: the shopper already HOLDS the goods, so "Bagged & ready"
  // is fiction. Same two-stage status machine (untouched), mapped to the counter's two real moments:
  // check the exit pass ("Verified", preparing→ready) then record the walk-out ("Handed over",
  // ready→picked_up, drops the card). The first cut of this put "Handed over" on the FIRST bump,
  // which left a zombie second stage still counted as unverified (Codex) — each label names the
  // action its OWN tap performs. P2 — those four words are now `expo.verb.*`, rendered on the button
  // and led with by its accessible name from the SAME key, so WCAG 2.5.3 holds by construction.
  const grocery = isScanGoBasket(ticket.lines);

  // K2 + W3e call-out identity: a dine-in to-go bag calls out its real table; a pickup/scango bag
  // headlines the first name captured at checkout (short code as the collision-safe suffix), falling
  // back to the short code alone when the diner skipped the name — expo always has something to call.
  // The identifier half of the call-out — the diner's own name, else the short code. Neither is a
  // WORD, so it is the same string in both tongues and is derived once for both call-outs below.
  const whoElse = ticket.customerName ?? `#${ticket.shortCode}`;
  // The call-out for the EAR — and, since P2q closed, for the eye too: the visible header renders
  // `floor.table` through <Chrome>, the same key. `floor.table`'s `{id}` is a Latin-always slot, so
  // the tent-card number stays Latin, which is what is printed on the card. A diner's own name and
  // a short code are identifiers, not words, and pass through as given.
  const callOutAria =
    ticket.tableNumber != null
      ? tf(lang, "floor.table", { id: String(ticket.tableNumber) })
      : whoElse;
  // Who to verify (grocery accessible names): keep the NAME when we have one — an SR staffer needs
  // WHOSE exit pass to match, not just a code — with the code as the collision-safe suffix,
  // mirroring the visible header (callOut + codeSuffix).
  const verifyWho = ticket.customerName
    ? `${callOutAria} · #${ticket.shortCode}`
    : `#${ticket.shortCode}`;
  // The card's name, as a KEY picked here rather than inside the attribute: a `=== "preparing"`
  // test sitting inside a localized name reads to check-staff-lang.mjs rule 3 as authored English
  // spliced into it, which is the very defect that rule exists to catch.
  const cardNameKey = grocery
    ? firstStage
      ? "expo.a11y.cardVerify"
      : "expo.a11y.cardHandOver"
    : "expo.a11y.cardBag";
  // P2p — the SUBJECT of every sentence about this bag, as a shape: a table's number rides a
  // Latin-always `{id}` slot (its value would otherwise be the bilingual "စားပွဲ 7", which the slot
  // rule wraps whole as Latin); a name or a code is an identifier and rides `{x}` as given.
  const subject: ExpoSubject = grocery
    ? { kind: "verify", x: verifyWho }
    : ticket.tableNumber != null
      ? { kind: "table", id: ticket.tableNumber }
      : { kind: "bag", x: whoElse };

  const bump = (e: MouseEvent<HTMLButtonElement>) => {
    if (pending) return; // §17 — the handler refuses re-entry; the button is never natively disabled
    // counter-1 — the SECOND stage drops the bag off the tracker and the wall with no reverse edge:
    // it flips the card and waits on the lane's undo window instead of writing now.
    if (!firstStage) {
      onPicked(ticket.orderId, subject, matchesFocusVisible(e.currentTarget));
      return;
    }
    haptic("commit");
    onError(null);
    startTransition(async () => {
      try {
        const res = await setTogoStatus({ orderId: ticket.orderId, to });
        if (!res.ok) onRefused(res, subject);
        else await onBumped(); // pending covers the refetch — no stale-label flicker
      } catch {
        onError(expoFailedMsg(subject));
      }
    });
  };

  return (
    <article
      className="card card-textured"
      style={cardStyle}
      data-picked={picked || undefined}
      // The card's name tracks its CURRENT stage — a ready grocery ticket was already verified, so
      // announcing "Verify" for it would read the previous workflow step to an SR staffer (Codex).
      aria-label={tf(lang, cardNameKey, { x: grocery ? verifyWho : callOutAria })}
    >
      {/* counter-7 — the header carries the bag's due-ness as a tone; the text keeps its ink. */}
      <header className="expo-head" data-tone={age.tone === "ok" ? undefined : age.tone}>
        <span style={tableLabel}>
          {ticket.tableNumber != null ? (
            <Chrome lang={lang} k="floor.table" vars={{ id: String(ticket.tableNumber) }} />
          ) : (
            whoElse
          )}
          {ticket.tableNumber == null && ticket.customerName && (
            <span style={codeSuffix}> #{ticket.shortCode}</span>
          )}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--s2)" }}>
          {/* J5: the diner tapped "I'm here" on /track (qr_orders.arrived_at) — a waiting HUMAN
              outranks bag age; hand this one over first. Rendered only from the real stamp, and as
              a bordered accent chip (counter-7): it was the smallest text on the card. */}
          {ticket.arrivedAt && (
            <Badge tone="accent" bordered>
              <Chrome lang={lang} k="expo.tag.here" />
            </Badge>
          )}
          {/* A4·2 · K30 (B): the kitchen has bumped every to-go food line on this bag — bag it now.
              Advisory (derived from the cart's lines, `unknown` draws nothing), and only on a FOOD
              bag still at the first stage: a bagged one is past it, a scan-and-go basket was never
              cooked. */}
          {!grocery && firstStage && ticket.kitchen === "done" && (
            // A bordered chip, not the bare uppercase tag "Ready" wears: two facts a bagger acts on
            // differently (the wok is done → bag it · the bag is done → hand it over) do not share
            // one visual token (blind pass). Decorative — the card's name says the stage.
            <Badge tone="ok" bordered decorative>
              <Chrome lang={lang} k="expo.kitchenDone" />
            </Badge>
          )}
          {/* Grocery's ready-stage means "pass checked", not "food ready" — tag it honestly.
              counter-1: while the pick waits on its window the tag says THAT instead. */}
          {picked ? (
            <span style={readyTag} lang={lang}>
              {ts(lang, "expo.picked.pending")}
            </span>
          ) : (
            ticket.status === "ready" && (
              <span style={readyTag} lang={lang}>
                {ts(lang, grocery ? "expo.tag.verified" : "expo.tag.ready")}
              </span>
            )
          )}
          {/* counter-7 — how long this bag has been DUE (from the guest's arrival, else the slot,
              else payment): nothing before that moment, a clock after it, spoken as a sentence. */}
          {age.sinceMs > 0 && (
            <span className="expo-age">
              <span aria-hidden="true">{fmtElapsed(age.sinceMs)}</span>
              <span className="sr-only" lang={lang}>
                {spokenElapsed(lang, age.sinceMs)}
              </span>
            </span>
          )}
        </span>
      </header>
      {ticket.pickupSlot && (
        <p style={secondaryLine}>
          <Chrome lang={lang} k="expo.pickup" vars={{ t: formatSlotLong(ticket.pickupSlot) }} />
        </p>
      )}
      {/* W21 — the pickup contact the checkout REQUIRED, finally readable where it's needed: a
          tel: link so the counter phone dials in one tap. Staff-gated surface; never public. */}
      {ticket.customerPhone && (
        <p style={secondaryLine}>
          <a
            href={`tel:${ticket.customerPhone.replace(/[^0-9+]/g, "")}`}
            style={{
              color: "inherit",
              fontWeight: "var(--fw-bold)",
              minHeight: 44,
              display: "inline-block",
            }}
          >
            <span aria-hidden>☎ </span>
            {ticket.customerPhone}
          </a>
        </p>
      )}
      {/* W9d — the honest job description: the shopper already holds these items, so the counter's
          work is the exit-pass check, not bagging. */}
      {grocery && (
        <p style={secondaryLine}>
          <Chrome lang={lang} k="expo.grocery.note" vars={{ x: "Scan & Go" }} />
        </p>
      )}
      {/* `listStyle: none` strips the list semantics a screen reader would otherwise announce, so
          the role is restored explicitly — and a restored list still needs a name to be worth
          landing on. */}
      <ul role="list" aria-label={sx(lang, "expo.a11y.lines")} style={lineList}>
        {ticket.lines.map((l) => (
          <ExpoLineRow key={l.id} line={l} />
        ))}
      </ul>
      {/* P2 — the four (grocery × stage) labels are spelled out as WHOLE al() calls with LITERAL
          verb keys, and the same four keys render below through <Chrome>. A computed key would read
          as one call site to the guard and as four to the counter.

          What rule 3c proves, stated precisely because the first version of this comment overstated
          it: that each announced key is RENDERED in this element, on the same ternary branch, with
          the SAME echo. It does not read what `<Chrome>` emits. The reason the echo is part of that
          check is that an echo puts TWO strings on screen under `my`, so `al()` must compose its
          visible label through `chromeVisible(lang, key, echo)` — pass different echoes at the two
          ends and the name silently drops half the visible label (WCAG 2.5.3). The rendered text is
          pinned against that derivation in `Chrome.test.tsx`, which is the only place it can be. */}
      {picked ? (
        // counter-1 — the picked posture: the write is waiting on the window, and this is the way
        // back. Same control slot, same height; the name says what Undo undoes.
        <button
          type="button"
          data-expo-slot={ticket.orderId}
          onClick={() => onUndoPicked(ticket.orderId, subject)}
          // Phase 2b · feedback — a KEYBOARD user arriving on Undo holds the window (WCAG 2.2.1);
          // a tap's focus never does, so a touch never stalls the write.
          onFocus={(e) => {
            if (matchesFocusVisible(e.currentTarget)) onHold(ticket.orderId, "slot", true);
          }}
          onBlur={() => onHold(ticket.orderId, "slot", false)}
          aria-disabled={committing || undefined}
          aria-busy={committing || undefined}
          aria-label={al(lang, { kind: "undo", label: grocery ? verifyWho : callOutAria }).aria}
          className="staff-btn staff-press"
          style={{ ...bumpBtn, ...undoBtn }}
        >
          <Chrome lang={lang} k="kds.undo" />
        </button>
      ) : (
        <button
          type="button"
          data-expo-slot={ticket.orderId}
          onClick={bump}
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          aria-label={
            grocery
              ? firstStage
                ? al(lang, {
                    kind: "verb",
                    echo: "stack",
                    verb: "expo.verb.verified",
                    subject: verifyWho,
                  }).aria
                : al(lang, {
                    kind: "verb",
                    echo: "stack",
                    verb: "expo.verb.handedOver",
                    subject: verifyWho,
                  }).aria
              : firstStage
                ? al(lang, {
                    kind: "verb",
                    echo: "stack",
                    verb: "expo.verb.bagged",
                    subject: callOutAria,
                  }).aria
                : al(lang, {
                    kind: "verb",
                    echo: "stack",
                    verb: "expo.verb.pickedUp",
                    subject: callOutAria,
                  }).aria
          }
          className="staff-btn staff-press"
          style={{ ...bumpBtn, ...(firstStage ? readyBtn : pickedBtn) }}
        >
          {/* The label STAYS through the round trip (§17): busy is the attribute plus the dim, never
            an ellipsis that shrinks the zone under the thumb and renames the control "…". */}
          {grocery ? (
            firstStage ? (
              <Chrome lang={lang} k="expo.verb.verified" echo="stack" />
            ) : (
              <Chrome lang={lang} k="expo.verb.handedOver" echo="stack" />
            )
          ) : firstStage ? (
            <Chrome lang={lang} k="expo.verb.bagged" echo="stack" />
          ) : (
            <Chrome lang={lang} k="expo.verb.pickedUp" echo="stack" />
          )}
        </button>
      )}
    </article>
  );
}

function ExpoLineRow({ line }: { line: ExpoLine }) {
  const lang = useStaffLang();
  return (
    <li style={lineRow}>
      <span aria-hidden="true" style={qtyBadge}>
        {line.qty}×
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {/* P1 — the Burmese half of the bag line, above the English the counter already showed
            (`TicketText.tsx`, pinned by its own jsdom suite). */}
        <ExpoLineMy line={line} />
        {line.name}
        {line.modifiers.length > 0 && (
          <span style={{ color: "var(--t2)" }}> · {line.modifiers.join(" · ")}</span>
        )}
        {/* W3b: the allergy/request note rides to the bag too — pack the sauce separately, etc.
            Phase 2b: the kitchen's own note (⚠, sr prefix, each Myanmar run marked), as a <span>
            because this parent is phrasing content; the ⚠ and the warn rule replace the quotes. */}
        {line.notes && (
          <TicketNote
            as="span"
            id={`expo-note-${line.id}`}
            lang={lang}
            note={line.notes}
            className="expo-note"
          />
        )}
      </span>
      <span style={destTag} lang={lang}>
        {ts(lang, line.fulfillment === "grocery" ? "expo.dest.grocery" : "expo.dest.togo")}
      </span>
    </li>
  );
}

const headRow: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--s4)",
  // A4·2 — the lane's heading and its live region, on one baseline; the bar is the page's.
  flexWrap: "wrap",
};
const grid: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s3)",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
};
const cardStyle: CSSProperties = { padding: "var(--s4)", display: "grid", gap: "var(--s3)" };
// K27 (the counter half) — the call-out at the heading tier; the header's layout is `.expo-head`.
const tableLabel: CSSProperties = { fontWeight: "var(--fw-bold)", fontSize: "var(--fs-h2)" };
const codeSuffix: CSSProperties = {
  fontWeight: "var(--fw-bold)",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
};
// K27 — the pickup slot, the phone and the scan-and-go note at body size: read at arm's length.
const secondaryLine: CSSProperties = { margin: 0, fontSize: "var(--fs-body)", color: "var(--t2)" };
const readyTag: CSSProperties = {
  fontSize: "var(--fs-xs)",
  fontWeight: "var(--fw-heavy)",
  textTransform: "uppercase",
  letterSpacing: "var(--track-caps)",
  color: "var(--ok)",
};
const lineList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s2)",
};
const lineRow: CSSProperties = {
  display: "flex",
  // P1 — baseline, not center: with a Burmese line above the English one the label is two lines
  // tall, and the 2× badge and the destination tag belong on the FIRST line's baseline.
  alignItems: "baseline",
  gap: "var(--s2)",
  fontSize: "var(--fs-body)", // K27 — the bag line at body size, where the ticket beside it is 30px
};
const qtyBadge: CSSProperties = {
  fontWeight: "var(--fw-heavy)",
  color: "var(--ac-strong)",
  flex: "none",
};
const destTag: CSSProperties = {
  flex: "none",
  fontSize: "var(--fs-xs)",
  fontWeight: "var(--fw-bold)",
  textTransform: "uppercase",
  letterSpacing: "var(--track-caps)",
  color: "var(--t2)",
};
