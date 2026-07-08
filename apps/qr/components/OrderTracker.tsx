"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useOrderStatus } from "@/lib/useOrderStatus";
import { formatSlotLong } from "@/lib/pickupTime";
import { useAnimationPreference, useInView } from "@mms/ui";
import { getRewardsProgress, type RewardsProgress } from "@/lib/rewards";
import { FeedbackPrompt } from "./FeedbackPrompt";
import { PaySuccess } from "./PaySuccess";

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
}: {
  paymentIntent: string | null;
  // Split-tender (M3·P3.3b) orders have no PaymentIntent on the row, so /track keys them by the
  // resolved order id instead (getSplitOrderId). Exactly one of paymentIntent/orderId is set.
  orderId?: string | null;
  processing: boolean; // redirect_status === "processing" — payment not yet captured (e.g. bank debit)
  // R7a: this mount is a FRESH successful payment (redirect_status=succeeded / split paid=1) → play the
  // one-shot pay-success celebration. False on a revisit/processing/direct-visit (no celebration).
  justPaid?: boolean;
}) {
  const { order, timedOut } = useOrderStatus(paymentIntent, orderId);
  // Pulse the active step only while the timeline is on-screen AND motion is allowed (P5.3): a
  // box-shadow `infinite` loop shouldn't keep ticking when scrolled out of view. The ref sits on the
  // STABLE <ul>, not the moving active dot (a ref on a conditional/moving target breaks the observer).
  const { shouldAnimate } = useAnimationPreference();
  const { ref: timelineRef, inView } = useInView<HTMLUListElement>();
  const pulseActive = shouldAnimate && inView;
  const arrived = !!order;
  // A pickup order carries a slot → use the pickup lifecycle + echo the slot as the honest ETA (no
  // fabricated countdown). Until the order lands we don't know the mode, so default to Scan & Go.
  const isPickup = !!order?.pickupSlot;
  const STEPS = isPickup ? PICKUP_STEPS : SCANGO_STEPS;
  const eta = isPickup && order?.pickupSlot ? `Ready ${formatSlotLong(order.pickupSlot)}` : null;
  // Active step: until the order lands, nothing pulses (-1). Once it lands, the takeaway fulfillment
  // status (S4.3a, expo-driven) lights the rail — preparing→"In the kitchen", ready→"Ready (for pickup)",
  // picked_up→done. An order with NO takeaway portion (pure dine-in, togoStatus null) rests at "Order
  // placed" (the diner's at the table; the rail isn't their surface). Don't gate on the URL `processing`
  // param — it doesn't track bank-settlement, so a stale ?redirect_status=processing still renders right.
  const togo = order?.togoStatus ?? null;
  const activeStep = !arrived
    ? -1
    : togo === "picked_up"
      ? 3
      : togo === "ready"
        ? 2
        : togo === "preparing"
          ? 1
          : 0;
  const ready = arrived && togo === "ready";
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
  const modeLabel = isPickup ? "Pickup" : "Scan & Go";
  const statusChip = (
    <span
      style={{
        ...chip,
        background: arrived ? "var(--okb)" : "var(--sf)",
        color: arrived ? "var(--ok)" : "var(--t2)",
      }}
    >
      {ready
        ? "Ready for pickup"
        : arrived
          ? togo === "picked_up"
            ? "Picked up"
            : "Order received"
          : processing
            ? "Confirming payment"
            : "Confirming order"}
    </span>
  );

  return (
    <main style={{ padding: "24px 20px 40px", maxWidth: 440, margin: "0 auto" }}>
      {justPaid ? (
        // Fresh successful payment → the celebration is the headline (one <h1>); the mode + status + ETA
        // ride a compact row below it, and the timeline follows.
        <>
          <PaySuccess
            starsEarned={starsEarned}
            ordersToNext={progress?.ordersToNext ?? null}
            stars={progress?.stars ?? null}
            milestoneStep={progress?.milestoneStep ?? null}
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
            <h1 style={{ fontSize: 28, margin: "2px 0 0" }}>Your order</h1>
            {eta && (
              <div style={{ marginTop: 6, fontWeight: 800, color: "var(--ac)", fontSize: 14 }}>
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
        {ready
          ? "Your order is ready for pickup — grab it before you go."
          : arrived
            ? togo === "picked_up"
              ? "Order picked up — enjoy!"
              : togo === "preparing"
                ? "Your order is being prepared."
                : "Payment confirmed — your order is in."
            : timedOut
              ? "Your order is taking longer than expected — use the Refresh button to check."
              : justPaid
                ? "Payment confirmed — finalizing your order."
                : processing
                  ? "Confirming your payment."
                  : "Confirming your order."}
      </p>

      {/* <ul>, not <ol>: the steps' order is conveyed visually + by aria-current, not a numeric
          counter. role="list" restores semantics WebKit drops from a list-style:none list. */}
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
                    fontSize: 14.5,
                    color: state === "pending" ? "var(--t3)" : "var(--tx)",
                  }}
                >
                  {title}
                </div>
                <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 1 }}>
                  {subtitle}
                  {last && <span aria-hidden> 🍵</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* To-go ready departure signal (S4.3a): the whole point — don't let a guest pay and walk out
          without their bag. Visual only; the role="status" region above carries the announcement (one
          source of truth, no double-announce). */}
      {ready && (
        <div
          style={{
            padding: 14,
            marginTop: 8,
            borderRadius: "var(--r-card)",
            border: "1px solid var(--ok)",
            background: "var(--okb)",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            <span aria-hidden>🥡 </span>
            {isPickup ? "Ready for pickup" : "Your order’s ready"}
          </div>
          <div style={{ fontSize: 13, color: "var(--t2)", marginTop: 4 }}>
            Grab it from the counter before you head out.
          </div>
        </div>
      )}

      {/* Visual recovery affordance; the announcement comes from the role="status" region above
          (single source of truth — avoids a double announce / a first-paint role="alert" that AT skips). */}
      {timedOut && !arrived && (
        <div
          style={{
            padding: 14,
            marginTop: 8,
            borderRadius: "var(--r-card)",
            border: "1px solid var(--warn)",
            background: "var(--warnb)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14 }}>This is taking longer than usual</div>
          <div style={{ fontSize: 13, color: "var(--t2)", margin: "4px 0 10px" }}>
            {processing
              ? "We’re still confirming your payment — refresh to check, or come back shortly."
              : "Your payment went through; your order just hasn’t appeared here yet. Refresh to check."}
          </div>
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
        </div>
      )}

      {arrived && (
        <div
          className="card card-textured"
          style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, marginTop: 6 }}
        >
          <span
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "var(--grad)",
              display: "grid",
              placeItems: "center",
              fontSize: 20,
            }}
          >
            🧾
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
              {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · $
              {(order.totalCents / 100).toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: "var(--t2)" }}>Paid in full</div>
          </div>
        </div>
      )}

      {/* Post-order feedback (M4 P4.3) — only once the order has landed (its id is known). Renders
          nothing unless the caller is the earner + hasn't reviewed; ungated public-review link inside. */}
      {arrived && <FeedbackPrompt orderId={order.id} />}

      <p style={{ fontSize: 12, color: "var(--t3)", margin: "14px 0 0" }}>
        Status updates here as the kitchen works on it — keep this open, or check back anytime.
      </p>
      <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 4 }}>
        <Link href="/menu" className="nav-link">
          <span aria-hidden className="nav-arrow nav-arrow-back">
            ←
          </span>{" "}
          Back to menu
        </Link>
        {/* The rewards hub had NO diner-facing entry point — the Star just earned here is the natural
            moment to offer it (viewport-prefetched by <Link>). Only once the order landed (not while
            confirming) so the tracker's first paint stays focused. */}
        {arrived && (
          <Link href="/account" className="nav-link">
            View your rewards{" "}
            <span aria-hidden className="nav-arrow nav-arrow-fwd">
              →
            </span>
          </Link>
        )}
      </div>
    </main>
  );
}

const chip: CSSProperties = {
  fontSize: 12,
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
