"use client";
import "./globals.css";
import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Root crash boundary (App Router). A render error that escapes every nested boundary replaces the
 * ROOT layout, so this owns its own <html>/<body>. React error boundaries CATCH the error before it
 * reaches window.onerror, so posthog-js's auto-capture (capture_exceptions) never sees it — capture it
 * explicitly here. Branded recovery (tokens via globals.css) with a reset, not Next's default screen.
 */
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "var(--pg)",
          color: "var(--tx)",
        }}
      >
        <main role="alert" style={{ maxWidth: 360, textAlign: "center" }}>
          <p aria-hidden style={{ fontSize: 40, margin: 0 }}>
            🫖
          </p>
          <h1 style={{ fontSize: 22, margin: "12px 0 6px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "var(--t2)", lineHeight: 1.5, margin: "0 0 20px" }}>
            We hit an unexpected error. Your order is safe — let’s try that again.
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
        </main>
      </body>
    </html>
  );
}
