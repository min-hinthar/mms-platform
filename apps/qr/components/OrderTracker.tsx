"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import { useOrderStatus } from "@/lib/useOrderStatus";
import { getMyOrderFallback, getSettleVerdict, type TrackFallback } from "@/lib/orders";
import { useActiveOrder } from "./ActiveOrderProvider";
import { formatClock, formatSlotLong } from "@/lib/pickupTime";
import { menuHref, menuLinkText, modeFromOrder } from "@/lib/menu-href";
import { Icon, useAnimationPreference, useInView } from "@mms/ui";
import { getRewardsProgress, type RewardsProgress } from "@/lib/rewards";
import { announceArrival } from "@/lib/arrival";
import { FeedbackPrompt } from "./FeedbackPrompt";
import { GoodbyeBeat } from "./GoodbyeBeat";
import { PaySuccess } from "./PaySuccess";
import { ReceiptActions } from "./ReceiptActions";
import { PaperAmbient } from "./PaperAmbient";
import { useConnectionTruth } from "@/lib/useConnectionTruth";
import {
  buildReceiptRows,
  dollars,
  groupReceiptLines,
  SERVICE_CHARGE_DISCLOSURE,
  serviceDisclosed,
} from "@/lib/receipt-view";
import {
  buildRefundRows,
  lineRefundLabel,
  PARTIAL_REFUND_NOTE,
  receiptStatusLabel,
} from "@/lib/refund-view";
import {
  droppedLineLabel,
  droppedNoticeHeading,
  droppedSpokenNotice,
  DROPPED_NOTICE_BODY,
  paidClaim,
  safeClaim,
  settleCanceledCopy,
  settleCanceledSpoken,
  SETTLE_CANCELED_NEXT,
  SETTLE_CANCELED_NOTE,
  type SettleCanceled,
} from "@/lib/dropped-view";
import { BRAND_ADDRESS, BRAND_PHONE_DISPLAY, BRAND_PHONE_TEL } from "@/lib/brand";
import { kindFromTrackedOrder, liveOrderStatusWord } from "@/lib/live-order";

// W22r — real step times for the rail (LA wall clock, the restaurant's TZ rule). Only REAL
// timestamps render (created_at, the expo's ready/picked-up stamps) — never an estimate.
// Lifecycle steps (verbatim v7.2). The active step is server-driven; at M1/M2 there's no kitchen
// actor, so it rests at "Order placed" — the kitchen steps light up when S2's KDS lands (same Realtime
// subscription). The pickup variant (P2.2) is chosen once the order carries a pickup_slot.
const SCANGO_STEPS: [title: string, sub: string][] = [
  ["Order placed", "We have it"],
  ["In the kitchen", "Cooking"],
  ["Ready", "Bringing it out"],
  ["Served", "Enjoy!"], // 🍵 appended decoratively (aria-hidden) → "Enjoy! 🍵", verbatim v7.2 scango
];
const PICKUP_STEPS: [title: string, sub: string][] = [
  ["Order placed", "We have it"],
  ["In the kitchen", "Cooking"],
  ["Ready for pickup", "Come on by"],
  ["Picked up", "Thank you!"],
];

/**
 * Post-payment live tracker. Subscribes (via `useOrderStatus`) to the diner's order by PaymentIntent
 * id; the order appears the moment the async webhook fulfills — no manual refresh. The timeline is
 * built to the v7.2 prototype (18px dots, 2.5px rail, accent pulse on the active step, success-green
 * when done) using design tokens only.
 */
