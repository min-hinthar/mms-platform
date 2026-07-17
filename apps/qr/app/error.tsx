"use client";
import { useEffect, useRef } from "react";
import posthog from "posthog-js";

// A stale deploy leaves the running tab pointing at chunk URLs that no longer exist; the next lazy import
// throws a ChunkLoadError. `reset()` just re-requests the same dead URL, so the boundary would loop — a
// one-shot hard reload fetches the new build instead (the delivery repo's learning). Cooldown-guarded via
// sessionStorage so a non-chunk error that happens to match can't reload-loop.
const CHUNK_RE = /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch dynamically/i;
const RELOAD_KEY = "mms.chunkReloadAt";

function tryChunkReload(error: Error): boolean {
  if (!CHUNK_RE.test(error.name) && !CHUNK_RE.test(error.message)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 10_000) return false; // already reloaded once recently — show the UI instead
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // private mode / storage disabled — fall through to a single reload without the loop guard
  }
  window.location.reload();
  return true;
}

/**
 * Route-segment error boundary (App Router). Catches a render error below the root layout and recovers
 * IN PLACE (the layout, AnonAuthGate + session stay mounted) instead of escalating to the full
 * global-error crash. React boundaries swallow the error before posthog-js's auto-capture sees it, so
 * report it explicitly. Branded, accessible recovery: focus moves to the heading on mount (§A — focus
 * follows the view change; an unannounced swap would strand a SR user), with a reset. A stale-deploy
 * ChunkLoadError hard-reloads once instead of looping the (useless) reset.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    posthog.captureException(error);
    if (tryChunkReload(error)) return; // navigating away — don't bother moving focus
    headingRef.current?.focus();
  }, [error]);

  return (
    <main
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
        <h1
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: "var(--fs-h2)", lineHeight: "var(--lh-snug)", margin: "10px 0 6px" }}
        >
          This screen didn’t load
        </h1>
        <p
          style={{
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
            lineHeight: "var(--lh-normal)",
            margin: "0 0 18px",
          }}
        >
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
            fontSize: "var(--fs-h3)",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
