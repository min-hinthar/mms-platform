"use client";
import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Route-segment error boundary (App Router). Catches a render error below the root layout and recovers
 * IN PLACE (the layout, AnonAuthGate + session stay mounted) instead of escalating to the full
 * global-error crash. React boundaries swallow the error before posthog-js's auto-capture sees it, so
 * report it explicitly. Branded, accessible recovery with a reset.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <main
      role="alert"
      style={{
        minHeight: "70dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 340 }}>
        <p aria-hidden style={{ fontSize: 36, margin: 0 }}>
          🫖
        </p>
        <h1 style={{ fontSize: 20, margin: "10px 0 6px" }}>This screen didn’t load</h1>
        <p style={{ fontSize: 14, color: "var(--t2)", lineHeight: 1.5, margin: "0 0 18px" }}>
          Something went wrong on our end. Your order is safe — try again.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            minHeight: 48,
            padding: "0 22px",
            borderRadius: 999,
            border: "none",
            background: "var(--ac)",
            color: "var(--oa)",
            fontWeight: 800,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
