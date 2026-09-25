"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { staffFireCart, staffUndoFire } from "@/lib/staff-send";
import {
  fireNotice,
  sendHoldMsg,
  undoNotice,
  type SendNotice,
  type StaffSendHold,
  type StaffSendView,
} from "@/lib/staff-send-view";
import { graceDeadlineMs, graceRemainingSec, holdResolved, undoTapHeld } from "@/lib/send-grace";
import { haptic } from "@/lib/haptics";

/**
 * Phase 2a · send — the controller behind the staff console's "Send to kitchen" (P2k).
 *
 * ⚠️ OWNED BY THE HOST, NEVER BY THE BUTTON. The send hands back a batch and a server-measured grace;
 * both live HERE, in the component that owns the table's detail (`FloorDetailLive`), because the
 * thing that renders the button is exactly what a detail refresh unmounts: the send itself zeroes
 * the "not sent" count, so the next poll swaps the slot from Send to "Everything's been sent" — and
 * a batch kept in the button's state would die with it, taking the only take-back with it. The
 * button (`StaffSendButton`) is a pure view over what this returns, which is also what lets the
 * order pad reuse the controller unchanged in 2c.
 *
 * What it owns: the phase, the batch, the client-local deadline (`lib/send-grace.ts` — the one
 * reading of the server's grace), the 250ms countdown tick (ONLY while the undo is open), the
 * same-gesture arm stamp, the in-flight guard (a REF read at tap time — LEARNINGS #126), the drain
 * before fire (a dirty note or a write in flight holds the send), and the per-device stash that lets
 * an open undo survive "← Floor" and a reload.
 *
 *   idle ──tap──▶ sending ──ok+batch──▶ undo ──tap──▶ undoing ──ok──▶ returning ──drafts back──▶ idle
 *                    │                   │ └─ grace ends ─▶ idle        │ ├─ expired/gone ─▶ idle
 *                    └─ refused/threw ─▶ idle                            │ ├─ failed ─▶ undo (window stays)
 *                                                                        └─ threw ─▶ undo (unknown; stays)
 *
 * `returning` is the post-undo hold: the control stays busy ("Bringing it back…") until a detail
 * commit shows the drafts again (the rendered Send), bounded at two commits AFTER the answer
 * (`holdResolved`), so a stale "Everything's been sent" never flashes under "Brought back — not
 * sent" — and released at once when the page's detail read degrades, since no commit will come.
 */
export type StaffSendPhase = "idle" | "sending" | "undo" | "undoing" | "returning";

/** What the slot renders, derived from the phase first and the table's view second. */
export type StaffSendDisplay =
  | { kind: "none" }
  | {
      kind: "status";
      view: Extract<StaffSendView, { kind: "allSent" | "togoAtPay" | "counterAtPay" }>;
    }
  | { kind: "send"; view: Extract<StaffSendView, { kind: "send" }> | null }
  | { kind: "undo" };

export type StaffSendController = {
  phase: StaffSendPhase;
  display: StaffSendDisplay;
  /** Whole seconds left in the undo window (0 outside it). Display only — the SQL re-checks. */
  remainingSec: number;
  onSend: () => void;
  onUndo: () => void;
  /** The one control node (Send ⇄ Undo — the SAME node, so focus stays on it across the relabel). */
  controlRef: RefObject<HTMLButtonElement | null>;
  /** The status row (all sent / to-go at pay / counter at pay), focusable with tabIndex -1. */
  statusRef: RefObject<HTMLDivElement | null>;
};

/** `sessionStorage` key for the per-device undo stash (display-only; the server re-checks). */
export const undoStashKey = (sessionId: string) => `mms-staff-undo:${sessionId}`;

type Stash = { batch: string; deadlineMs: number };