export function OrderTracker({
  paymentIntent,
  orderId = null,
  processing,
  justPaid = false,
  awaitingCapture = false,
}: {
  paymentIntent: string | null;
  // Split-tender (M3·P3.3b) orders have no PaymentIntent on the row, so /track keys them by the
  // resolved order id instead (getSplitOrderId). Exactly one of paymentIntent/orderId is set.
  orderId?: string | null;
  processing: boolean; // redirect_status === "processing" — payment not yet captured (e.g. bank debit)
  // R7a: this mount is a FRESH successful payment (redirect_status=succeeded / split paid=1) → play the
  // one-shot pay-success celebration. False on a revisit/processing/direct-visit (no celebration).
  justPaid?: boolean;
  /**
   * W23d — this is a MANUAL-CAPTURE pickup order, so `redirect_status=succeeded` means the card was
   * AUTHORIZED, not charged (W23c). Server-derived on /track; false for every automatic-capture
   * payment, which is all of them until `PICKUP_MANUAL_CAPTURE` is on. Two jobs: it stops the
   * celebration claiming money that has not moved yet, and it is the gate on the cancellation poll
   * below — the one path where "no order yet" can turn out to mean "and there never will be one".
   */
  awaitingCapture?: boolean;
}) {
  const { order: liveOrder, timedOut } = useOrderStatus(paymentIntent, orderId);
  // W9c — the tracker's live read is browser-side, so its authorization is `is_member(session_id)`.
  // That lapses when a server clears the table or the ~4h session TTL sweeps — routinely, minutes
  // after a dine-in diner paid and while they're still sitting there. The row is fine; they just
  // can't see it. So once the live read gives up, ask the SERVER for the same order the uid-scoped
  // way (`earned_by`, stamped at fulfillment, outlives every session).
  //
  // Only after `timedOut`: the live path is better when it works (Realtime keeps the rail moving),
  // and this must not race it on the happy path.
  const [fallback, setFallback] = useState<TrackFallback | null>(null);
  useEffect(() => {
    if (!timedOut || liveOrder || fallback) return;
    let active = true;
    void getMyOrderFallback({ orderId, paymentIntent })
      .then((r) => active && setFallback(r))
      .catch(() => active && setFallback({ ok: false, reason: "error" }));
    return () => {
      active = false;
    };
  }, [timedOut, liveOrder, fallback, orderId, paymentIntent]);
  // The live order wins; the fallback fills in only where RLS has gone dark. Note the fallback is a
  // SNAPSHOT — no Realtime behind it — which is honest for a table that has already been cleared.
  const order = liveOrder ?? (fallback?.ok ? fallback.order : null);
  const staleSnapshot = !liveOrder && !!fallback?.ok;
  const sharePayer = fallback?.ok === false && fallback.reason === "share_payer";

  // ── W23d — the hold was CANCELLED, so no order exists and none ever will (registry M71) ─────────
  //
  // Every arm of the give-up card below asserts a payment: "Your payment went through", "Your
  // payment is safe — show this screen to staff and we'll match it to your payment." All of them
  // are FALSE for a cancelled authorization, and the last one is the worst thing this screen can
  // say: it sends a guest to the counter to ask about money nobody took. (This file has been burned
  // by the same assumption twice already — see the W9c paid-and-eaten note and the split-payer
  // warning below. The lesson each time was that the copy assumed the happy path's premise.)
  //
  // TWO sources, because they arrive on different clocks and the slow one is not good enough:
  //   • the ~30s fallback, which is the durable answer for a revisit or a late verdict;
  //   • a short poll while the celebration is on screen, because otherwise the diner watches
  //     confetti and "Payment confirmed" for half a minute before being told nothing was charged.
  // Gated on `awaitingCapture`, so it costs an automatic-capture diner exactly nothing.
  const [polledSettle, setPolledSettle] = useState<SettleCanceled | null>(null);
  useEffect(() => {
    // `order`, not `liveOrder`: the fallback can resolve an order too, and a poll that kept running
    // past it would be asking whether a payment that demonstrably landed was cancelled.
    if (!awaitingCapture || !paymentIntent || order || polledSettle) return;
    let active = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    // ⚠️ TWO-PHASE, AND IT DOES NOT STOP (Codex #205 P1). The first draft ran 8 ticks and quit,
    // which covers the ordinary case — the verdict lands within a couple of seconds of the tap —
    // and misses the one that matters. If the FIRST webhook delivery answers `retry` (an unreadable
    // catalog, a totals blip, a failed ledger write), Stripe redelivers on its own schedule, which
    // can be minutes. By then a capped poll has stopped AND the one-shot fallback has latched
    // `not_found`, and cancellations have no Realtime channel to wake anything — so a page left
    // open goes on saying the payment went through until the diner reloads it by hand.
    //
    // Fast while the celebration is on screen, then slow and indefinite: the read is one indexed
    // lookup by primary key, it only runs on the manual-capture path, and it stops the moment the
    // order arrives or a verdict lands. A page nobody is looking at costs two requests a minute.
    const tick = () => {
      void getSettleVerdict(paymentIntent)
        .then((r) => {
          // ONLY a decided verdict speaks. `undecided` is what a healthy in-flight capture looks
          // like, and `error` is a failed read — neither may become "you weren't charged".
          if (!active) return;
          if (r.state === "decided") setPolledSettle(r.settle);
          else schedule();
        })
        .catch(() => {
          // A failed probe is not an answer; keep the schedule rather than latching silence.
          if (active) schedule();
        });
    };
    const schedule = () => {
      timer = setTimeout(tick, ++tries <= 8 ? 4000 : 30000);
    };
    schedule();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [awaitingCapture, paymentIntent, order, polledSettle]);
  //
  // ⚠️ AN ORDER OUTRANKS A VERDICT, ALWAYS (adversarial review). `getMyOrderFallback` reads the order
  // FIRST and only consults the ledger when none is found; the poll is a bare verdict read with no
  // such ordering, and `polledSettle` is write-once — so without this guard a verdict pins "No
  // payment was taken" over a receipt for a real charge, for the life of the mount.
  //
  // And this is NOT merely a belt for the terminal-verdict rule in `manual-capture-run.ts`. That
  // rule stops a recorded cancellation from going on to capture; it cannot stop the reverse, which
  // the review traced concretely: Stripe redelivers an unanswered event after ~30s, so TWO
  // invocations can be live at once. H1 passes the `requires_capture` check and stalls; H2 runs to
  // completion, captures, and the `succeeded` webhook creates the order; H1 then resumes, finds the
  // cart no longer open, and records `cart_not_open` for the very intent that was just captured.
  // An order for this PI is proof the verdict is stale, and it is the only proof available.
  const settleCanceled: SettleCanceled | null = order
    ? null
    : (polledSettle ??
      (fallback?.ok === false && fallback.reason === "settle_canceled" ? fallback.settle : null));
  // W23d (adversarial review) — the money claim every give-up arm leads with is FALSE while a
  // manual-capture hold is only authorized. `PaySuccess` already stopped claiming otherwise, which
  // is exactly what made it a contradiction rather than a lone error: the headline said the card was
  // authorized while the banner beneath it said the payment went through. One binding, read by both
  // the visible arms and the spoken ones, so the two can never disagree again.
  const notYetCharged = awaitingCapture && !order;

  // W10c — the timed-out banner's whole vocabulary ("a moment", "refresh to check") assumes a
  // transient blip. When BOTH the live read and the uid-scoped server fallback have given up, ask
  // the one health probe whether it's us; if it is, the honest thing is not "try again" but "your
  // payment is safe, show this screen at the counter" — the diner is standing in the restaurant and
  // a human can settle it in ten seconds. Fires once the page has actually given up, never on the
  // happy path (the probe is passive by design). setState happens in the probe's async callback.
  const { truth, diagnose } = useConnectionTruth();
  const gaveUp = timedOut && !order && !!fallback;
  useEffect(() => {
    if (!gaveUp) return;
    void diagnose();
    // ⚠️ Pre-PR review — RE-diagnose on reconnect. `useConnectionTruth` resets `truth` to "unknown"
    // on every online/offline transition, and this effect's deps are both stable once `gaveUp` — so
    // one walk past a dead spot (any wifi/cell handoff) silently reverted the banner from "your
    // payment is safe" to "use the Refresh button", took the payment reference off the screen
    // mid-conversation with staff, and restored the /account link to the backend that is still down.
    // Permanently, since nothing re-ran.
    // ⚠️ Pre-merge review, round 2 — this handler ONLY re-diagnoses. An earlier attempt also cleared
    // `fallback` here to make an auto-retry promise literally true, and that was worse: `fallback`
    // being set is the whole of `gaveUp`, which gates `weDown`, `youOffline`, the payment reference
    // AND the /account-link suppression. Clearing it collapsed every escalation state for the length
    // of an unbounded server-action round-trip — on a still-down backend, exactly when the diner is
    // holding the screen out to a member of staff — and tore down this listener with it. The copy is
    // what gets corrected instead: the page offers Refresh again on reconnect, and says so.
    const again = () => void diagnose();
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [gaveUp, diagnose]);
  // Only the PLATFORM verdict escalates: a share payer's answer came FROM the server, so we're up.
  const weDown = gaveUp && truth === "we-down" && !sharePayer;
  // Pre-PR review — and the offline diner gets their OWN branch. The comment here used to claim they
  // "already have honest copy"; they did not. They fell through to "use the Refresh button to check",
  // and Refresh is `location.reload()` — which on a dead radio replaces the only proof of payment
  // they hold with the browser's offline error page.
  const youOffline = gaveUp && truth === "you-offline" && !sharePayer;
  // A human-verifiable token for staff, from data this page was handed in its own URL. The two paths
  // are NOT interchangeable and must not be printed the same way:
  //   • split (`orderId`) is the order UUID — its uppercased 6-char tail is the SAME code the expo
  //     board, the KDS, the /board TV and this page's own receipt card print, so staff can find it.
  //   • single-pay has no order id here (failing to read it is the whole premise), only Stripe's
  //     PaymentIntent. That id appears in NO staff view, and it is case-sensitive base62 — the
  //     uppercasing this used to apply made it unsearchable even in the Stripe dashboard. So it is
  //     shown verbatim and labelled as what it is: the payment, which staff reconcile in Stripe —
  //     the one system still up when ours isn't.
  const counterRef: { label: string; value: string; spellOut: boolean } | null = orderId
    ? { label: "Order reference", value: `#${orderId.slice(-6).toUpperCase()}`, spellOut: true }
    : paymentIntent
      ? { label: "Payment reference", value: paymentIntent.slice(-10), spellOut: false }
      : null;
  // Pulse the active step only while the timeline is on-screen AND motion is allowed (P5.3): a
  // box-shadow `infinite` loop shouldn't keep ticking when scrolled out of view. The ref sits on the
  // STABLE <ul>, not the moving active dot (a ref on a conditional/moving target breaks the observer).
  // J6 accepted edge: the ul is now conditional (the pure-grocery exit pass replaces it), so on the
  // ONE path where the pass swaps back to the rail mid-view (a full refund landing live) the observer
  // never re-attaches and the pulse stays off — cosmetic, and that screen has bigger problems (the
  // /track refund arm is a flagged follow-up).
  const { shouldAnimate } = useAnimationPreference();
  const { ref: timelineRef, inView } = useInView<HTMLUListElement>();
  const pulseActive = shouldAnimate && inView;
  const arrived = !!order;
  // A pickup order carries a slot → use the pickup lifecycle + echo the slot as the honest ETA (no
  // fabricated countdown). Until the order lands we don't know the mode, so default to the To-go rail.
  const isPickup = !!order?.pickupSlot;
  // W9a — a DINE-IN order (the diner is at a table). Derived from the order's own line-fulfillment
  // snapshot, not `tableNumber` (null on an unregistered sticker) and not the session (routine
  // turnover closes it minutes after payment). Before this, every dine-in diner ended their visit on
  // a screen headed "To-go" running a four-step takeaway rail that can never advance past step 1 —
  // nothing bags a dine-in plate, so `togo_status` stays null forever.
  // A registered `tableNumber` counts too: an ALL-to-go order placed at a seated table used to read
  // "To-go" in the header while the receipt card six lines below printed "Table 4". Its rail is still
  // truthful (a bag really is being made), so this only fixes the label + the back-link destination.
  const isDineIn = !!order && (order.hasDineInFood || order.tableNumber != null) && !isPickup;
  // W22b — the mode as the SERVER read defines it, for the status word only. Deliberately NOT the
  // same as `isDineIn` above: that one also counts a registered `tableNumber` (an all-to-go order
  // placed at a seated table should be HEADED "Table 4"), while the status word must match what the
  // tray, /account "Today" and the header chip say about the very same order — and those read
  // `getMyLiveOrders`, which keys on the line-fulfillment snapshot alone.
  const trackedKind = order
    ? kindFromTrackedOrder(order)
    : ("togo" as ReturnType<typeof kindFromTrackedOrder>);
  const STEPS = isPickup ? PICKUP_STEPS : SCANGO_STEPS;
  // Takeaway fulfillment status (S4.3a, expo-driven) — declared here because the countdown below and
  // the step rail both key off it.
  const togo = order?.togoStatus ?? null;
  // J3: the pickup wait gets an HONEST countdown — pure arithmetic on the diner's own chosen slot (a
  // real commitment, not a kitchen estimate). Re-derived every 30s via a tick; phrased "~in N min" and
  // capped at "any minute now" once due (never a fabricated kitchen claim); dropped entirely once the
  // expo marks it ready/picked up (the rail is the truth from there).
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isPickup || !order?.pickupSlot || togo === "ready" || togo === "picked_up") return;
    const t = window.setInterval(() => setNowTick(Date.now()), 30 * 1000);
    return () => window.clearInterval(t);
  }, [isPickup, order?.pickupSlot, togo]);
  const slotCountdown = (() => {
    if (!isPickup || !order?.pickupSlot || togo === "ready" || togo === "picked_up") return null;
    const mins = Math.round((new Date(order.pickupSlot).getTime() - nowTick) / 60000);
    if (mins > 90) return null; // far-out slots: the absolute time says it better than a big number
    // Long past the slot with still no "ready" tap (kitchen running late, or an order that never
    // progressed): an eternal "any minute now" is a claim we can't keep — drop the suffix and let the
    // absolute slot time stand alone, honestly.
    if (mins < -15) return null;
    return mins >= 1 ? `in ~${mins} min` : "any minute now";
  })();
  const eta =
    isPickup && order?.pickupSlot && order.status !== "refunded"
      ? `Ready ${formatSlotLong(order.pickupSlot)}${slotCountdown ? ` · ${slotCountdown}` : ""}`
      : null;
  // Active step: until the order lands, nothing pulses (-1). Once it lands, `togo` lights the rail —
  // preparing→"In the kitchen", ready→"Ready (for pickup)", picked_up→done. An order with NO takeaway
  // portion (pure dine-in, togoStatus null) rests at "Order placed" (the diner's at the table; the rail
  // isn't their surface). Don't gate on the URL `processing` param — it doesn't track bank-settlement,
  // so a stale ?redirect_status=processing still renders right.
  const activeStep = !arrived
    ? -1
    : togo === "picked_up"
      ? 3
      : togo === "ready"
        ? 2
        : togo === "preparing"
          ? 1
          : 0;
  // W22r — REAL per-step timestamps, aligned to the 4 steps. Step 1 ("In the kitchen") has no
  // honest clock — the webhook's init isn't a cooking-start — so it stays bare; fabricating one
  // is exactly what the honesty doctrine forbids. Rendered only once the step is reached.
  const stepTimes: (string | null)[] = arrived
    ? [order.createdAt, null, order.togoReadyAt, order.togoPickedUpAt]
    : [null, null, null, null];
  // J6 — a PURE grocery basket (self-scanned, already in the diner's hands at payment): the kitchen
  // rail would be false theater ("In the kitchen · Cooking" for a jar of pickled tea), so the tracker
  // swaps it for an EXIT PASS — paid ✓, the short order code staff can glance, done. Mixed orders
  // (grocery + to-go food) keep the rail: a bag really is being made. Guards: `status === "paid"`
  // (a fully-refunded order must never show an affirmative pass — the refund UPDATE re-fires this
  // subscription live; partial refunds keep status='paid'), and the READY card below is suppressed
  // for the pass (the expo still tracks a grocery-only "bag" until staff bump it — a diner told
  // "you're all set" must not also read "grab it from the counter" when that bump lands).
  const pureGrocery =
    arrived && order.status === "paid" && order.hasGrocery && !order.hasTogoFood && !isPickup;
  // W1c — the /track refund arm (the flagged follow-up): a FULLY refunded order (charge.refunded
  // webhook flips status once every cent is back) gets an honest terminal state instead of a step
  // rail claiming the kitchen's still on it. Partial refunds keep status='paid' and stay on the
  // rail — surfacing per-line refunds to the diner needs a diner-safe read of the manager-read
  // mms_refunds ledger (tracked follow-up, PRODUCTION_PLAN W2e).
  const refunded = arrived && order.status === "refunded";
  // W9a — a settled DINE-IN table with no takeaway portion. Nothing is bagged for them and nothing
  // will ever bump `togo_status`, so the takeaway rail is structurally frozen at step 1: it promised
  // "status updates as the kitchen works on it" and then never moved again. Show the true terminal
  // state instead. A table that also bought groceries keeps the exit pass above (that bag really does
  // leave the building); a table with a to-go box keeps the rail (that bag really is being made).
  // W9a — where "back to ordering" goes for THIS order (see lib/menu-href.ts). Null until the order
  // lands, which routes to the door picker rather than guessing a mode.
  const backMode = order ? modeFromOrder(order) : null;
  const dineInSettled =
    arrived && order.status === "paid" && isDineIn && !order.hasTogoFood && !pureGrocery;
  const ready = arrived && togo === "ready" && !pureGrocery && !refunded;

  // J5 — the pickup "I'm here" ping (deferred from J3 to the migration window; qr_orders.arrived_at
  // now exists). Server truth (order.arrivedAt, refreshed by the stamping UPDATE's realtime event) OR
  // the local just-tapped flag — the optimistic arm covers a dropped websocket so a successful tap
  // never looks ignored. Idempotent server-side; pickup-only (a scan&go diner is already in the room).
  const [arriveBusy, setArriveBusy] = useState(false);
  const [arrivedLocal, setArrivedLocal] = useState(false);
  const [arriveErr, setArriveErr] = useState<string | null>(null);
  const announced = !!order?.arrivedAt || arrivedLocal;
  // The focused "I'm here" button unmounts in favour of the confirmation — park focus on the ready
  // card so a keyboard/SR user keeps their place (focus-on-remove rule, WCAG 2.4.3). Keyed to
  // `arrivedLocal` (THIS device's tap), not `announced`: a revisit whose order loads with arrivedAt
  // already set must not have its reading position yanked to a mid-page card on mount.
  const readyCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (arrivedLocal && document.activeElement === document.body)
      readyCardRef.current?.focus({ preventScroll: true });
  }, [arrivedLocal]);
  async function imHere() {
    if (!order || arriveBusy || announced) return;
    setArriveBusy(true);
    setArriveErr(null);
    try {
      const res = await announceArrival({ orderId: order.id });
      if (res.ok) setArrivedLocal(true);
      else setArriveErr(res.error);
    } catch {
      setArriveErr("Couldn’t let the counter know — try again.");
    } finally {
      setArriveBusy(false);
    }
  }

  // The persistent header/homepage pill no longer tracks the order while on /track (one realtime channel
  // per route), so retire the resumable order here the moment IT reaches a terminal state — otherwise a
  // completed order would briefly re-show as a "Confirming" pill on the next navigation before self-healing.
  // clearOrder defers its setState (rAF) → lint-safe.
  const { clearOrder } = useActiveOrder();
  const orderDone =
    togo === "picked_up" ||
    order?.status === "refunded" ||
    order?.status === "failed" ||
    // W23d — a cancelled hold is terminal in the strongest sense: there is no order row at all, so
    // the W22b live-order chip would otherwise go on advertising an in-flight order that does not
    // exist, on every subsequent navigation.
    !!settleCanceled;
  useEffect(() => {
    if (orderDone) clearOrder();
  }, [orderDone, clearOrder]);

  // R8: the REAL loyalty earn for this order. `getRewardsProgress(orderId)` server-checks whether THIS order
  // is attributed to the viewer (`earned_by === auth.uid()`), so a split-tender share-payer who isn't the
  // stamped earner (only the host is) never sees a Star they didn't get; no session → null → no claim.
  // Retires R7a's placeholder `gems = round(total)` for the real per-order +1 Star + the honest milestone clause.
  //
  // POLL-until-attributed: the webhook makes the paid order VISIBLE (mms_fulfill_order) slightly BEFORE it
  // stamps `earned_by` + recomputes Stars (separate awaited calls) — so a first read the instant the order
  // surfaces can land in that gap (earnedThisOrder=false / stale). We retry (bounded) until this order is
  // attributed, keeping the latest snapshot, then stop; a genuine non-earner / no-session settles at the cap
  // without looping. Fixes the one-shot guard that would otherwise strand a real earner with no Star pill.
  const [progress, setProgress] = useState<RewardsProgress | null>(null);
  const resolvedOrderId = order?.id ?? null; // the landed order's id (distinct from the `orderId` split prop)
  const progressDone = useRef(false);
  const progressTries = useRef(0);
  useEffect(() => {
    if (!justPaid || !resolvedOrderId || progressDone.current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const MAX_TRIES = 5; // ~6s of coverage at 1.2s spacing — comfortably past the earn-stamp gap
    const poll = () => {
      progressTries.current += 1;
      // Deliberate read-only swallow: a transient failure just drops the milestone caption (the order flow
      // is unaffected) rather than surfacing an error toast on a success screen.
      getRewardsProgress(resolvedOrderId)
        .then((p) => {
          if (cancelled) return;
          if (p) setProgress(p); // keep the latest snapshot even before attribution lands
          if (p?.earnedThisOrder || progressTries.current >= MAX_TRIES) progressDone.current = true;
          else timer = setTimeout(poll, 1200);
        })
        .catch(() => {
          if (cancelled) return;
          if (progressTries.current >= MAX_TRIES) progressDone.current = true;
          else timer = setTimeout(poll, 1200);
        });
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [justPaid, resolvedOrderId]);
  const starsEarned = progress?.earnedThisOrder ? 1 : 0;
  // W9a — name the channel the diner is actually in. `Table 4` when the sticker is registered;
  // plain "Dine-in" when it isn't (never a fabricated table number).
  const modeLabel = isPickup
    ? "Pickup"
    : isDineIn
      ? order && order.tableNumber != null
        ? `Table ${order.tableNumber}`
        : "Dine-in"
      : "To-go";
  const statusChip = (
    // `.vt-order-status` (J1): the header order pill morphs into THIS chip on the pill→/track cut —
    // the status the diner tapped lands as the status they're now watching. Rendered once per branch
    // (celebration vs regular are exclusive), so the view-transition name is unique in the document.
    <span
      className="vt-order-status"
      style={{
        ...chip,
        background: refunded ? "var(--warnb)" : arrived ? "var(--okb)" : "var(--sf)",
        color: refunded ? "var(--warn)" : arrived ? "var(--ok)" : "var(--t2)",
      }}
    >
      {/* W22b — the payment-state branches stay local (they are about the CHARGE, which
          `liveOrderStatusWord` knows nothing about); the fulfillment word comes from the ONE shared
          derivation. Before this, /track said "Order received" while the header pill said "Preparing"
          about the same `togo_status`, and the two elements MORPH into each other on the pill→/track
          cut, so the transition cross-faded contradictory claims. It also silently said "Ready for
          pickup" over a pure GROCERY basket, which has no pickup counter and no wait. */}
      {refunded
        ? "Refunded"
        : arrived
          ? liveOrderStatusWord({
              kind: trackedKind,
              togoStatus: togo,
              hasTogoFood: !!order?.hasTogoFood,
            })
          : processing
            ? "Confirming payment"
            : "Confirming order"}
    </span>
  );

  return (
    // W22a — the paper ambient behind the tracker (no isolation: the page ground lives on
    // <html>, so the fixed z:-1 layer is visible without trapping the confetti/celebrations).
    <main style={{ padding: "24px 20px 40px", maxWidth: "var(--w-content)", margin: "0 auto" }}>
      <PaperAmbient />
      {settleCanceled ? null : justPaid ? (
        // Fresh successful payment → the celebration is the headline (one <h1>); the mode + status + ETA
        // ride a compact row below it, and the timeline follows.
        //
        // W23d — `!settleCanceled`: the celebration is the loudest claim on the page, and a hold
        // that was cancelled has nothing to celebrate. The terminal card below becomes the headline
        // instead.
        <>
          <PaySuccess
            isUpgraded={progress?.isUpgraded ?? false}
            starsEarned={starsEarned}
            ordersToNext={progress?.ordersToNext ?? null}
            stars={progress?.stars ?? null}
            milestoneStep={progress?.milestoneStep ?? null}
            // W23d — under manual capture `redirect_status=succeeded` means AUTHORIZED, not charged
            // (W23c): the capture happens a beat later, from the webhook. Until the order lands,
            // "Paid — thank you!" is a claim about money that has not moved. Only until then: once
            // the order exists it really was captured, and the celebration is true again.
            awaitingCapture={awaitingCapture && !order}
          />
          <div className="track-statusrow">
            <div className="eyebrow">
              {modeLabel}
              {eta ? ` · ${eta}` : ""}
            </div>
            {statusChip}
          </div>
        </>
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div>
            <div className="eyebrow">{modeLabel}</div>
            <h1 style={{ fontSize: "var(--fs-h1)", margin: "2px 0 0" }}>Your order</h1>
            {eta && (
              <div
                style={{
                  marginTop: 6,
                  fontWeight: 800,
                  color: "var(--ac)",
                  fontSize: "var(--fs-sm)",
                }}
              >
                {eta}
              </div>
            )}
          </div>
          {statusChip}
        </div>
      )}

      {/* Single live region: role="status" already implies aria-live=polite (ARIA 1.2). The
          timedOut arm makes the text CHANGE when polling gives up, so AT announces the recovery. */}
      <p role="status" style={srOnly}>
        {settleCanceled
          ? // W23d — FIRST in the chain, deliberately. Without an order row every predicate below is
            // false, so this state used to fall through to `justPaid`'s "Payment confirmed —
            // finalizing your order" or to the timed-out arms' "your payment is safe". A screen
            // reader user was told the payment was fine in exactly the case where it was cancelled.
            settleCanceledSpoken(settleCanceled)
          : refunded
            ? "This order was refunded — the amount returns to your original payment method, typically within five to ten business days."
            : pureGrocery
              ? "Paid — you’re all set. Show your exit pass on the way out if asked."
              : dineInSettled
                ? "Paid in full — your table is settled."
                : arriveErr && ready
                  ? arriveErr
                  : ready
                    ? announced
                      ? "The counter knows you’re here — hang tight."
                      : "Your order is ready for pickup — grab it before you go."
                    : arrived
                      ? togo === "picked_up"
                        ? "Order picked up — enjoy!"
                        : togo === "preparing"
                          ? "Your order is being prepared."
                          : "Payment confirmed — your order is in."
                      : timedOut
                        ? sharePayer
                          ? "Your share is paid. The table’s bill is recorded under whoever started the split — details below."
                          : weDown
                            ? // W10c — the escalation is announced too. The reference itself is spelled
                              // out character by character in its own sr-only sibling below.
                              `We’re having trouble on our end. ${safeClaim(notYetCharged)} — show this screen to staff and we’ll match it up.`
                            : youOffline
                              ? `You look offline. ${paidClaim(notYetCharged)} — reconnect and you can check again from this screen.`
                              : "Your order is taking longer than expected — use the Refresh button to check."
                        : justPaid
                          ? notYetCharged
                            ? // W23d — under manual capture this beat is an AUTHORIZATION, and the
                              // headline beside it now says so. Announcing "Payment confirmed" here
                              // put the screen's two money claims in direct contradiction.
                              "Card authorized — we’re confirming your order."
                            : "Payment confirmed — finalizing your order."
                          : processing
                            ? "Confirming your payment."
                            : "Confirming your order."}
        {/* W23d — the partial fact, spoken. The visible notice lives on the receipt slip below,
            which is a visual artifact; without this a screen-reader user is told "your order is in"
            and never learns the basket changed. A second child of the SAME region, so the view
            still has exactly one live region (QA-CHECKLIST §A). */}
        {order ? droppedSpokenNotice(order.dropped) : ""}
      </p>

      {/* J6 — the exit pass replaces the step rail for a pure grocery basket: nothing is cooking and
          nothing is being bagged for them (they bagged it) — the only real state is PAID, so show it
          big enough to flash on the way out. The code is the same uuid-tail short reference the
          account history prints; every figure is the real order row. Not a live region — the single
          role="status" above already announced the paid state. */}
      {settleCanceled ? (
        // ── W23d — the cancelled-hold arm (registry M71) ──────────────────────────────────────────
        //
        // A terminal card in place of the rail, for the same reason W1c's refund arm is one: the
        // rail promises "status updates as the kitchen works on it", and here there is no order for
        // the kitchen to work on and never will be. It carries the page's single <h1> (the header
        // block above renders nothing in this state) and it is NOT a live region — the one
        // role="status" above already announced the whole verdict via settleCanceledSpoken.
        <section
          className="card card-textured mms-rise"
          style={{ marginTop: 8, padding: "18px 16px", borderLeft: "3px solid var(--warn)" }}
        >
          <p className="eyebrow" style={{ color: "var(--warn)", margin: 0 }}>
            Payment cancelled
          </p>
          <h1 style={{ fontSize: "var(--fs-h1)", margin: "4px 0 0" }}>
            {settleCanceledCopy(settleCanceled).heading}
          </h1>
          <p
            style={{
              fontSize: "var(--fs-sm)",
              color: "var(--t2)",
              margin: "8px 0 0",
              lineHeight: 1.55,
            }}
          >
            {settleCanceledCopy(settleCanceled).body}
          </p>
          {/* Named only when we can name them. `count` comes from the raw snapshot and `lines` from
              the well-formed entries, so a corrupt row degrades to the count rather than to silence
              — and the `over_authorized` arm legitimately has none at all, which is why this whole
              block is conditional rather than part of the body copy. */}
          {settleCanceled.dropped.count > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="eyebrow" style={{ margin: 0 }} id="track-dropped-cancelled-label">
                {droppedNoticeHeading(settleCanceled.dropped)}
              </p>
              {settleCanceled.dropped.lines.length > 0 && (
                <ul
                  role="list"
                  aria-labelledby="track-dropped-cancelled-label"
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "6px 0 0",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  {settleCanceled.dropped.lines.map((l, i) => (
                    <li
                      key={`${l.name}-${i}`}
                      style={{ fontSize: "var(--fs-sm)", color: "var(--tx)" }}
                    >
                      {droppedLineLabel(l)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p
            style={{
              fontSize: "var(--fs-sm)",
              color: "var(--t2)",
              margin: "12px 0 0",
              lineHeight: 1.55,
            }}
          >
            {SETTLE_CANCELED_NOTE}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
              marginTop: 14,
            }}
          >
            {/* The real recovery. The cart is left OPEN with its lines voided after a cancelled
                settlement (`releaseOurLock` in lib/manual-capture-run.ts), so re-ordering is the
                path that actually works — and `menuHref(null)` routes to the DOOR PICKER rather
                than a bare /menu, which defaults to scan-&-go and would convert a pickup diner into
                a grocery shopper (W9a). No /account link: there is no order for it to find. */}
            <Link href={menuHref(null)} className="nav-link-strong">
              {menuLinkText(null)}
              <span aria-hidden className="nav-arrow nav-arrow-fwd">
                {" "}
                →
              </span>
            </Link>
            <a
              href={`tel:${BRAND_PHONE_TEL}`}
              className="nav-link"
              style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
            >
              Call us — {BRAND_PHONE_DISPLAY}
            </a>
          </div>
        </section>
      ) : refunded ? (
        // W1c — the refund arm: an honest terminal card in place of the rail. Not a live region (the
        // single role="status" above announces it); copy states the real Stripe window, no promises.
        <section
          className="card mms-rise"
          aria-label="Order refunded"
          style={{ marginTop: 20, padding: "18px 16px", borderLeft: "3px solid var(--warn)" }}
        >
          <p className="eyebrow" style={{ color: "var(--warn)", margin: 0 }}>
            Refunded
          </p>
          <p style={{ margin: "6px 0 0", fontWeight: 800 }}>Your money is on its way back.</p>
          <p style={{ margin: "6px 0 0", fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
            This order was refunded to your original payment method — banks typically post it within
            5–10 business days.
          </p>
          <p style={{ margin: "10px 0 0", fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
            Order reference{" "}
            <strong style={{ color: "var(--tx)", letterSpacing: "0.04em" }}>
              #{order.id.slice(-6).toUpperCase()}
            </strong>{" "}
            — questions? Ask us at the counter or call (626) 665-5317.
          </p>
        </section>
      ) : pureGrocery ? (
        <section className="exit-pass mms-rise" aria-label="Exit pass">
          <p
            className="exit-pass-kicker"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon name="check" size={16} />
            Paid — you’re all set
          </p>
          {/* ARIA prohibits naming a paragraph — the visual code is hidden and an sr-only sibling
              reads the reference as spaced characters (a hex tail read as one word is useless). The
              receipt card below carries the count + total, so the pass doesn't repeat them. */}
          <p className="exit-pass-code" aria-hidden>
            #{order.id.slice(-6).toUpperCase()}
          </p>
          <span className="sr-only">
            {`Order reference ${order.id.slice(-6).toUpperCase().split("").join(" ")}`}
          </span>
          <p className="exit-pass-sub">Show this on your way out if asked.</p>
        </section>
      ) : dineInSettled ? (
        // W9a — the settled-table arm. Terminal, honest, and it does NOT promise a status that can
        // never arrive. Same card grammar as the refund arm (tokens only, `--ok` rule instead of
        // `--warn`); not a live region — the single role="status" above carries the announcement.
        <section
          className="card mms-rise"
          aria-label="Order paid"
          style={{ marginTop: 20, padding: "18px 16px", borderLeft: "3px solid var(--ok)" }}
        >
          <p className="eyebrow" style={{ color: "var(--ok)", margin: 0 }}>
            Paid
          </p>
          <p style={{ margin: "6px 0 0", fontWeight: 800 }}>Paid in full.</p>
          {/* Deliberately does NOT say the meal is over. A dine-in diner can pay BEFORE sending food
              to the kitchen — `mms_fire_pending_food` fires their still-draft dine-in lines at
              settlement — so "thanks for dining with us" would be a goodbye delivered before the
              food. This wording is true whether they have eaten or are still waiting. */}
          <p style={{ margin: "6px 0 0", fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
            {order.tableNumber != null
              ? `Table ${order.tableNumber} is settled — your server will take it from here.`
              : "Your table is settled — your server will take it from here."}
          </p>
          <p style={{ margin: "10px 0 0", fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
            Order reference{" "}
            <strong style={{ color: "var(--tx)", letterSpacing: "0.04em" }}>
              #{order.id.slice(-6).toUpperCase()}
            </strong>
          </p>
        </section>
      ) : (
        <ul
          ref={timelineRef}
          role="list"
          aria-label="Order status"
          style={{ listStyle: "none", padding: "20px 4px 0", margin: 0 }}
        >
          {STEPS.map(([title, sub], i) => {
            const state = i < activeStep ? "done" : i === activeStep ? "now" : "pending";
            const last = i === STEPS.length - 1;
            const subtitle =
              i === 0 && !arrived ? (processing ? "Confirming payment…" : "Confirming…") : sub;
            const dotBg =
              state === "done" ? "var(--ok)" : state === "now" ? "var(--ac)" : "var(--pg)";
            const dotBorder =
              state === "done" ? "var(--ok)" : state === "now" ? "var(--ac)" : "var(--bd)";
            return (
              <li
                key={title}
                style={{ display: "flex", gap: 14 }}
                aria-current={state === "now" ? "step" : undefined}
              >
                <div
                  style={{
                    width: 30,
                    flex: "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <span
                    aria-hidden
                    className={state === "now" && pulseActive ? "mms-track-now" : undefined}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      boxSizing: "border-box",
                      border: `2.5px solid ${dotBorder}`,
                      background: dotBg,
                      transition:
                        "background var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out)",
                    }}
                  />
                  {!last && (
                    // Rail: the completed portion FLOWS in (green fill grows top→bottom) as the order
                    // advances, instead of switching color instantly. Reduced-motion snaps it (no transition).
                    <span aria-hidden className="track-rail">
                      <span
                        className={`track-rail-fill${i < activeStep ? " track-rail-fill-on" : ""}`}
                      />
                    </span>
                  )}
                </div>
                <div style={{ paddingBottom: 18 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "var(--fs-body)",
                      color: state === "pending" ? "var(--t3)" : "var(--tx)",
                    }}
                  >
                    {title}
                  </div>
                  <div style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", marginTop: 1 }}>
                    {subtitle}
                    {/* W22r — the step's REAL clock (created_at / the expo's stamps), only once
                        the step is reached; steps without an honest timestamp stay bare. */}
                    {state !== "pending" && stepTimes[i] && (
                      <span style={{ color: "var(--t3)" }}> · {formatClock(stepTimes[i]!)}</span>
                    )}
                    {last && <span aria-hidden> 🍵</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* To-go ready departure signal (S4.3a): the whole point — don't let a guest pay and walk out
          without their bag. Visual only; the role="status" region above carries the announcement (one
          source of truth, no double-announce). */}
      {ready && (
        <div
          ref={readyCardRef}
          tabIndex={-1}
          style={{
            padding: 14,
            marginTop: 8,
            borderRadius: "var(--r-card)",
            border: "1px solid var(--ok)",
            background: "var(--okb)",
            outline: "none",
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: "var(--fs-body)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="bag" size={18} />
            {isPickup ? "Ready for pickup" : "Your order’s ready"}
          </div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", marginTop: 4 }}>
            Grab it from the counter before you head out.
          </div>
          {/* J5 — "I'm here" (pickup only; a scan&go diner is already in the room). One tap pings the
              expo board over the existing floor realtime; confirmed state = the REAL arrived_at stamp
              (or the just-tapped optimistic flag), so a refresh/second device agrees. Errors surface
              inline AND through the tracker's single role="status" region above (one live region). */}
          {isPickup &&
            (announced ? (
              <div style={{ fontWeight: 700, fontSize: "var(--fs-sm)", marginTop: 10 }}>
                <span aria-hidden>✦ </span>The counter knows you’re here — hang tight.
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={imHere}
                  disabled={arriveBusy}
                  style={{
                    minHeight: 44,
                    marginTop: 10,
                    padding: "0 18px",
                    borderRadius: 10,
                    border: "1px solid var(--ok)",
                    background: "var(--cd)",
                    color: "var(--tx)",
                    fontWeight: 800,
                    fontSize: "var(--fs-sm)",
                    cursor: arriveBusy ? "default" : "pointer",
                  }}
                >
                  {arriveBusy ? "Letting them know…" : "I’m here"}
                </button>
                {arriveErr && (
                  <div style={{ fontSize: "var(--fs-sm)", color: "var(--warn)", marginTop: 6 }}>
                    {arriveErr}
                  </div>
                )}
              </>
            ))}
        </div>
      )}

      {/* Visual recovery affordance; the announcement comes from the role="status" region above
          (single source of truth — avoids a double announce / a first-paint role="alert" that AT skips). */}
      {/* W23d — `!settleCanceled`: this banner's every arm asserts a payment, and the terminal card
          above has already said the true thing. Two contradictory answers on one screen is worse
          than the original silence. */}
      {timedOut && !arrived && !settleCanceled && (
        <div
          style={{
            padding: 14,
            marginTop: 8,
            borderRadius: "var(--r-card)",
            border: "1px solid var(--warn)",
            background: "var(--warnb)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "var(--fs-sm)" }}>
            {sharePayer
              ? "Your share is paid"
              : weDown
                ? // W10c — name the real subject. "Taking longer than usual" makes the DINER'S order
                  // the thing that's wrong; the probe says it's our platform, and a diner whose card
                  // was charged deserves that distinction on this of all screens.
                  "We’re having trouble on our end"
                : youOffline
                  ? "You look offline"
                  : "This is taking longer than usual"}
          </div>
          {/* W9c — the old copy told a diner whose PAID, EATEN meal was sitting in the database that
              their "order just hasn't appeared here yet". It had appeared; the table was cleared and
              the live read's `is_member` authorization lapsed with it. Say what is actually true, and
              point at /account, where the uid-scoped history can always reach it. */}
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", margin: "4px 0 10px" }}>
            {weDown
              ? // The escalation. Refresh stays offered below (it's free and it may work at any
                // moment), but it is no longer the ONLY instruction on a screen where reloading
                // can't help — the counter can look the order up by the reference and settle it.
                processing
                ? "Your payment is with your bank; our own systems are the part that’s down. Nothing is lost — show this screen to staff and we’ll take it from there."
                : `${safeClaim(notYetCharged)} — it’s our systems we can’t reach right now, not your order. Show this screen to staff and we’ll match it up.`
              : youOffline
                ? // Pre-PR review — the offline diner's own branch. They were being told to tap
                  // Refresh, which is `location.reload()`: on a dead radio that replaces the only
                  // proof of payment they are holding with the browser's offline error page.
                  `${paidClaim(notYetCharged)} — this screen just can’t reach us while you’re offline. Reconnect and the Refresh button comes back; don’t reload until then.`
                : processing
                  ? "We’re still confirming your payment — refresh to check, or come back shortly."
                  : sharePayer
                    ? // ⚠️ Do NOT promise this diner a receipt in their account. `getOrderHistory` and
                      // `getMyLiveOrders` are BOTH scoped to `earned_by`, and a split order stamps only
                      // the host — which is the entire premise of this branch. /account would greet them
                      // with "No orders yet". Say what is true and point at a person who can help.
                      "Your payment went through. The table’s bill is recorded under whoever started the split, so this screen can’t follow it — ask them for the receipt, or check with us before you go."
                    : `${paidClaim(notYetCharged)}; we just can’t reach the order from this screen yet. Refresh to try again.`}
          </div>
          {/* The receipt token staff can look the payment up by. Same visible/sr-only split as the
              exit pass and the receipt card: a hex tail read aloud as one word is useless, so the
              visible block is aria-hidden and a sibling spells it out. Only rendered when we have a
              real identifier — this page is never allowed to invent one. */}
          {weDown && counterRef && (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                flexWrap: "wrap",
                padding: "8px 10px",
                margin: "0 0 10px",
                borderRadius: 10,
                border: "1px solid var(--bd)",
                background: "var(--cd)",
              }}
            >
              <span
                aria-hidden={counterRef.spellOut || undefined}
                style={{
                  fontSize: "var(--fs-xs)",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                }}
              >
                {counterRef.label}
              </span>
              {/* The order-code path keeps the exit-pass/receipt convention: the visible tail is
                  aria-hidden and an sr-only sibling spells it out (a hex tail read as one word is
                  useless). The Stripe id does NOT — spelling out a case-sensitive base62 string
                  loses the very thing that makes it searchable, so it is left as readable text. */}
              <strong
                aria-hidden={counterRef.spellOut || undefined}
                style={{ fontSize: "var(--fs-body)", letterSpacing: "0.06em", color: "var(--tx)" }}
              >
                {counterRef.value}
              </strong>
              {counterRef.spellOut && (
                <span className="sr-only">
                  {`${counterRef.label} ${counterRef.value.replace("#", "").split("").join(" ")}`}
                </span>
              )}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* Refresh is ALWAYS offered here. An earlier version hid it once the fallback had
                answered, on the reasoning that a closed session can't be reopened by reloading — but
                this banner only renders when the fallback did NOT resolve an order, i.e. `not_found` /
                `error` / `share_payer`. Those are precisely the states where a reload is the only
                recovery: a delayed webhook that lands a minute later, or three transient fetch errors
                on a switching mobile network (the effect latches on `fallback`, so nothing else
                retries). Hiding it removed the one working control from the case it was built for. */}
            {/* Pre-PR review — EXCEPT while the device is offline: this button is
                `location.reload()`, and on a dead radio that trades the diner's only proof of
                payment for the browser's offline error page. It comes back by itself the moment
                they reconnect (the `online` event clears the verdict, so `youOffline` goes false). */}
            {!youOffline && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  minHeight: 44,
                  padding: "0 18px",
                  borderRadius: 10,
                  border: "1px solid var(--bd)",
                  background: "var(--cd)",
                  color: "var(--tx)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Refresh
              </button>
            )}
            {/* /account reads orders uid-scoped on `earned_by`, which outlives every session — so it
                reaches a paid order long after the table is cleared. NOT shown to a share payer: they
                are precisely the diner `earned_by` does not cover (OPEN-ITEMS M29), so this link would
                land them on "No orders yet". */}
            {/* W10c — and NOT while the platform is down: /account is served by the same backend
                we just failed to reach, so this link would hand the diner a second broken screen at
                the exact moment they need one working instruction. */}
            {!sharePayer && !weDown && !youOffline && (
              <Link href="/account" className="nav-link">
                Find it in your account
                <span aria-hidden className="nav-arrow nav-arrow-fwd">
                  {" "}
                  →
                </span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* W9c — this order came from the uid-scoped SERVER fallback, not the live subscription: the
          table's session has closed, so nothing below will move again on its own. The rail and the
          status word are a snapshot of the moment it was read, and saying so is the difference between
          a receipt and a tracker that has quietly stopped tracking. Plain static text — the view's one
          role="status" region owns announcements. */}
      {staleSnapshot && (
        <p
          style={{
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
            background: "var(--sf)",
            border: "1px solid var(--bd)",
            borderRadius: 12,
            padding: "10px 12px",
            margin: "8px 0 0",
            lineHeight: 1.5,
          }}
        >
          Live updates aren’t reaching this screen, so this is a snapshot rather than a live view —
          it won’t update on its own.
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            {/* ⚠️ This notice renders when the fallback RESOLVED the order, i.e. `arrived` — and the
                Refresh button lives in the `!arrived` banner above. An earlier draft told the diner to
                "refresh to check" with no Refresh anywhere on the page, and dropped the /account link
                out of the sentence at the same time: two instructions, zero controls, on the screen
                this slice exists to make honest. Both controls are right here now. */}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                minHeight: 44,
                padding: "0 16px",
                borderRadius: 10,
                border: "1px solid var(--bd)",
                background: "var(--cd)",
                color: "var(--tx)",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
            <Link href="/account" className="nav-link">
              Full receipt in your account
              <span aria-hidden className="nav-arrow nav-arrow-fwd">
                {" "}
                →
              </span>
            </Link>
          </span>
        </p>
      )}

      {arrived && (
        // W22a — the paid summary is now a thermal SLIP: card body + torn foot inside a clip
        // wrapper. Freshly paid (justPaid — the same one-shot flag as the celebration; a revisit
        // renders the slip at rest) it PRINTS on: the clip opens top→bottom while the print-head
        // light — a SIBLING of the clipped element, never a child (a child gets clipped) — rides
        // the frontier on the identical duration/ease. Presentation only: every figure below is
        // the same server-rendered value as before. RM renders the finished slip instantly.
        <div className={`receipt-slip${justPaid ? " receipt-print" : ""}`} style={{ marginTop: 6 }}>
          <div className="receipt-slip-clip">
            {/* `.vt-receipt` (J4, earner + fresh payment only): on the next nav to /account this
                receipt card MORPHS into the "Your orders" history card — the receipt visibly tucks
                into the account. Gated on `earnedThisOrder` so the metaphor is never a false
                promise: split share-payers aren't the stamped earner, and this order won't be in
                THEIR history. */}
            <div
              className={`card card-textured receipt-slip-body${justPaid && progress?.earnedThisOrder ? " vt-receipt" : ""}`}
              style={{ padding: 12 }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span
                  aria-hidden
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: "var(--grad)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--ac)",
                  }}
                >
                  <Icon name="receipt" size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "var(--fs-sm)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · $
                    {(order.totalCents / 100).toFixed(2)}
                  </div>
                  <div style={{ fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
                    {/* W22r (adversarial MED) — the slip speaks receipt-view's settled-state
                        vocabulary: the reader tap is never misnamed as online card, and a
                        REFUNDED order must never claim "Paid in full" (this slip renders in the
                        branch-independent arrived block, refund arm included). */}
                    {receiptStatusLabel(order.refund, order.tender)}
                    {/* K2: dine-in receipts name the table (null for to-go/pickup — no table). */}
                    {order.tableNumber != null && ` · Table ${order.tableNumber}`}
                    {/* W22r — the pickup contact (W21's required field), snapshot verbatim. */}
                    {order.customerName != null && ` · For ${order.customerName}`}
                  </div>
                </div>
                {/* W2e — the short order code on every food receipt card: a dine-in/pickup diner now
                has a reference to quote at the counter (grocery already gets one on the exit pass).
                The visible tail is aria-hidden; an sr-only sibling reads it as spaced characters (a
                hex tail read as one word is useless), matching the exit-pass pattern. Same uuid-tail
                the exit pass + refund card print. The whole visible block is aria-hidden — the
                sr-only sibling carries the full "Order reference …" label, so AT hears it once, not
                "Order" then "Order reference". */}
                <div style={{ textAlign: "right", flex: "none" }}>
                  <div
                    aria-hidden
                    style={{
                      fontSize: "var(--fs-xs)",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--t3)",
                    }}
                  >
                    Order
                  </div>
                  <div
                    aria-hidden
                    style={{
                      fontWeight: 800,
                      fontSize: "var(--fs-sm)",
                      letterSpacing: "0.04em",
                      color: "var(--tx)",
                    }}
                  >
                    #{order.id.slice(-6).toUpperCase()}
                  </div>
                  <span className="sr-only">
                    {`Order reference ${order.id.slice(-6).toUpperCase().split("").join(" ")}`}
                  </span>
                </div>
              </div>
              {/* W22r (owner: "live trackings should also be detailed") — the slip itemizes WHAT
                  was paid for, right on the tracker: the same destination grouping, kitchen notes,
                  and zero-gated breakdown rows as the durable artifact (one shared derivation —
                  lib/receipt-view — so the tracker, the ?r= page, and the email can never
                  disagree). Every figure is the fulfillment-time snapshot rendered verbatim;
                  lines sum to the subtotal, tax stays ONE order-level row (M7). */}
              {order.lines.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {groupReceiptLines(order.lines).map((g) => (
                    <div key={g.key}>
                      {g.label && (
                        <p
                          style={{
                            margin: "8px 0 0",
                            fontSize: "var(--fs-xs)",
                            fontWeight: 800,
                            letterSpacing: "0.07em",
                            textTransform: "uppercase",
                            color: "var(--t3)",
                          }}
                        >
                          {g.label}
                        </p>
                      )}
                      <ul
                        role="list"
                        aria-label={g.label ?? "Items"}
                        style={{ listStyle: "none", margin: "4px 0 0", padding: 0 }}
                      >
                        {g.lines.map((l, i) => (
                          <li key={i} className="history-line">
                            <span className="history-line-qty">
                              {l.qty}
                              <span aria-hidden>×</span>
                            </span>
                            <span>
                              <span style={{ color: "var(--tx)" }}>{l.name}</span>
                              {l.mods.length > 0 && (
                                <span className="history-line-mods">{l.mods.join(" · ")}</span>
                              )}
                              {l.notes && (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: "var(--fs-xs)",
                                    color: "var(--t3)",
                                    fontStyle: "italic",
                                    marginTop: 1,
                                  }}
                                >
                                  “{l.notes}”
                                </span>
                              )}
                              {/* W23b — which dish came back, stated as an amount (the over-refund
                                  cap can clamp a refund below the line's own price, so a strike
                                  would overclaim). */}
                              {lineRefundLabel(l.refundedCents) && (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: "var(--fs-xs)",
                                    fontWeight: 700,
                                    color: "var(--warn)",
                                    fontVariantNumeric: "tabular-nums",
                                    marginTop: 1,
                                  }}
                                >
                                  {lineRefundLabel(l.refundedCents)}
                                </span>
                              )}
                            </span>
                            <span
                              style={{ color: "var(--t2)", fontVariantNumeric: "tabular-nums" }}
                            >
                              {dollars(l.unitPriceCents * l.qty)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <dl className="history-totals">
                    {[
                      ...buildReceiptRows(order.breakdown, order.totalCents),
                      // W23b — what came back, then what the guest actually paid. Appended, never
                      // folded into the Total: the Total is the fulfillment-time snapshot and a
                      // refund is a later fact about it.
                      ...buildRefundRows(order.refund),
                    ].map((r) => (
                      <div
                        key={r.key}
                        className={
                          r.grand ? "history-totals-row history-totals-grand" : "history-totals-row"
                        }
                      >
                        <dt>{r.label}</dt>
                        <dd>{`${r.negative ? "−" : ""}${dollars(r.amountCents)}`}</dd>
                      </div>
                    ))}
                  </dl>
                  {/* SB-1524 (adversarial MED) — the fee never surfaces without its explanation.
                      Live orders never trip this (the charge is retired, minted 0), but a
                      pre-2026-08-15 order reopened via the fallback shows its historical fee
                      here — so the disclosure rides this slip exactly like the artifact/email. */}
                  {serviceDisclosed(order.breakdown) && (
                    <p
                      style={{
                        fontSize: "var(--fs-xs)",
                        color: "var(--t3)",
                        margin: "8px 2px 0",
                        lineHeight: 1.5,
                      }}
                    >
                      {SERVICE_CHARGE_DISCLOSURE}
                    </p>
                  )}
                  {/* W23b — where the money went. Only the PARTIAL case: a full refund's status
                      line already says the whole charge came back. Promises no timing the code
                      cannot keep — the bank's window is the bank's. */}
                  {order.refund.state === "partial" && (
                    <p
                      style={{
                        fontSize: "var(--fs-xs)",
                        color: "var(--t3)",
                        margin: "8px 2px 0",
                        lineHeight: 1.5,
                      }}
                    >
                      {PARTIAL_REFUND_NOTE}
                    </p>
                  )}
                  {/* W23d — what the settlement removed between the tap and the charge (registry
                      M71). Sits BELOW the totals and deliberately outside `buildReceiptRows`: it is
                      not a receipt row and carries no dollar figure, because a figure printed here
                      for money that was never charged reads as a refund line. `[]` for every
                      automatic-capture order, so this renders for nobody until
                      PICKUP_MANUAL_CAPTURE is on. */}
                  {order.dropped.count > 0 && (
                    <div style={{ margin: "10px 2px 0" }}>
                      <p
                        id="track-dropped-label"
                        style={{
                          fontSize: "var(--fs-xs)",
                          fontWeight: 800,
                          color: "var(--tx)",
                          margin: 0,
                        }}
                      >
                        {droppedNoticeHeading(order.dropped)}
                      </p>
                      {order.dropped.lines.length > 0 && (
                        <ul
                          role="list"
                          aria-labelledby="track-dropped-label"
                          style={{
                            listStyle: "none",
                            padding: 0,
                            margin: "4px 0 0",
                            display: "grid",
                            gap: 2,
                          }}
                        >
                          {order.dropped.lines.map((l, i) => (
                            <li
                              key={`${l.name}-${i}`}
                              style={{ fontSize: "var(--fs-xs)", color: "var(--t2)" }}
                            >
                              {droppedLineLabel(l)}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p
                        style={{
                          fontSize: "var(--fs-xs)",
                          color: "var(--t3)",
                          margin: "6px 0 0",
                          lineHeight: 1.5,
                        }}
                      >
                        {DROPPED_NOTICE_BODY}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="receipt-tear" aria-hidden />
          </div>
          {justPaid && <span className="receipt-printhead" aria-hidden />}
        </div>
      )}

      {/* W7a — the receipt ARTIFACT door: the durable print/view link + the consent-first email
          capture (the server action re-authorizes earner/payer on every ask; renders nothing for
          a viewer it refuses). Sits under the compact card — the card stays the summary, the
          artifact is the itemized lasting copy. */}
      {arrived && <ReceiptActions orderId={order.id} />}

      {/* J4 — one clock for the exit arc: the goodbye + the review ask land when the FOOD is where it
          belongs, not merely when money moved. Keyed on the LINES, not `togoStatus`: nothing to-go is
          food (pure dine-in — already eaten at the table; pure grocery — the basket's in hand at
          payment) → immediately; otherwise only at the expo's picked-up tap. Deliberately NOT
          `togo === null`: the webhook inits togo_status in its after() block, so a bag order can
          briefly exist with a null status — that disjunct would flash (or, on a stale-response race,
          pin) a premature goodbye mid-wait. `hasTogoFood` is derived from immutable line data, so
          it's race-immune; a permanently failed init is healed by the pg_cron fulfillment reconciler.
          Both rise (realtime) the moment the expo hands the bag over, which IS the visit's end. */}
      {justPaid && arrived && !refunded && (!order.hasTogoFood || togo === "picked_up") && (
        <GoodbyeBeat progress={progress} />
      )}

      {/* Post-order feedback (M4 P4.3, timed by J4 on the same food-in-hand clock) — renders nothing
          unless the caller is the earner + hasn't reviewed; ungated public-review link inside. */}
      {arrived && !refunded && (!order.hasTogoFood || togo === "picked_up") && (
        <FeedbackPrompt orderId={order.id} />
      )}

      <p style={{ fontSize: "var(--fs-sm)", color: "var(--t3)", margin: "14px 0 0" }}>
        {settleCanceled
          ? // W23d — FIRST, for the same reason the live region's arm is: with no order every
            // predicate below is false, so this state fell through to "Status updates here as the
            // kitchen works on it — keep this open", directly contradicting the terminal card above
            // it. Its timed-out arm was no better — it points at a "Refresh above" this state does
            // not render. The string lives in lib/dropped-view so the rule has a test.
            SETTLE_CANCELED_NEXT
          : refunded
            ? "This order is closed — the refund above is its final state."
            : pureGrocery
              ? "You’re free to go — this receipt lives in your order history."
              : dineInSettled
                ? // W9a — the old string promised live kitchen updates on a screen whose rail can never
                  // move again. State what is actually true: the bill is paid and the receipt keeps.
                  "Your table’s all settled — this receipt lives in your order history."
                : timedOut && !arrived
                  ? // W9c — "keep this open" is a promise the code cannot keep here: `exhausted` and the
                    // server fallback are BOTH latched, so nothing on this screen will change on its own.
                    // It also contradicted the banner directly above it.
                    youOffline
                    ? // …and offline there is no Refresh above to point at (it is withdrawn), so don't.
                      "Keep this screen open — Refresh comes back as soon as you’re online again."
                    : "Nothing more will load here on its own — use Refresh above, or ask us and we’ll look it up."
                  : staleSnapshot
                    ? "This is the order as we last read it — the receipt in your account is the lasting copy."
                    : "Status updates here as the kitchen works on it — keep this open, or check back anytime."}
      </p>
      {/* W23d — the terminal card above owns the recovery for a cancelled hold, and `backMode` is
          null without an order, so this row would render a SECOND, identical door-picker link
          directly beneath the first. The contact foot below still renders: a guest whose payment was
          cancelled is exactly who wants the phone number. */}
      {!settleCanceled && (
        <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 4 }}>
          {/* W9a — the ONLY forward affordance on the post-pay screen, and it used to be a bare
            `/menu`: `useTableSession` defaults a mode-less menu to scan-&-go, so the tap that was
            meant to say "order something else" silently minted a fresh grocery session and orphaned
            the diner's table. The destination now comes from the ORDER's own line fulfillments —
            server truth that outlives both the table session and the device's "last door" memory. */}
          <Link href={menuHref(backMode)} className="nav-link">
            <span aria-hidden className="nav-arrow nav-arrow-back">
              ←
            </span>{" "}
            {menuLinkText(backMode)}
          </Link>
          {/* The rewards hub's diner-facing entry point on a REVISIT (viewport-prefetched by <Link>).
            On a fresh payment the goodbye beat carries the rewards door for everyone instead — one
            clear door, decided once at mount (never a link that vanishes underfoot when the progress
            poll resolves — focus would drop to <body>). */}
          {arrived && !justPaid && (
            <Link href="/account" className="nav-link">
              View your rewards{" "}
              <span aria-hidden className="nav-arrow nav-arrow-fwd">
                →
              </span>
            </Link>
          )}
        </div>
      )}
      {/* W22r — the restaurant's real contact foot on the live order surface (the delivery app's
          support-block pattern; every string verbatim from lib/brand). A live order is exactly
          when a diner wants the phone number without hunting for it. */}
      <p
        style={{
          margin: "18px 0 0",
          fontSize: "var(--fs-xs)",
          color: "var(--t3)",
          lineHeight: 1.7,
        }}
      >
        Mandalay Morning Star · {BRAND_ADDRESS}
        <span style={{ display: "block" }}>
          Questions about this order?{" "}
          {/* Padded hit area + negative margin (adversarial LOW): a ≥44px target on the one
              screen a diner actually dials from, without inflating the fine-print line box. */}
          <a
            href={`tel:${BRAND_PHONE_TEL}`}
            style={{
              color: "var(--t2)",
              textDecorationColor: "var(--bd)",
              display: "inline-block",
              padding: "14px 6px",
              margin: "-14px -6px",
            }}
          >
            {BRAND_PHONE_DISPLAY}
          </a>{" "}
          — or ask us at the counter.
        </span>
      </p>
    </main>
  );
}

const chip: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 800,
  padding: "5px 10px",
  borderRadius: 999,
  whiteSpace: "nowrap",
};

// Visually hidden, still announced by AT (the visible chip carries the same state for sighted users).
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};
