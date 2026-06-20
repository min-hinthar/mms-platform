"use client";
import "./globals.css";
import { useEffect, useRef } from "react";
import posthog from "posthog-js";

/**
 * Root crash boundary (App Router). A render error that escapes every nested boundary replaces the
 * ROOT layout, so this owns its own <html>/<body>. React error boundaries CATCH the error before it
 * reaches window.onerror, so posthog-js's auto-capture (capture_exceptions) never sees it — capture it
 * explicitly here. Focus moves to the heading on mount (§A). Color TOKENS come from tokens.css on
 * :root (via globals.css) so they apply; the next/font variables live on the root layout's <html>
 * which this replaces, so the display font deliberately degrades to the serif fallback — acceptable
 * for a rare full crash, not worth shipping a second next/font instance into the crash bundle.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    posthog.captureException(error);
    headingRef.current?.focus();
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
        <main style={{ maxWidth: 360, textAlign: "center" }}>
          <p aria-hidden style={{ fontSize: 40, margin: 0 }}>
            🫖
          </p>
          <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 22, margin: "12px 0 6px" }}>
            Something went wrong
          </h1>
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
