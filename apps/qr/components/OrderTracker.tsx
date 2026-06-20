"use client";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useOrderStatus } from "@/lib/useOrderStatus";
import { formatSlotLong } from "@/lib/pickupTime";

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
  processing,
}: {
  paymentIntent: string | null;
  processing: boolean; // redirect_status === "processing" — payment not yet captured (e.g. bank debit)
}) {
  const { order, timedOut } = useOrderStatus(paymentIntent);
  const arrived = !!order;
  // A pickup order carries a slot → use the pickup lifecycle + echo the slot as the honest ETA (no
  // fabricated countdown). Until the order lands we don't know the mode, so default to Scan & Go.
  const isPickup = !!order?.pickupSlot;
  const STEPS = isPickup ? PICKUP_STEPS : SCANGO_STEPS;
  const eta = isPickup && order?.pickupSlot ? `Ready ${formatSlotLong(order.pickupSlot)}` : null;
  // `arrived` (the order row exists) is the ONE canonical signal: pulse step 0 once it lands, keep
  // every step pending until then. Don't gate on the URL `processing` param — it doesn't track
  // bank-settlement, so a debit that clears after the diner leaves (stale ?redirect_status=processing)
  // still shows the order correctly on return. S2: derive the active index from the kitchen status.
  const activeStep = arrived ? 0 : -1;

  return (
    <main style={{ padding: "24px 20px 40px", maxWidth: 440, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div>
          <div className="eyebrow">{isPickup ? "Pickup" : "Scan & Go"}</div>
          <h1 style={{ fontSize: 28, margin: "2px 0 0" }}>Your order</h1>
          {eta && (
            <div style={{ marginTop: 6, fontWeight: 800, color: "var(--ac)", fontSize: 14 }}>
              {eta}
            </div>
          )}
        </div>
        <span
          style={{
            ...chip,
            background: arrived ? "var(--okb)" : "var(--sf)",
            color: arrived ? "var(--ok)" : "var(--t2)",
          }}
        >
          {arrived ? "Order received" : processing ? "Confirming payment" : "Confirming order"}
        </span>
      </div>

      {/* Single live region: role="status" already implies aria-live="polite" (ARIA 1.2). The
          timedOut arm makes the text CHANGE when polling gives up, so AT announces the recovery. */}
      <p role="status" style={srOnly}>
        {arrived
          ? "Payment confirmed — your order is in."
          : timedOut
            ? "Your order is taking longer than expected — use the Refresh button to check."
            : processing
              ? "Confirming your payment."
              : "Confirming your order."}
      </p>

      {/* <ul>, not <ol>: the steps' order is conveyed visually + by aria-current, not a numeric
          counter. role="list" restores semantics WebKit drops from a list-style:none list. */}
      <ul
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
                  className={state === "now" ? "mms-track-now" : undefined}
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
                  <span
                    aria-hidden
                    style={{
                      flex: 1,
                      width: 2.5,
                      minHeight: 26,
                      margin: "2px 0",
                      background: i < activeStep ? "var(--ok)" : "var(--bd)",
                    }}
                  />
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
          className="card"
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

      <p style={{ fontSize: 12, color: "var(--t3)", margin: "14px 0 0" }}>
        Status updates here as the kitchen works on it — keep this open, or check back anytime.
      </p>
      <Link
        href="/menu"
        style={{
          color: "var(--ac)",
          fontWeight: 700,
          display: "inline-block",
          marginTop: 4,
          padding: "12px 0", // ≥44px touch target (QA §A P0)
        }}
      >
        <span aria-hidden>←</span> Back to menu
      </Link>
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
