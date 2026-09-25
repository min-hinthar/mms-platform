"use client";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { getTableDetail } from "@/lib/floor";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { type TableDetail, tableDisplay } from "@/lib/floor-types";
import { FloorStatusChip } from "./FloorStatusChip";
import { RelativeTime } from "./RelativeTime";
import { LiveMoney } from "./LiveMoney";
import { Badge, Icon, buttonClass } from "@mms/ui";
import { ClearTableButton } from "./ClearTableButton";
import { StaffLineEditor } from "./StaffLineEditor";
import { CashSettleButton } from "./CashSettleButton";
import { TerminalSettleButton, TerminalCollectPanel, type TerminalCollect } from "./TerminalSettle";
import { MergeTableButton } from "./MergeTableButton";
import { StaffPromoControl } from "./StaffPromoControl";
import { OpenTabButton } from "./OpenTabButton";
import { surfaceOpen } from "@/lib/surfaces";
import { CloseSecureTabButton } from "./CloseSecureTabButton";
import { useStaffLang } from "./StaffLangProvider";
import { StaffBar } from "./StaffBar";
import { Chrome, OutageText } from "./Chrome";
import { plural } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";
import type { StaffKey } from "@/lib/i18n/staff";
// ── Phase 2a · send ──
import { counterAskLive } from "@/lib/counter-pay-state";
import {
  sendHoldFrom,
  sendNoteAfterCommit,
  sendViewFact,
  staffSendView,
  type HeldSendNote,
  type SendNotice,
  type StaffLineEdit,
  type StaffSendHold,
} from "@/lib/staff-send-view";
import { StaffSendButton } from "./StaffSendButton";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { useStaffSend } from "./useStaffSend";
// ── Phase 2c · register ──
import { handoffStillCurrent, settlePrimary, type Handoff } from "@/lib/register-ui";
import { settleUnknownAfterRead } from "@/lib/register-math";
import { inFlightMsg } from "@/lib/inflight-refusal";
import { HandoffCard } from "./HandoffCard";
import type { ReaderStatus } from "./TerminalSettle";
// ── Phase 2c · gate ──
import { staffSettleBlockedByUnsent } from "@/lib/checkout-stage";
import {
  settleBlockedMsg,
  settleBlockedTarget,
  settleGateAfterCommit,
  settleGateUnits,
  type SettleGateNote,
  type SettleTrigger,
} from "@/lib/staff-send-view";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
// P2 — keys, not labels. The three modes already have dictionary entries on the floor card
// (`floor.mode.*`); this surface reads the SAME ones rather than minting a second set that could
// drift from the board a manager compares it against. `scango` stays Latin in both tongues — it is
// the product's own name, and the dictionary carries that decision with its reason.
const MODE_KEY: Record<TableDetail["mode"], StaffKey> = {
  dinein: "floor.mode.dinein",
  scango: "floor.mode.scango",
  pickup: "floor.mode.pickup",
};

/**
 * Per-table drill-down (S1.2 read · S1.3 staff write). Shows the party + the table's order, and lets
 * staff edit it FOR a guest (qty steppers, add items) and settle it in CASH. Kept live by the
 * Postgres-Changes hook scoped to this session; if the table is cleared/closed (here or elsewhere) the
 * re-fetch returns null and we return to the floor rather than showing a stale order. Writes are
 * disabled while a payment is in flight (and the server refuses regardless); the cart goes read-only
 * once settled (cartId null → paid total shown).
 */
