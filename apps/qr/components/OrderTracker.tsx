"use client";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useOrderStatus } from "@/lib/useOrderStatus";

// Scan & Go lifecycle (ports v7.2 STEPS.scango). The active step is server-driven; at M1 there's no
// kitchen actor, so it rests at "Order placed" — the kitchen steps light up when S2's KDS lands
// (same Realtime subscription). Dine-in / pickup variants arrive with the S-track / M2.2.
const STEPS: [title: string, sub: string][] = [
  ["Order placed", "We’ve got it"],
  ["In the kitchen", "Cooking your dishes"],
  ["Ready", "We’ll bring it out"],
  ["Served", "Enjoy"], // the 🍵 is rendered decoratively (aria-hidden) so AT doesn't read it aloud
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
  const order = useOrderStatus(paymentIntent);
  const arrived = !!order;
  const activeStep = 0; // S2: derive from order's kitchen status

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
          <div className="eyebrow">Scan &amp; Go</div>
          <h1 style={{ fontSize: 28, margin: "2px 0 0" }}>Your order</h1>
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

      {/* Single polite live region: announces the phase change to screen-reader users. */}
      <p role="status" aria-live="polite" style={srOnly}>
        {arrived
          ? "Payment confirmed — your order is in."
          : processing
            ? "Confirming your payment."
            : "Confirming your order."}
      </p>

      {/* role="list" — WebKit/VoiceOver drops list semantics from a list-style:none <ol> */}
      <ol role="list" style={{ listStyle: "none", padding: "20px 4px 0", margin: 0 }}>
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
      </ol>

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
  fontSize: 11,
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