function readStash(sessionId: string): Stash | null {
  try {
    const raw = sessionStorage.getItem(undoStashKey(sessionId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Stash>;
    if (typeof p?.batch !== "string" || typeof p?.deadlineMs !== "number") return null;
    return { batch: p.batch, deadlineMs: p.deadlineMs };
  } catch {
    return null; // deliberate: an unreadable stash is a cold start
  }
}
function writeStash(sessionId: string, stash: Stash | null) {
  try {
    if (stash) sessionStorage.setItem(undoStashKey(sessionId), JSON.stringify(stash));
    else sessionStorage.removeItem(undoStashKey(sessionId));
  } catch {
    /* deliberate: storage may be unavailable — the in-memory window still runs */
  }
}

type FocusAsk = { to: "control" | "slot"; n: number };

export function useStaffSend({
  sessionId,
  view,
  detailSeq,
  degraded,
  getHold,
  rootRef,
  onNotice,
  onRefresh,
  drain,
}: {
  sessionId: string;
  /** The table's send view, from the latest detail (`staffSendView`). */
  view: StaffSendView;
  /** Bumped on every detail commit — the post-undo hold counts commits, not time. */
  detailSeq: number;
  /** The page's detail read is failing (its frozen-board line is up). No commit will arrive to end
   *  the post-undo hold, so the hold ends here instead: the busy control would otherwise strand for
   *  as long as the outage lasts, and the region's frozen-board line is the honest surface. */
  degraded: boolean;
  /** DRAIN BEFORE FIRE, read at TAP time: a dirty note on a sendable line, or a write in flight. */
  getHold: () => StaffSendHold;
  /** The order card — the note hold finds its field by `data-note-for` within it. */
  rootRef: RefObject<HTMLElement | null>;
  /** The outcome for the view's ONE region (`null` clears the last one at a new tap). */
  onNotice: (notice: SendNotice | null) => void;
  /** Re-read the detail NOW (not the 400ms debounce) so the line tags show the truth. */
  onRefresh: () => void;
  /**
   * ── Phase 2c · pad ── DRAIN the order pad's add chain before the fire: the tap is taken (the
   * control goes busy, "Sending…"), every add still in flight is awaited, and only then does the
   * send go out — so a dish tapped a beat before Send is in the round. Resolves `false` to hold the
   * fire (an add whose fate is unknown): the pad says why in its own region. The table page has no
   * add chain and passes nothing.
   */
  drain?: () => Promise<boolean>;
}): StaffSendController {
  const [phase, setPhase] = useState<StaffSendPhase>("idle");
  const [batch, setBatch] = useState<string | null>(null);
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // The detail commit the undo's ANSWER arrived on — `returning` resolves on the drafts, or two
  // commits later. Read at RESPONSE time through a ref mirrored after each commit: the tap-time value
  // would count every poll that committed while the request was on the wire — polls that began
  // before the take-back landed — and release the hold onto a stale "Everything's been sent".
  const [undoSeq, setUndoSeq] = useState(0);
  const latestSeq = useRef(detailSeq);
  useEffect(() => {
    latestSeq.current = detailSeq;
  }, [detailSeq]);
  const [focusAsk, setFocusAsk] = useState<FocusAsk | null>(null);
  const inFlight = useRef(false);
  const armedAt = useRef<number | null>(null);
  const controlRef = useRef<HTMLButtonElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);

  const ask = useCallback(
    (to: FocusAsk["to"]) => setFocusAsk((f) => ({ to, n: (f?.n ?? 0) + 1 })),
    [],
  );

  // The post-undo hold ends when the table shows the drafts again (the Send), or after two commits.
  // React's guarded set-during-render: it converges (the phase leaves `returning`).
  if (phase === "returning" && (degraded || holdResolved(view.kind, detailSeq - undoSeq))) {
    setPhase("idle");
    // Focus follows to what the slot now renders — the Send (the drafts are back) or, if a colleague
    // re-sent in between, the status row — so it never falls to <body> with the busy control.
    ask("slot");
  }

  const display: StaffSendDisplay =
    phase === "undo" || phase === "undoing" || phase === "returning"
      ? { kind: "undo" }
      : phase === "sending"
        ? { kind: "send", view: view.kind === "send" ? view : null }
        : view.kind === "send"
          ? { kind: "send", view }
          : view.kind === "none"
            ? { kind: "none" }
            : { kind: "status", view };

  // ── the same gesture: every relabel under the finger arms a 350ms hold ────────────────────────
  // Send → Undo, Undo → Send, a count that moved while a thumb was on the way down: the second half
  // of a double-tap must never land on the control that replaced the first. Not on first mount (the
  // page opening is not a relabel), and the countdown digits are not a relabel (the verb stays).
  const labelKey =
    display.kind === "send"
      ? `send:${phase}:${display.view?.units ?? 0}:${display.view?.emphasis ?? ""}`
      : display.kind === "undo"
        ? `undo:${phase}`
        : display.kind;
  const lastLabel = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (lastLabel.current !== null && lastLabel.current !== labelKey) armedAt.current = Date.now();
    lastLabel.current = labelKey;
  }, [labelKey]);

  // ── focus moves, after commit ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!focusAsk) return;
    const el =
      focusAsk.to === "control" ? controlRef.current : (controlRef.current ?? statusRef.current);
    // preventScroll: the control sits under the thumb already; nothing on the page should jump.
    el?.focus({ preventScroll: true });
  }, [focusAsk]);

  // ── the per-device stash: an open undo survives "← Floor" and a reload ───────────────────────────
  useEffect(() => {
    // Scheduled, not synchronous in the effect body (react-hooks); focus is NOT moved on a re-arm.
    const id = setTimeout(() => {
      const s = readStash(sessionId);
      if (!s) return;
      const now = Date.now();
      if (now >= s.deadlineMs) {
        writeStash(sessionId, null);
        return;
      }
      setBatch(s.batch);
      setDeadlineMs(s.deadlineMs);
      setNowMs(now);
      setPhase("undo");
    }, 0);
    return () => clearTimeout(id);
  }, [sessionId]);

  const closeWindow = useCallback(() => {
    setBatch(null);
    setDeadlineMs(null);
    writeStash(sessionId, null);
  }, [sessionId]);

  // ── the countdown: a 250ms tick ONLY while the undo is open ──────────────────────────────────────
  useEffect(() => {
    if (phase !== "undo" || deadlineMs === null) return;
    const id = setInterval(() => {
      const now = Date.now();
      if (graceRemainingSec(deadlineMs, now) > 0) {
        setNowMs(now);
        return;
      }
      // The kitchen has it now. If focus sat on the Undo, keep it in the same place — the control
      // (a Send, if a colleague added more) or the status row — without scrolling.
      const hadFocus = controlRef.current !== null && document.activeElement === controlRef.current;
      closeWindow();
      setPhase("idle");
      if (hadFocus) ask("slot");
    }, 250);
    return () => clearInterval(id);
  }, [phase, deadlineMs, closeWindow, ask]);

  const remainingSec = phase === "undo" ? graceRemainingSec(deadlineMs, nowMs) : 0;

  const onSend = useCallback(() => {
    if (inFlight.current) return;
    if (undoTapHeld(armedAt.current, Date.now())) return; // the second half of a double-tap
    if (view.kind !== "send" || view.blocked) return; // aria-disabled; the hint says why
    // The note field is found by the LINE within the order card (never by the #note- id, which the
    // order pad may re-mint), so the allergy lands before the dish.
    const focusNote = (h: StaffSendHold) => {
      if (h?.kind !== "note") return;
      Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-note-for]") ?? [])
        .find((el) => el.dataset.noteFor === h.lineId)
        ?.focus();
    };
    const hold = getHold();
    if (hold) {
      focusNote(hold); // DRAIN BEFORE FIRE
      return;
    }
    inFlight.current = true;
    haptic("commit");
    onNotice(null);
    setPhase("sending");
    void (async () => {
      try {
        if (drain) {
          if (!(await drain())) {
            setPhase("idle"); // held: the pad's region names the add it is waiting on
            return;
          }
          // ── Phase 2c · review fixes · pad2 ── the hold is read AGAIN after the drain (P3): the
          // drain can take seconds, and a kitchen note typed on a draft line meanwhile would be fired
          // past — the save after it refused by the draft-only guard, the allergy lost. The table page
          // passes no drain, so nothing awaits between its one read and its fire.
          const late = getHold();
          if (late) {
            setPhase("idle");
            focusNote(late);
            onNotice({ tone: "warn", msg: sendHoldMsg(late) });
            return;
          }
        }
        const res = await staffFireCart({ sessionId });
        if (res.ok) {
          const now = Date.now();
          const deadline = graceDeadlineMs(res, now);
          if (deadline !== null && res.undoBatch !== null) {
            setBatch(res.undoBatch);
            setDeadlineMs(deadline);
            setNowMs(now);
            setPhase("undo");
            writeStash(sessionId, { batch: res.undoBatch, deadlineMs: deadline });
            ask("control");
          } else {
            setPhase("idle"); // sent, with no window to offer (no batch or no grace)
          }
        } else {
          setPhase("idle");
        }
        onNotice(fireNotice(res));
      } catch (e) {
        // THREW or timed out — the fire may have committed. Never "couldn't send" (a blind re-send
        // cooks twice) and never an Undo (there is no batch): say so, and re-read the truth now.
        console.error("[useStaffSend] staffFireCart threw", e);
        setPhase("idle");
        onNotice({ tone: "warn", msg: { k: "table.send.err.unknown" } });
      } finally {
        inFlight.current = false;
        onRefresh();
      }
    })();
  }, [view, getHold, rootRef, sessionId, onNotice, onRefresh, ask, drain]);

  const onUndo = useCallback(() => {
    if (inFlight.current || phase !== "undo" || batch === null) return;
    if (undoTapHeld(armedAt.current, Date.now())) return; // the Send's own tap, still coming down
    if (graceRemainingSec(deadlineMs, Date.now()) <= 0) return; // the tick closes it this frame
    inFlight.current = true;
    onNotice(null);
    setPhase("undoing");
    void (async () => {
      try {
        const res = await staffUndoFire({ sessionId, batch });
        if (res.ok) {
          closeWindow();
          setUndoSeq(latestSeq.current); // the RESPONSE-time commit (see `latestSeq`)
          setPhase("returning");
        } else if (res.reason === "expired" || res.reason === "gone") {
          // The window is genuinely over: the kitchen has it (`expired`), or nothing from the batch is
          // still fired — an earlier take-back whose answer was lost already landed (`gone`). Either
          // way there is nothing left to undo. Focus stays in the slot, unscrolled.
          closeWindow();
          setPhase("idle");
          ask("slot");
        } else {
          setPhase("undo"); // the window stays open until it expires (the diner's rule)
        }
        onNotice(undoNotice(res));
      } catch (e) {
        // THREW or timed out — an UNKNOWN outcome: the take-back may have landed. Never "couldn't
        // bring it back" (that hides a dish that is no longer cooking); say we could not confirm,
        // point at the dishes (the refresh below re-reads them now), and keep the window open while
        // it lasts — a retry of a take-back that did land answers `gone`, never a second undo.
        console.error("[useStaffSend] staffUndoFire threw", e);
        if (graceRemainingSec(deadlineMs, Date.now()) > 0) {
          setPhase("undo");
        } else {
          closeWindow();
          setPhase("idle");
          ask("slot");
        }
        onNotice({ tone: "warn", msg: { k: "table.send.err.undoUnknown" } });
      } finally {
        inFlight.current = false;
        onRefresh();
      }
    })();
  }, [phase, batch, deadlineMs, sessionId, closeWindow, onNotice, onRefresh, ask]);

  return { phase, display, remainingSec, onSend, onUndo, controlRef, statusRef };
}