export function FloorDetailLive({
  initial,
  sessionId,
  terminalReady = false,
  hasPin = false,
  arrivedToSend = false,
  focusSettle = false,
}: {
  initial: TableDetail;
  sessionId: string;
  /** Phase 2a · send — the add page's "Review · N not sent →" landed here (`?send=1`): focus the
   *  Send (or the status row, if a colleague sent in between), then drop the param. */
  arrivedToSend?: boolean;
  /** Phase 2c · register — the order pad's Settle landed here (`?settle=1`): focus the settle
   *  section's heading (scrolled into view — the jump is the point), then drop the param. */
  focusSettle?: boolean;
  /** P7·1b — the bar's Lock circle renders only when the caller has a PIN (server-checked). */
  hasPin?: boolean;
  /** W6c: STRIPE_TERMINAL_READER_ID is configured (server-checked by the page) — the Card settle
   *  renders. Unset = feature-off: no button, and the action refuses independently. */
  terminalReady?: boolean;
}) {
  const router = useRouter();
  // P2 — the device language, from app/staff/layout.tsx (the outage banner below speaks it).
  const lang = useStaffLang();
  const [detail, setDetail] = useState<TableDetail>(initial);
  // P3 — a NODE, not a string. `StaffPromoControl`'s refusals are bilingual (<Chrome/>), and the
  // alternative to widening this was a SECOND live region in the promo card — which the QA
  // checklist forbids and which would announce two things at once on a shared tablet. Every
  // existing caller still passes a string, and a string is a ReactNode.
  const [writeError, setWriteError] = useState<ReactNode>(null);
  // W10b — one degraded state carrying WHEN it started and WHY (see KdsBoard). Only a genuine
  // `closed` bounces back to the floor; an unreadable table is NOT a cleared one. `since` and
  // `nowMs` share the device clock, so the escalation elapsed is measured in one domain.
  const [degraded, setDegraded] = useState<StaffDegraded | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fails = useRef(0);
  const inFlight = useRef(false);
  // A refresh requested while one is in flight (see `refresh`).
  const rerun = useRef(false);
  // Every detail read takes a ticket; the committed detail's ticket rides beside it (see `sendNote`).
  const reads = useRef(0);
  const [readTicket, setReadTicket] = useState(0);
  // Phase 2c · review (R1) — the last read STARTED, for a settle refusal to mark itself with (read
  // in the refusal's handler, never during render): only a read that begins after it may settle
  // the server's figure.
  const readsStarted = useCallback(() => reads.current, []);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderHeadingRef = useRef<HTMLHeadingElement>(null);

  // Staff can write while there's an open cart and no payment in flight; once settled (cartId null) or
  // mid-payment the order goes read-only. The server enforces this too — this is just the affordance.
  // Phase 2c · register (critic finding) — a COUNTER cash settle whose response was lost (it may
  // have landed): `settleCash`'s after() closes the counter session behind a landed settle, so a
  // `closed` read while the outcome is unknown most likely means it went through. The bounce to the
  // floor is HELD (a ref the button sets through `onOutcomeUnknown`, read by `refresh`) and the page
  // says so where the settle was (`closedAfterUnknown`), instead of yanking the cashier to the floor
  // mid-sheet with the promised "the order shows paid" never shown anywhere.
  //
  // Phase 2c · review (R2) — the mark is WHEN the page learned the outcome was unknown (device ms),
  // not a bare flag, and it ends: a committed read that STARTED after the settle could last land and
  // still shows the cart open proves it never did (`settleUnknownAfterRead`, lib/register-math),
  // and a reader collect that STARTS proves it too (see `setTerminalCollect`). Before, only a later
  // answered CASH attempt cleared it, so a close hours later — cleared from another tablet, or paid
  // on the reader — was said as "the payment most likely went through".
  const settleUnknown = useRef<number | null>(null);
  const [closedAfterUnknown, setClosedAfterUnknown] = useState(false);
  const closedNoticeRef = useRef<HTMLElement>(null);
  const canWrite = detail.cartId != null && !detail.paymentInFlight && !closedAfterUnknown;
  // P2w — who holds an in-flight payment (the banner below); a missing holder is unsure, never phone.
  const payingHolder = detail.paymentHolder ?? "unsure";
  const payingMsg = inFlightMsg(payingHolder);
  const isCounter = detail.label.startsWith("reg-");
  // W6a review (confirmed HIGH): the settle handoff card must SURVIVE the settled detail state — the
  // settle button lives inside the open-cart conditional, and the realtime/poll refresh unmounts it
  // (client state included) within ~0.4-5s of the settle, mid-handoff. The card's data lives HERE.
  // Phase 2c · register — the CANONICAL shape (`Handoff`, lib/register-ui): the persisted total and
  // tip, the tender the cashier entered, whether it is a counter order, and the cart that paid (so a
  // table's card leaves when the next round's cart opens — `handoffStillCurrent`). It is never reset:
  // a stale one is simply not rendered, and the next settle overwrites it.
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  // W6c: the live reader-collect window — SAME survival rule as the handoff card (the settlement
  // freeze flips paymentInFlight, which unmounts the settle section seconds after the start),
  // PLUS reload survival: the PI handle is mirrored to sessionStorage, so a mid-collect refresh /
  // tab sleep re-attaches to the live reader charge instead of orphaning it with no Cancel and
  // misleading "guest is paying on their phone" copy (review finding).
  const [terminalCollect, setTerminalCollectState] = useState<TerminalCollect | null>(null);
  useEffect(() => {
    // setState via a scheduled callback, not synchronously in the effect (react-hooks rule).
    const id = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(`mms-terminal-collect:${sessionId}`);
        if (!raw) return;
        const parsed = JSON.parse(raw) as TerminalCollect;
        if (
          typeof parsed?.paymentIntentId === "string" &&
          parsed.paymentIntentId.startsWith("pi_") &&
          typeof parsed?.totalCents === "number"
        )
          setTerminalCollectState(parsed);
      } catch {
        /* deliberate: an unreadable stash is just a cold start */
      }
    }, 0);
    return () => clearTimeout(id);
  }, [sessionId]);
  // Phase 2c · register (P2r) — the reader panel's status, SAID through the ONE region below (the
  // panel shows it, and carries no region of its own). A STATE mirrored from the live panel, not a
  // one-shot note: no other setter clears it, and it goes when the panel goes.
  const [readerStatus, setReaderStatus] = useState<ReaderStatus | null>(null);
  const setTerminalCollect = useCallback(
    (c: TerminalCollect | null) => {
      setTerminalCollectState(c);
      if (!c) setReaderStatus(null);
      // Phase 2c · review (R2) — a reader collect STARTED: `settleCard` took the settle freeze on an
      // OPEN cart, which a landed cash settle would have paid (and which a cash settle still holding
      // its own freeze would have refused), so a lost cash settle before it can no longer land. Its
      // close is the reader's, never "the payment most likely went through".
      if (c) settleUnknown.current = null;
      try {
        if (c) sessionStorage.setItem(`mms-terminal-collect:${sessionId}`, JSON.stringify(c));
        else sessionStorage.removeItem(`mms-terminal-collect:${sessionId}`);
      } catch {
        /* deliberate: storage may be unavailable — in-memory state still drives the panel */
      }
    },
    // `setReaderStatus` is named for the React Compiler (the `setSendNote` note below): it IS stable.
    [sessionId, setReaderStatus],
  );
  // Phase 2c · review (R3) — the reader's status is a SETTER of the one region, like every other: a
  // change is the newer fact (a charge in progress, declined, landed-but-unrecorded — K15-HIGH money
  // sentences), so it clears a standing `writeError`. That refusal (a line edit, a promo) outranks
  // the settle line and nothing else ever expired it, so a screen-reader cashier who met one before
  // starting the reader never heard the reader at all. A refusal raised DURING a collect still
  // speaks, until the reader's next status.
  const onReaderStatus = useCallback((s: ReaderStatus) => {
    setReaderStatus(s);
    setWriteError(null);
  }, []);
  const handoffRef = useRef<HTMLElement>(null);
  // The webhook's counter-session close races the panel's poll: a `closed` verdict must not bounce
  // to the floor while the collect panel / handoff card IS the live surface — the cashier would
  // never see the #CODE call-out (review finding). "← Floor" is the deliberate exit. Phase 2c: a
  // COUNTER card only — a table's rows-only card does not hold the bounce (a table cleared elsewhere
  // still returns to the floor).
  const terminalFlowLive = useRef(false);
  useEffect(() => {
    terminalFlowLive.current = terminalCollect != null || handoff?.isCounter === true;
  }, [terminalCollect, handoff]);
  useEffect(() => {
    // Focus the handoff card when it appears (the settle control it replaced has unmounted).
    if (handoff) handoffRef.current?.focus();
  }, [handoff]);
  useEffect(() => {
    // The closed-after-unknown notice replaces the settle section (and the sheet inside it) — carry
    // focus to it, the way the paid card takes it.
    if (closedAfterUnknown) closedNoticeRef.current?.focus();
  }, [closedAfterUnknown]);

  // Focus catch-all (WCAG 2.4.3): ANY detail refresh can unmount the control that held focus — a line
  // removal (stepper row gone), a void/comp (row swaps to the no-controls variant), an approval request
  // (badge replaces the buttons), a tab open (OpenTabButton unmounts), or a payment starting (the whole
  // editor list swaps read-only). Instead of one narrow effect per seam (the previous shape covered only
  // the list-shrink + tab-flip cases and missed void/comp/approval), run once per detail change and
  // restore to the order heading when focus FELL to <body> — edge-triggered on "had real focus on the
  // last detail change, on <body> now", so an idle touch device (activeElement persistently <body>)
  // never gets focus planted by the 5s poll, and a control the user moved to is never yanked.
  // preventScroll: the restore is an SR/keyboard continuity cue, not a viewport jump.
  // `hadRealFocus` is set BOTH at interaction time (onFocusCapture on the root — closes the blind window
  // where the FIRST action after load lands before any snapshot has sampled focus) and re-sampled at each
  // detail commit (so a deliberate de-focus decays it and the poll can't re-plant focus forever after).
  const hadRealFocus = useRef(false);
  const markFocus = useCallback(() => {
    hadRealFocus.current = true;
  }, []);
  useEffect(() => {
    const onBody = document.activeElement === document.body;
    if (onBody && hadRealFocus.current) orderHeadingRef.current?.focus({ preventScroll: true });
    hadRealFocus.current = document.activeElement !== document.body;
  }, [detail]);

  // Phase 2a · tablet — false once the poll effect has cleaned up (unmount, or a new `refresh`). A
  // read already in the air when the server taps "+ Add items" used to land on the unmounted page
  // and, on a `closed` verdict, `router.replace` them OFF the add page they had just opened (the
  // /add yank). Every setState and router call below the await is behind this.
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    // Phase 2a (blind review) — a refresh asked for while a read is in the air is REMEMBERED, not
    // dropped: the Send's "re-read NOW" after a send or an undo usually lands mid-poll, and the poll
    // already in flight began BEFORE the write — so dropping the ask left the line tags stale for up
    // to 5s. One more read runs after the current one (never more than one queued, and never after
    // the effect cleaned up: the loop re-checks `alive`).
    if (inFlight.current) {
      rerun.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        rerun.current = false;
        // This read's ticket — committed WITH its detail (one batched render), so the send line can
        // tell a read that began after it from one already in the air (`sendNoteAfterCommit`).
        const ticket = ++reads.current;
        // Phase 2c · review (R2) — when this read STARTED (the unknown-outcome bound reads it).
        const startedAtMs = Date.now();
        try {
          // raceTimeout (W10b): a hung poll must degrade into the catch path, not freeze inFlight.
          const res = await raceTimeout(getTableDetail(sessionId));
          if (!alive.current) return;
          if (res.kind === "detail") {
            // Phase 2c · review (R2) — an open cart read after the lost settle could last land.
            settleUnknown.current = settleUnknownAfterRead(settleUnknown.current, {
              startedAtMs,
              cartOpen: res.detail.cartId != null && !res.detail.settled,
            });
            setDetail(res.detail);
            setReadTicket(ticket);
            fails.current = 0;
            setDegraded(null);
          } else if (res.kind === "closed") {
            // Genuinely closed/cleared — the detail no longer exists; go back to the floor. (The old
            // `null` also fired on OUTAGE, kicking staff off a live table's order mid-service — M32.)
            // W6c exception: the terminal webhook CLOSES a counter session moments after fulfilling —
            // bouncing now would yank the collect panel / #CODE handoff card out from under the
            // cashier before the poll ever reports it. Hold; "← Floor" is the deliberate exit.
            // Phase 2a · tablet: the floor BY NAME — a bare `/staff` resolves by the door cookie.
            // Phase 2c · register: HELD while a counter cash settle's outcome is unknown — the close
            // is then most likely that settle landing (see `settleUnknown`); the page says so.
            if (settleUnknown.current !== null) setClosedAfterUnknown(true);
            else if (!terminalFlowLive.current) {
              router.replace(STAFF_DOOR_TARGET.counter);
              router.refresh();
            }
          } else if (res.kind === "signin") {
            // An expired/invalid staff session is a verdict, not a blip — the honest surface is login.
            window.location.assign("/staff/login");
          } else {
            setNowMs(Date.now());
            setDegraded((d) => nextDegraded(d, "outage", Date.now()));
          }
        } catch (e) {
          if (!alive.current) return;
          // Cause `unknown` — this end failed, which isn't evidence the platform is down.
          fails.current += 1;
          setNowMs(Date.now());
          if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", Date.now()));
          console.error("[FloorDetailLive] refresh failed", e);
        }
      } while (rerun.current && alive.current);
    } finally {
      inFlight.current = false;
    }
  }, [sessionId, router]);

  // Slow escalation tick while frozen/stale (the ≥2min paper-flow flip needs a re-render).
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [degraded]);

  const onChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 400);
  }, [refresh]);

  useFloorRealtime(true, onChange, sessionId, detail.cartId);

  useEffect(() => {
    alive.current = true;
    const id = setInterval(refresh, 5000);
    return () => {
      alive.current = false;
      clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  // ── Phase 2a · send ── the table page's "Send to kitchen" (P2k). ─────────────────────────────────
  // The controller lives HERE, in the component that owns the detail, so the refresh that follows a
  // send (which zeroes the "not sent" count and swaps the slot) can never kill the open undo.
  const pathname = usePathname();
  const orderCardRef = useRef<HTMLElement>(null);
  // Detail commits, counted by identity (React's guarded set-during-render): the post-undo hold ends
  // on the drafts coming back, or two commits later (the first may be a poll that began before it).
  const sendView = staffSendView({
    mode: detail.mode,
    counterOrder: isCounter,
    cartOpen: detail.cartId != null && !detail.settled,
    paymentInFlight: detail.paymentInFlight,
    hostPresent: detail.hostPresent,
    counterAsk: counterAskLive(detail.counterRequestedAt),
    counts: detail.send,
  });
  // The send's line in the ONE region below. Precedence: writeError > degraded > send warn > send
  // ok — no send line, of either tone, masks the frozen-board signal (S2-audit S9: a frozen view must
  // never look live), and each setter clears the other, so a stale line never resurfaces when a
  // newer one clears. A send line also clears once the fact it speaks to is SUPERSEDED — the first
  // read that started after it fixes the slot it was said over, and a later read showing a different
  // slot (a colleague sent, the count moved) retires it (`sendNoteAfterCommit`).
  const [sendNote, setSendNote] = useState<
    ({ tone: "ok" | "warn"; msg: StaffMsg } & HeldSendNote) | null
  >(null);
  // ── Phase 2c · gate ── the settle gate (owner decision 3): computed ONCE from the detail — the
  // triggers' `blocked`, the note under them, and the region's line all read it. The same binding
  // the server refuses on (`staffSettleBlockedByUnsent` over `detail.send.sendable`).
  const settleBlocked = staffSettleBlockedByUnsent(detail.mode, detail.send.sendable);
  // Which sentence the gate says on this bill — ONE binding for the note, the region line and every
  // trigger's raced line (critic finding: a cash tap said the table's sentence under a note offering
  // removal). A card-on-file running bill — the bill whose close renders (`settlePrimary`) — offers
  // "remove them if the guest has left"; every other bill says "send them first".
  const runningClose = settlePrimary(detail.tab) === "secureTab";
  // The gate's line in the ONE region (the settle rank): raised by a refused tap or a server
  // `unsent`, cleared by every other setter, and retired by a LATER read that shows nothing unsent.
  const [settleGate, setSettleGate] = useState<SettleGateNote | null>(null);
  const [seenDetail, setSeenDetail] = useState(detail);
  const [detailSeq, setDetailSeq] = useState(0);
  if (seenDetail !== detail) {
    setSeenDetail(detail);
    setDetailSeq((n) => n + 1);
    const next = sendNoteAfterCommit(sendNote, readTicket, sendViewFact(sendView));
    if (next !== sendNote) setSendNote(next);
    // Phase 2c · gate — the settle gate's line lives while the table is blocked, and never retires
    // on a read already in the air when it was raised (`settleGateAfterCommit`).
    const gate = settleGateAfterCommit(settleGate, readTicket, settleBlocked);
    if (gate !== settleGate) setSettleGate(gate);
  }
  const onWriteError = useCallback(
    (e: ReactNode) => {
      setWriteError(e);
      setSendNote(null);
      setSettleGate(null); // Phase 2c · gate — every setter clears the others
      // `setSendNote` is named because the React Compiler cannot prove a setter stable once the render
      // body also calls it (the supersede check above); it IS stable, so this changes nothing.
    },
    [setSendNote, setSettleGate],
  );
  const onSendNotice = useCallback(
    (n: SendNotice | null) => {
      // An expired staff session is a verdict, not a blip — the honest surface is login (the poll's rule).
      if (n === "signin") {
        window.location.assign("/staff/login");
        return;
      }
      // `raisedAt` — the last read STARTED so far; only a read that starts after this line may
      // baseline it (see `sendNoteAfterCommit`). Read in a callback, never during render.
      setSendNote(n ? { ...n, raisedAt: reads.current, against: null } : null);
      if (n) setWriteError(null);
      // Phase 2c · gate — a send outcome is the newer fact ("Sent 2 items" after the jump to Send).
      if (n) setSettleGate(null);
    },
    [setSendNote, setSettleGate],
  );
  // DRAIN BEFORE FIRE — each line editor reports its unsaved note / write in flight. The REF is what
  // the Send reads at tap time; the state re-renders only when the derived hold actually changes.
  const lineEdits = useRef(new Map<string, StaffLineEdit>());
  const [sendHold, setSendHold] = useState<StaffSendHold>(null);
  const onEditState = useCallback((lineId: string, edit: StaffLineEdit | null) => {
    if (edit) lineEdits.current.set(lineId, edit);
    else lineEdits.current.delete(lineId);
    const next = sendHoldFrom([...lineEdits.current.values()]);
    setSendHold((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const getHold = useCallback(() => sendHoldFrom([...lineEdits.current.values()]), []);
  const send = useStaffSend({
    sessionId,
    view: sendView,
    detailSeq,
    degraded: degraded != null,
    getHold,
    rootRef: orderCardRef,
    onNotice: onSendNotice,
    onRefresh: refresh,
  });
  // ── Phase 2c · gate ── a refused settle tap (or a server `unsent`): say why in the ONE region, at
  // the settle rank, and take the cashier to the fix — the Send for cash or the reader; the order's
  // lines (its heading) for the running-bill close, where the guest may have left and removing comes
  // first (`settleBlockedTarget`). Scrolled into view (centred; `auto` under reduced motion), then
  // focused without a second jump. `units` is the server's own count on a raced refusal, else null.
  const onSettleBlocked = useCallback(
    (trigger: SettleTrigger, units: number | null) => {
      setSettleGate({ trigger, units, raisedAt: reads.current });
      setWriteError(null);
      setSendNote(null);
      const target =
        (settleBlockedTarget(trigger) === "send" ? send.controlRef.current : null) ??
        orderHeadingRef.current;
      const reduce =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Optional call: jsdom has no scrollIntoView (the SettledToday precedent). The Send is
      // centred (the region line sits right under it); the order heading goes to the TOP — the
      // lines to remove are BELOW it, and centring it spent half a phone screen on the card above
      // (critic finding; the root's scroll-padding keeps it clear of the sticky bar).
      target?.scrollIntoView?.({
        block: target === orderHeadingRef.current ? "start" : "center",
        behavior: reduce ? "auto" : "smooth",
      });
      target?.focus({ preventScroll: true });
    },
    [send.controlRef, setSendNote, setSettleGate],
  );
  const gateLine = settleGate
    ? settleBlockedMsg(
        settleGateUnits(settleGate, settleBlocked, detail.send.sendable),
        runningClose,
      )
    : null;

  // `?send=1` — land on the thing the link promised: the Send; the status row if a colleague sent in
  // between; otherwise the order heading. Then drop the param so a reload does not re-focus.
  // Phase 2c · register — `?settle=1` (the order pad's Settle) is the SAME arrival with a second
  // target: the settle section's heading, focused WITHOUT preventScroll (landing on it IS the jump the
  // link promised; the root's scroll-padding keeps it clear of the sticky bar). With no settle section
  // (paid, a payment in flight, nothing on the order) it falls back to the order heading.
  const settleHeadingRef = useRef<HTMLHeadingElement>(null);
  const arrival = useRef<"send" | "settle" | null>(
    focusSettle ? "settle" : arrivedToSend ? "send" : null,
  );
  useEffect(() => {
    const kind = arrival.current;
    if (!kind) return;
    arrival.current = null;
    const target =
      kind === "settle"
        ? settleHeadingRef.current
        : sendView.kind === "send"
          ? send.controlRef.current
          : sendView.kind === "none"
            ? orderHeadingRef.current
            : send.statusRef.current;
    (target ?? orderHeadingRef.current)?.focus();
    router.replace(pathname, { scroll: false });
  }, [sendView.kind, send.controlRef, send.statusRef, router, pathname]);

  return (
    <main className="staff-main" onFocusCapture={markFocus}>
      {/* P7·1b — the staff bar is the h1 and the language control (rule 4 reaches the switch
          through `StaffBar`). K2: the real table number; an unregistered/legacy sticker shows its
          raw token + flag. W6a: a register (`reg-`) session is a COUNTER ORDER, not a broken table —
          name it so, and never wave the unregistered-sticker warning at it. */}
      <StaffBar
        lang={lang}
        title={isCounter ? "floor.counter" : "floor.table"}
        titleVars={isCounter ? undefined : { id: tableDisplay(detail).text }}
        // Phase 0 — a sub-page's leading control is the way back UP (DESIGN-LANGUAGE §17), and this
        // page's own exits already promised "← Floor". It used to wear the default Screens circle,
        // so every settle hand-off left through the doors. `STAFF_DOOR_TARGET.counter` is the floor
        // WITHOUT re-dooring the tablet (the cookie is written only by a door tap).
        leading={{ kind: "back", href: STAFF_DOOR_TARGET.counter, k: "floor.back" }}
        lock={hasPin}
        live={degraded ? "not_updating" : "live"} // Phase 2b · feedback — the banner's own truth
      />
      <div className="staff-col" style={wrap}>
        <div style={header}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {!isCounter && tableDisplay(detail).unregistered && (
                // A badge is a 44px object: two scripts cannot legibly stack inside one, so no echo.
                <Badge tone="warn" bordered>
                  <Chrome lang={lang} k="table.detail.unregisteredBadge" />
                </Badge>
              )}
              <FloorStatusChip status={detail.status} lang={lang} />
              {detail.tab !== "none" && (
                // Announced (not decorative): this chip's text is the only place the tab state is named.
                // Secured = jade (affirmative, card-backed); open = accent (neutral-attention). `bordered`
                // matches the sibling FloorStatusChip; the "· card on file" suffix is the non-color cue.
                <Badge tone={detail.tab === "secure" ? "jade" : "accent"} bordered>
                  <Chrome
                    lang={lang}
                    k={detail.tab === "secure" ? "floor.tabSecured" : "table.detail.tabOpen"}
                  />
                </Badge>
              )}
            </div>
            {/* P2 — four fragments on one middot-separated line, so every one of them takes
              `echo={false}`: an English echo per fragment would double a line already at its width
              budget and the middots would stop reading as separators. The relative time beside them
              is the dictionary's too since counter-8 (`<RelativeTime>` → `time.*` through
              <Chrome>), its own marked run after the prefix. */}
            <p style={sub}>
              <Chrome lang={lang} k={MODE_KEY[detail.mode]} /> ·{" "}
              <Chrome
                lang={lang}
                k={plural(
                  detail.members.length,
                  "table.detail.guest.one",
                  "table.detail.guest.many",
                )}
                vars={{ n: detail.members.length }}
              />{" "}
              ·{" "}
              {detail.tab !== "none" && detail.tabOpenedAt ? (
                <>
                  <Chrome lang={lang} k="table.detail.tabOpened" />{" "}
                  <RelativeTime iso={detail.tabOpenedAt} serverNow={detail.serverNow} />
                </>
              ) : (
                <>
                  <Chrome lang={lang} k="table.detail.lastActivity" />{" "}
                  <RelativeTime iso={detail.lastActivityAt} serverNow={detail.serverNow} />
                </>
              )}
            </p>
          </div>
        </div>

        {/* Server-discretion gating (S3.3). Advisory only — never an auto-charge/auto-convert (T11), never
          per-customer judgment (T12). The path to secure is the diner's "Secure your tab" on /cart; staff
          check in or suggest it. Plain banners (not live regions — one view already owns aria-live). */}
        {detail.tabOverCeiling && (
          <div style={ceilingBanner}>
            <Icon name="alert" size={16} style={{ marginTop: 2 }} />
            {/* TWO keys for one sentence: it quotes TWO money figures and `{m}` fills globally, so a
              single template could not carry both. The lead-in keeps its <strong> and takes an
              inline echo (it is one short bolded clause); the advisory body stacks. Neither amount
              is recomputed — both come from `fmt()` on the server-derived cents, as before. */}
            <span>
              <strong>
                <Chrome
                  lang={lang}
                  k="table.detail.ceiling.at"
                  vars={{ m: fmt(detail.runningSubtotalCents) }}
                  echo="inline"
                />
              </strong>{" "}
              <Chrome
                lang={lang}
                k="table.detail.ceiling.past"
                vars={{ m: fmt(detail.ceilingCents) }}
                echo="stack"
              />
            </span>
          </div>
        )}
        {detail.nudgeSecure && detail.tab !== "secure" && (
          <div style={nudgeBanner}>
            <Icon name="star" size={16} style={{ marginTop: 2 }} />
            <span>
              <Chrome
                lang={lang}
                // A running bill that is ALREADY open is pointed at, never suggested again: `age`
                // only fires on one (lib/floor.ts), and `party` fires on either.
                k={
                  detail.nudgeSecure === "party"
                    ? detail.tab === "trust"
                      ? "table.detail.nudge.partyOpen"
                      : "table.detail.nudge.party"
                    : "table.detail.nudge.age"
                }
                echo="stack"
              />
            </span>
          </div>
        )}

        {/* Party */}
        <section className="card card-textured" style={sectionCard} aria-labelledby="party-h">
          {/* `echo={false}` is REQUIRED on a heading that is an aria-labelledby target: the computed
            name is the element's whole text, so an echo would name this region "အဖွဲ့ Party". */}
          <h2 id="party-h" style={sectionH}>
            <Chrome lang={lang} k="table.detail.party.title" />
          </h2>
          {detail.members.length === 0 ? (
            <p style={muted}>
              <Chrome lang={lang} k="table.detail.party.empty" echo="stack" />
            </p>
          ) : (
            <ul role="list" style={chipList} aria-label={sx(lang, "table.detail.a11y.guests")}>
              {detail.members.map((m) => (
                <li key={m.seatId} style={guestChip}>
                  {m.name}
                  {m.isHost && (
                    <span style={{ color: "var(--ac)", fontSize: "var(--fs-sm)" }}>
                      {" · "}
                      <Chrome lang={lang} k="table.detail.host" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* Host-of-record (S3.3 / T14): on a secure tab, the host who opened it is cardholder-of-record —
            the off-session close charges their saved card (or the table splits). */}
          {detail.tab === "secure" && detail.members.some((m) => m.isHost) && (
            <p style={{ ...muted, marginTop: 8, fontSize: "var(--fs-sm)" }}>
              {/* The name rides an {x} slot instead of its own <strong>, and that costs the emphasis
                deliberately: the sentence ends in a full stop that has to be Burmese on a Burmese
                console, and a terminator written as bare JSX between two elements cannot be. In
                exchange <Chrome> marks a Latin name `lang="en"`, so it keeps the body face inside
                the Burmese run instead of being typeset in Padauk. */}
              <Chrome
                lang={lang}
                k="table.detail.hostOfRecord"
                vars={{ x: detail.members.find((m) => m.isHost)?.name ?? "" }}
                echo="stack"
              />
            </p>
          )}
        </section>

        {/* Order so far */}
        <section
          ref={orderCardRef}
          className="card card-textured"
          style={sectionCard}
          aria-labelledby="order-h"
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "var(--s4)",
            }}
          >
            <h2
              id="order-h"
              ref={orderHeadingRef}
              tabIndex={-1}
              // Phase 2c · review (R4) — no inline `outline: none`: it outranked the global
              // `:focus-visible` ring on the catch-all's, `?settle=1`'s fallback and the settle
              // gate's jump target. The browser shows the ring only for keyboard-origin focus.
              style={sectionH}
            >
              {/* `echo={false}`: this heading names the region through aria-labelledby AND is the
                focus target the catch-all restores to — an echo would put both scripts in both. */}
              {/* K33 — a settled table's lines are a record of what was eaten, not a live basket. */}
              <Chrome
                lang={lang}
                k={detail.settled ? "table.detail.order.settledTitle" : "table.detail.order.title"}
              />
            </h2>
            {/* K33 — see `roundsNote`: the record is the latest round, and on a table that settled
              more than once saying nothing would let the list read as the whole meal. */}
            {detail.settled && detail.settledOrderCount > 1 && (
              <p style={{ ...muted, marginTop: 4 }}>
                <Chrome
                  lang={lang}
                  // M212 — a capped read cannot state a total, so it says "N+" instead.
                  k={
                    detail.settledOrderCountCapped
                      ? "table.detail.order.roundsNoteCapped"
                      : "table.detail.order.roundsNote"
                  }
                  vars={{ n: detail.settledOrderCount }}
                />
              </p>
            )}
            {canWrite && (
              <Link href={`/staff/table/${sessionId}/add`} style={addLink}>
                {/* Inline, not stacked: this link shares a baseline-aligned row with the heading and
                  a stacked pair would push that row to two lines. The "+" belongs to the label and
                  lives inside the dictionary value. */}
                <Chrome lang={lang} k="table.detail.addItems" echo="inline" />
              </Link>
            )}
          </div>

          {detail.lines.length === 0 ? (
            <p style={muted}>
              <Chrome lang={lang} k="table.detail.cart.empty" echo="stack" />
            </p>
          ) : canWrite ? (
            // A `role="list"` with `list-style: none` and no accessible name is a QA gap (§A): both
            // branches of this list now carry one.
            <ul
              role="list"
              style={{ listStyle: "none", margin: 0, padding: 0 }}
              aria-label={sx(lang, "table.detail.a11y.lines")}
            >
              {detail.lines.map((l) => (
                <StaffLineEditor
                  key={l.id}
                  sessionId={sessionId}
                  line={l}
                  disabled={false}
                  onError={onWriteError}
                  onEditState={onEditState}
                />
              ))}
            </ul>
          ) : (
            // Read-only (settled, or a payment in flight): show the lines without the steppers. A
            // voided/comped line is struck + badged so it reads honestly beside the (excluding) subtotal.
            <ul
              role="list"
              style={{ listStyle: "none", margin: 0, padding: 0 }}
              aria-label={sx(lang, "table.detail.a11y.lines")}
            >
              {detail.lines.map((l) => {
                const off = l.state === "voided" || l.comped;
                return (
                  <li key={l.id} style={lineRow}>
                    <span style={{ minWidth: 0, opacity: l.state === "voided" ? 0.55 : 1 }}>
                      <span style={{ fontWeight: "var(--fw-semibold)" }}>{l.qty}×</span> {l.name}
                      {/* K33 — the options the guest chose. The floor was the one staff surface that
                          never showed them, so a server reading a table back could not tell a
                          no-egg Mohinga from a plain one. Server-priced labels, rendered verbatim. */}
                      {l.modifiers.length > 0 && (
                        <span style={modsLine}>{l.modifiers.join(" · ")}</span>
                      )}
                      {/* K33 — the kitchen note, on the SAME branch as the options and for the same
                          reason. A settled table always renders here (there is no cart, so no
                          editor), and `floor.ts` fetches and preserves `notes` — so leaving it
                          unrendered dropped every allergy and request from the post-payment record
                          while the data sat right there. Found by Codex on this PR. */}
                      {l.notes && <span style={noteLine}>{l.notes}</span>}
                      {/* K33 — the line's own refund mark. A PARTIAL refund leaves
                          `qr_orders.status` at 'paid', so a refunded dish otherwise renders here at
                          full price with nothing to say the money went back. The amount rather than
                          a strike-through, following `lineRefundLabel`'s reasoning: the order-level
                          over-refund cap can clamp a refund below the line's own price, and a
                          struck line would claim the whole dish came back when part of it did. */}
                      {l.refundedCents > 0 && (
                        <span style={offBadge}>
                          {" · "}
                          <Chrome
                            lang={lang}
                            k="table.detail.line.refunded"
                            vars={{ m: fmt(l.refundedCents) }}
                          />
                        </span>
                      )}
                      {l.state === "voided" && (
                        <span style={offBadge}>
                          {" · "}
                          <Chrome lang={lang} k="table.detail.line.voided" />
                        </span>
                      )}
                      {l.comped && (
                        <span style={offBadge}>
                          {" · "}
                          <Chrome lang={lang} k="table.detail.line.comped" />
                        </span>
                      )}
                      {l.bySeatName && (
                        <span style={{ color: "var(--t3)", fontSize: "var(--fs-sm)" }}>
                          {" "}
                          · {l.bySeatName}
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                        textDecoration: off ? "line-through" : "none",
                        color: off ? "var(--t3)" : "inherit",
                      }}
                    >
                      {fmt(l.unitPriceCents * l.qty)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div style={totalRow}>
            {detail.itemCount > 0 && (
              <span>
                <span style={{ fontWeight: "var(--fw-bold)" }}>
                  <LiveMoney cents={detail.runningSubtotalCents} />
                </span>{" "}
                {/* The AMOUNT is untouched — `LiveMoney` still renders the server-derived cents. Only
                  the label speaks the device language: inline on the words, no echo on the count
                  (an echoed count would print the same number twice, once per numeral system). */}
                <span style={{ color: "var(--t2)", fontSize: "var(--fs-sm)" }}>
                  <Chrome lang={lang} k="table.detail.subtotalSoFar" echo="inline" /> ·{" "}
                  <Chrome
                    lang={lang}
                    k={plural(detail.itemCount, "table.detail.item.one", "table.detail.item.many")}
                    vars={{ n: detail.itemCount }}
                  />
                </span>
              </span>
            )}
            {detail.paidTotalCents != null &&
              (detail.refund == null || detail.refund.state === "none" ? (
                <span style={{ color: "var(--ok)", fontWeight: "var(--fw-bold)" }}>
                  <Chrome
                    lang={lang}
                    k="table.detail.paid"
                    vars={{ m: fmt(detail.paidTotalCents) }}
                  />
                </span>
              ) : (
                /* K33 — MONEY THAT CAME BACK IS NEVER "paid", and never in the success token. The
                   figures are the ONE derivation's (`summarizeRefund` in lib/refund-view.ts), not a
                   subtraction done here: `netPaidCents` already accounts for a status flip and a
                   column bump disagreeing for a beat. Attention tone rather than success, because a
                   cashier scanning this row for a number needs the state to reach them first. */
                <span style={{ color: "var(--warn)", fontWeight: "var(--fw-bold)" }}>
                  {detail.refund.state === "full" ? (
                    <Chrome
                      lang={lang}
                      k="table.detail.refunded.full"
                      vars={{ m: fmt(detail.refund.refundedCents) }}
                    />
                  ) : (
                    <Chrome
                      lang={lang}
                      k="table.detail.refunded.partial"
                      vars={{
                        m: fmt(detail.refund.netPaidCents),
                        r: fmt(detail.refund.refundedCents),
                      }}
                    />
                  )}
                </span>
              ))}
          </div>
          {/* K33 — "tax is added at settle" is a promise about a RUNNING cart. Over a settled
              record the tax was added, so the sentence is simply false there; it is suppressed
              rather than reworded, because the settled row already states the authoritative
              figure and a second caption under it would only invite a second reading. */}
          {!detail.settled && (
            <p style={{ ...muted, marginTop: 8, fontSize: "var(--fs-sm)" }}>
              <Chrome lang={lang} k="table.detail.pretaxNote" echo="stack" />
            </p>
          )}
          {/* Phase 2a · send — the slot sits between the order and its one region, so the page
              reads "send, then settle". It mounts no region of its own. */}
          <StaffSendButton
            lang={lang}
            ctl={send}
            controlRef={send.controlRef}
            statusRef={send.statusRef}
            hold={sendHold}
            hostName={detail.members.find((m) => m.isHost)?.name ?? null}
          />
          {/* One shared live region for staff line-edit feedback + the stale-poll signal (S2-audit S9): a
            frozen detail view mustn't look live. The write error takes precedence over the reconnect note. */}
          {/* P2 — EACH ARM MARKS ITS OWN SCRIPT, so the region itself carries no `lang`. The frozen-
            board copy is fully authored, and its mark sits on the span that holds it. That is why
            the old conditional suppression can go: the condition it encoded now lives inside the
            component that knows the answer.

            P2 ∩ P3 — TWO PRODUCERS SHARE THIS ONE CHANNEL and they hand over different things, so
            the arm discriminates on the value rather than assuming one shape. `StaffLineEditor`
            (and the note/qty writes) pass a SERVER STRING, deliberately unlocalized at the source:
            `<OutageText>` swaps the one sentence that has an authored Burmese twin (the write-outage
            line) and passes every other sentence through in English, verbatim — which is also why a
            `lang="my"` on this <p> would typeset those English arms in Padauk and announce them as
            Burmese. `StaffPromoControl` passes an ALREADY-LOCALIZED `<Chrome>` element, because a
            promo refusal has a dictionary key and its Burmese is authored; wrapping that in
            `OutageText` would ask a string matcher to read a React element and would strip the
            element's own script mark. Rendering the node as-is keeps that mark on the node.

            Phase 2c · register — THE VIEW'S ONLY POLITE REGION (P2r closes). The paid card is no
            longer a `role="status"` (it is focused, and its NAME carries the facts), and the reader
            panel's status line is SHOWN in the panel but SAID here. The written precedence:

              writeError > settle line > degraded > send warn > send ok

            - writeError — a line edit or promo refusal the person just caused. Every other setter
              clears it, and so does each reader status change (Phase 2c · review, R3): the reader's
              money sentences are the newer fact, never masked by a refusal from before the collect.
            - settle line — the settle gate's "send them first" warn (Phase 2c · gate: a refused
              settle tap, or a server `unsent`), rendered VISIBLY — it is the sentence beside the
              Send the tap just jumped to; else the reader's status while its collect panel is live
              (a charge in progress; its own poll reads the processor, independent of the detail
              read `degraded` describes), rendered sr-only — the panel shows the same words.
            - degraded — the frozen-board signal. It outranks EVERY send line (2a's blind review,
              2b63b65: a "Couldn't send" standing for a whole outage would hide the paper escalation
              — S9). The bar's live mark says "Not updating" regardless.
            - send warn / send ok — `sendNote`, which retires once its fact is superseded. */}
          <p
            role="status"
            style={{
              ...muted,
              marginTop: 6,
              fontSize: "var(--fs-sm)",
              // Phase 2a · send — while the slot is mounted the line is reserved, so an outcome
              // appearing never pushes the settle triggers below it.
              minHeight:
                writeError || gateLine || degraded || sendNote || send.display.kind !== "none"
                  ? 16
                  : 0,
              color:
                writeError || gateLine || degraded || sendNote?.tone === "warn"
                  ? "var(--warn)"
                  : sendNote
                    ? "var(--t2)"
                    : "var(--t3)",
            }}
          >
            {typeof writeError === "string" ? (
              <OutageText lang={lang} error={writeError} />
            ) : writeError !== null ? (
              writeError
            ) : gateLine ? (
              // Phase 2c · gate — the settle rank, SHOWN and SAID. Outranked lines stay shown,
              // unspoken: the frozen-board line below it (S9 — a frozen view never looks live).
              <>
                <MsgText lang={lang} msg={gateLine} />
                {degraded ? (
                  <span lang={lang} aria-hidden="true" style={{ display: "block" }}>
                    {frozenBoardCopy(
                      lang,
                      detail.serverNow,
                      nowMs - degraded.since,
                      "what.order",
                      degraded.cause,
                    )}
                  </span>
                ) : null}
              </>
            ) : readerStatus ? (
              <>
                <span className="sr-only">
                  <MsgText lang={lang} msg={readerStatus.msg} />
                </span>
                {/* Outranked in what is SAID, never in what is SHOWN: a frozen view must not look
                    live (S9), so the frozen line stays on screen, hidden from the reader's ears —
                    and so does a standing send line (critic finding: "Couldn't send" vanished the
                    moment a reader collect started). What is SHOWN keeps the region's own visible
                    order below the settle line: degraded, else the send line. */}
                {degraded ? (
                  <span lang={lang} aria-hidden="true">
                    {frozenBoardCopy(
                      lang,
                      detail.serverNow,
                      nowMs - degraded.since,
                      "what.order",
                      degraded.cause,
                    )}
                  </span>
                ) : sendNote ? (
                  <span aria-hidden="true">
                    <MsgText lang={lang} msg={sendNote.msg} />
                  </span>
                ) : null}
              </>
            ) : degraded ? (
              <span lang={lang}>
                {frozenBoardCopy(
                  lang,
                  detail.serverNow,
                  nowMs - degraded.since,
                  "what.order",
                  degraded.cause,
                )}
              </span>
            ) : sendNote ? (
              <MsgText lang={lang} msg={sendNote.msg} />
            ) : null}
          </p>
        </section>

        {/* Promo (P3) — after the order, BEFORE the settle: a discount is the last thing that changes
          what the guest owes, and the cashier reads it in that order. Rendered whenever there is an
          open cart, including read-only mid-payment, because "is a discount on this?" is a question
          staff need answered exactly when they cannot change it. */}
        {detail.cartId != null && (
          <StaffPromoControl
            sessionId={sessionId}
            lang={lang}
            promoCode={detail.promoCode}
            promoCents={detail.settlePromoCents}
            canWrite={canWrite}
            onError={onWriteError}
            onChanged={onChange}
          />
        )}

        {/* Open a tab (S3.1) — when there's an open cart, no tab yet, and no payment in flight. Marks the
          table so it settles once at close; moves no money. The diner can also open one from /cart. */}
        {/* A1 — the ask, above the controls that answer it. Rendered from the SAME `counterRequestedAt`
          the floor chip derives `counter` from, so the banner and the chip cannot disagree; it stays
          while a card payment holds the cart (the chip then says Paying) because the ask is still a
          fact about the table, and the settle controls below already refuse under the freeze. */}
        {detail.counterRequestedAt && detail.itemCount > 0 && (
          <section className="card card-textured" style={askCard} aria-labelledby="counter-ask-h">
            <p id="counter-ask-h" style={askTitle}>
              <Icon name="receipt" size={16} />
              <Chrome lang={lang} k="table.detail.counterAsk" echo="stack" />
            </p>
            <p style={{ ...muted, marginTop: 4 }}>
              <Chrome lang={lang} k="table.detail.counterAsked" echo={false} />{" "}
              <RelativeTime iso={detail.counterRequestedAt} serverNow={detail.serverNow} />
            </p>
          </section>
        )}
        {/* A1 — "Open a tab" is PARKED (`SURFACES.cardOnFileTabs`): a tab already open still closes
          below, but no new one is offered. */}
        {surfaceOpen("cardOnFileTabs") && canWrite && detail.tab === "none" && (
          <section
            style={{ marginTop: "var(--s4)" }}
            aria-label={sx(lang, "table.detail.a11y.openTab")}
          >
            <OpenTabButton cartId={detail.cartId!} />
          </section>
        )}

        {/* Take payment — when there's an open order with items and no payment in flight. On a trust
          tab the cash settle IS the tab close (re-framed copy); the money path is the same cash
          reconcile. Phase 2c · register: ONE primary, FIRST in the DOM (`settlePrimary` — the card on
          file on a secure running bill, cash otherwise), the reader after cash as a secondary, every
          trigger a `@mms/ui` Button (xl, block), and a heading the order pad's `?settle=1` lands on. */}
        {canWrite && detail.itemCount > 0 && detail.settleTotalCents != null && (
          <section className="staff-settle" aria-labelledby="settle-h">
            {/* `echo={false}`: an aria-labelledby target AND a focus target — both scripts in either
                would say everything twice. */}
            <h2 id="settle-h" ref={settleHeadingRef} tabIndex={-1} style={settleHeading}>
              <Chrome lang={lang} k="table.detail.settle.title" />
            </h2>
            {runningClose && (
              <CloseSecureTabButton
                sessionId={sessionId}
                totalCents={detail.settleTotalCents}
                variant="primary"
                onChanged={onChange}
                blocked={settleBlocked}
                blockedNoteId={SETTLE_UNSENT_NOTE_ID}
                onBlockedTap={(units) => onSettleBlocked("tab", units)}
                readTicket={readTicket}
                readsStarted={readsStarted}
                gateLive={settleGate !== null}
              />
            )}
            <CashSettleButton
              sessionId={sessionId}
              totalCents={detail.settleTotalCents}
              tipBaseCents={detail.settleTipBaseCents}
              intendedTipCents={detail.intendedTipCents}
              isTab={detail.tab !== "none"}
              variant={settlePrimary(detail.tab) === "cash" ? "primary" : "secondary"}
              // W6a: a counter (register) order always ends in the paid card (#CODE to call out); a
              // table gets the rows-only card when a tender was entered (owner decision 7).
              handoff={isCounter}
              onSettled={(h) => setHandoff({ ...h, isCounter, cartId: detail.cartId })}
              onChanged={onChange}
              // Only a COUNTER session closes behind its settle; a table's landed settle shows paid.
              onOutcomeUnknown={
                isCounter
                  ? (unknown) => {
                      settleUnknown.current = unknown ? Date.now() : null;
                    }
                  : undefined
              }
              blocked={settleBlocked}
              blockedNoteId={SETTLE_UNSENT_NOTE_ID}
              onBlockedTap={(units) => onSettleBlocked("cash", units)}
              running={runningClose}
              readTicket={readTicket}
              readsStarted={readsStarted}
            />
            {/* W6c: card-present on the reader — only when the reader env is configured. The collect
              window itself renders BELOW, outside this open-cart conditional (it must survive the
              freeze flipping paymentInFlight). */}
            {terminalReady && terminalCollect == null && (
              <TerminalSettleButton
                sessionId={sessionId}
                totalCents={detail.settleTotalCents}
                variant="secondary"
                onStarted={setTerminalCollect}
                blocked={settleBlocked}
                blockedNoteId={SETTLE_UNSENT_NOTE_ID}
                onBlockedTap={(units) => onSettleBlocked("reader", units)}
                running={runningClose}
                gateLive={settleGate !== null}
                onChanged={onChange}
              />
            )}
            {detail.tab === "trust" && (
              <p style={{ ...muted, fontSize: "var(--fs-sm)" }}>
                {/* W6c: with a reader configured, card-at-the-counter is the button above — don't
                  send the guest back to their phone for a payment the reader takes right here. */}
                <Chrome
                  lang={lang}
                  k={terminalReady ? "table.detail.trust.reader" : "table.detail.trust.phone"}
                  echo="stack"
                />
              </p>
            )}
            {/* Phase 2c · gate — WHY the triggers above are dimmed, before anyone taps: the section's
                LAST child (the hint pattern — it unmounts after a Send without moving a trigger),
                and the first thing each trigger's description reads. The running-bill close (the
                guest may have left) offers removing them too. Warn ink plus the words; the glyph is
                decorative. Never a live region — the page's one region speaks a refused tap. */}
            {settleBlocked && (
              <p id={SETTLE_UNSENT_NOTE_ID} className="staff-settle-unsent">
                <Icon name="alert" size={16} style={{ marginTop: 2, flex: "none" }} />
                <span>
                  <Chrome
                    lang={lang}
                    k={settleBlockedMsg(detail.send.sendable, runningClose).k}
                    vars={settleBlockedMsg(detail.send.sendable, runningClose).vars}
                    echo="stack"
                  />
                </span>
              </p>
            )}
          </section>
        )}
        {terminalCollect && (
          <TerminalCollectPanel
            sessionId={sessionId}
            collect={terminalCollect}
            isCounter={isCounter}
            onStatus={onReaderStatus}
            onChanged={onChange}
            onDone={(h) => {
              setTerminalCollect(null);
              // The reader records neither a tip nor a tender — the card is Total and #CODE.
              if (h)
                setHandoff({
                  orderId: h.orderId,
                  totalCents: h.totalCents,
                  tipCents: null,
                  tenderedCents: null,
                  isCounter: true,
                  cartId: detail.cartId,
                });
            }}
          />
        )}
        {/* Phase 2c · register (critic finding) — the counter order CLOSED while a cash settle's
            outcome was unknown: most likely it landed. Said where the settle was, focused (the
            sheet it replaced unmounted), named by its sentence; never a live region (the page has
            ONE). The way back is the paid card's own link — it promises only the navigation. */}
        {closedAfterUnknown && (
          <section
            ref={closedNoticeRef}
            tabIndex={-1}
            aria-labelledby="settle-closed-h"
            className="card card-textured staff-settle-closed"
            style={sectionCard}
          >
            {/* `echo={false}`: an aria-labelledby target — both scripts would be the name. */}
            <p id="settle-closed-h" style={{ margin: 0 }}>
              <Chrome lang={lang} k="settle.cash.unknownClosed" echo={false} />
            </p>
            <Link
              href={STAFF_DOOR_TARGET.counter}
              className={buttonClass({ variant: "primary", size: "xl", block: true })}
            >
              <Chrome lang={lang} k="table.detail.handoff.done" echo="stack" />
            </Link>
          </section>
        )}
        {/* The paid card (Phase 2c — HandoffCard, the canonical shape). Focused by the effect above,
            named by its facts; never a status region. A table's card leaves once the next round's
            cart opens (`handoffStillCurrent`). */}
        {handoff && handoffStillCurrent(handoff, detail.cartId) && (
          <HandoffCard ref={handoffRef} lang={lang} handoff={handoff} />
        )}
        {detail.paymentInFlight && terminalCollect == null && (
          <p style={{ ...muted, marginTop: "var(--s4)", fontSize: "var(--fs-sm)" }}>
            {/* Phase 2c · register (P2w, critic finding) — the banner names WHO holds the money
              (`detail.paymentHolder`, the staff refusals' own rule): a guest's phone keeps its two
              sentences; the register's own held attempt, or a holder nobody can read, says the
              SAME sentence the settle refusal says (`inFlightMsg`) — never "a guest is paying on
              their phone" over the register's own charge. A missing holder is unsure, never phone.

              The phone arm: two whole sentences, not one with a spliced clause — the differing
              phrase sits in the middle in English and at the end in Burmese, and a template with a
              hole there would have to be reordered per tongue. */}
            {payingHolder === "phone" ? (
              <Chrome
                lang={lang}
                k={
                  detail.tab !== "none"
                    ? "table.detail.payingPhone.tab"
                    : "table.detail.payingPhone.cash"
                }
                echo="stack"
              />
            ) : (
              <Chrome lang={lang} k={payingMsg.k} vars={payingMsg.vars} echo="stack" />
            )}
          </p>
        )}

        {/* Soft convergence (S1.4): fold a double-order into another table. Same gate as a write (open cart,
          not mid-payment) and only when there's something to move. */}
        {canWrite && detail.itemCount > 0 && detail.tab !== "secure" && (
          <section
            style={{ marginTop: "var(--s4)" }}
            aria-label={sx(lang, "table.detail.a11y.merge")}
          >
            <MergeTableButton
              sourceSessionId={sessionId}
              sourceLabel={tableDisplay(detail).text}
              sourceItemCount={detail.itemCount}
            />
          </section>
        )}

        <section style={{ marginTop: "var(--s5)" }}>
          <ClearTableButton
            sessionId={sessionId}
            label={tableDisplay(detail).text}
            paymentInFlight={detail.paymentInFlight}
          />
        </section>
      </div>
    </main>
  );
}

const addLink: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  textDecoration: "none",
};

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto" };
// Phase 2c · gate — the settle gate's note; every trigger's `aria-describedby` names it first.
const SETTLE_UNSENT_NOTE_ID = "settle-unsent-note";
// Phase 2c · register — the settle section's heading: the page's section-heading voice, and a focus
// target (the `?settle=1` landing). Phase 2c · review (R4): it carries NO outline of its own — an
// inline `outline: none` outranked the global `:focus-visible` ring, so a keyboard landing showed
// nothing.
const settleHeading: CSSProperties = {
  fontSize: "var(--fs-sm)",
  margin: 0,
  color: "var(--t2)",
};
// P7·1b — the staff bar is the page's header; the constants below style the content beneath it.
const header: CSSProperties = { marginBottom: "var(--s5)" };
const sub: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "6px 0 0" };
const ceilingBanner: CSSProperties = {
  display: "flex",
  gap: "var(--s2)",
  alignItems: "flex-start",
  padding: "var(--s3) var(--s4)",
  marginBottom: "var(--s4)",
  borderRadius: "var(--r-card)",
  border: "1px solid color-mix(in oklab, var(--warn) 35%, transparent)",
  background: "color-mix(in oklab, var(--warn) 9%, var(--cd))",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  lineHeight: 1.5,
};
const nudgeBanner: CSSProperties = {
  display: "flex",
  gap: "var(--s2)",
  alignItems: "flex-start",
  padding: "var(--s3) var(--s4)",
  marginBottom: "var(--s4)",
  borderRadius: "var(--r-card)",
  border: "1px solid var(--bd)",
  background: "color-mix(in oklab, var(--ac) 7%, var(--cd))",
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  lineHeight: 1.5,
};
const sectionCard: CSSProperties = { padding: "var(--s5)", marginBottom: "var(--s4)" };
const sectionH: CSSProperties = {
  fontSize: "var(--fs-sm)",
  margin: "0 0 var(--s3)",
  color: "var(--t2)",
};
// K33 — the chosen options, under the dish name: quieter than the line, never its own row.
const modsLine: CSSProperties = {
  display: "block",
  color: "var(--t3)",
  fontSize: "var(--fs-sm)",
  marginTop: 1,
};
/** K33 — the kitchen note. Its own binding rather than a reuse of `modsLine`: a note is a sentence
 *  a cook or a server reads (an allergy, a request), so it is italic to separate it from the
 *  server-priced option labels above it, which are catalog values. */
const noteLine: CSSProperties = {
  display: "block",
  color: "var(--t3)",
  fontSize: "var(--fs-sm)",
  marginTop: 1,
  fontStyle: "italic",
};
const muted: CSSProperties = { margin: 0, color: "var(--t3)", fontSize: "var(--fs-sm)" };
// A1 — the ask banner: attention tone (the same pair the Pay-at-counter chip wears), never color
// alone — the sentence carries the meaning.
const askCard: CSSProperties = {
  marginTop: "var(--s4)",
  padding: "14px 16px",
  borderColor: "var(--warn)",
  background: "var(--warnb)",
};
const askTitle: CSSProperties = {
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: "var(--fw-heavy)",
  fontSize: "var(--fs-body)",
  color: "var(--warn)",
};
const chipList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--s3)",
};
const guestChip: CSSProperties = {
  padding: "4px 12px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  fontSize: "var(--fs-sm)",
};
const lineRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  padding: "8px 0",
  borderTop: "1px solid var(--bd)",
  fontSize: "var(--fs-sm)",
};
const offBadge: CSSProperties = {
  color: "var(--t3)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
};
const totalRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  flexWrap: "wrap",
  marginTop: "var(--s3)",
  paddingTop: "var(--s3)",
  borderTop: "2px solid var(--bd)",
};
