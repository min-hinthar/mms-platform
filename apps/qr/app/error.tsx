"use client";
import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { useConnectionTruth } from "@/lib/useConnectionTruth";

// A stale deploy leaves the running tab pointing at chunk URLs that no longer exist; the next lazy import
// throws a ChunkLoadError. `reset()` just re-requests the same dead URL, so the boundary would loop — a
// one-shot hard reload fetches the new build instead (the delivery repo's learning). Cooldown-guarded via
// sessionStorage so a non-chunk error that happens to match can't reload-loop.
const CHUNK_RE =
  /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch dynamically/i;
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
// W10a — escalation memory: each error-mount inside a short window bumps the count, so a boundary
// that keeps re-erroring stops promising "try again" and admits a sustained problem. sessionStorage
// (not module state) so it survives the remounts reset() causes.
const ERR_COUNT_KEY = "mms.errBoundary";
const ERR_WINDOW_MS = 90_000;

function bumpErrorCount(): number {
  try {
    const raw = sessionStorage.getItem(ERR_COUNT_KEY);
    const rec = raw ? (JSON.parse(raw) as { n: number; at: number }) : null;
    const fresh = rec && Date.now() - rec.at < ERR_WINDOW_MS;
    const n = (fresh ? rec.n : 0) + 1;
    sessionStorage.setItem(ERR_COUNT_KEY, JSON.stringify({ n, at: Date.now() }));
    return n;
  } catch {
    return 1; // private mode — no escalation memory, first-attempt copy each time
  }
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Lazy init, not an effect (the setState-in-effect lint): one bump per boundary mount — each new
  // error mounts a fresh boundary instance. (StrictMode double-invokes initializers in dev, which
  // only makes escalation appear one error sooner there; prod counts are exact.)
  const [attempts] = useState(() => bumpErrorCount());
  const { truth, diagnose } = useConnectionTruth();
  useEffect(() => {
    posthog.captureException(error);
    if (tryChunkReload(error)) return; // navigating away — don't bother moving focus
    // W10a — ask the ONE health probe whether this is our outage, so the copy can honestly say
    // "it's us" (or "you look offline") instead of the bug-shaped default. Best-effort.
    void diagnose();
    headingRef.current?.focus();
  }, [error, diagnose]);

  const sustained = attempts >= 3;
  const body =
    truth === "we-down"
      ? sustained
        ? "We’re still having trouble on our end — sorry. Nothing is lost; please give it a few minutes, or ask our staff."
        : "We’re having trouble on our end — it’s not your connection. Your order is safe; try again in a moment."
      : truth === "you-offline"
        ? "You look offline. Your order is safe — reconnect and try again."
        : sustained
          ? "This keeps failing — sorry. Your order is safe; give it a few minutes, or ask our staff."
          : "Something went wrong on our end. Your order is safe — try again.";

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
        <p aria-hidden style={{ fontSize: "var(--fs-display)", margin: 0 }}>
          🫖
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: "var(--fs-h2)", lineHeight: "var(--lh-snug)", margin: "10px 0 2px" }}
        >
          This screen didn’t load
        </h1>
        {/* Bilingual, per the v7.2 bar: every state speaks EN + MY, errors included. */}
        <p
          lang="my"
          style={{
            fontFamily: "var(--font-my)",
            lineHeight: "var(--lh-my)",
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
            margin: "0 0 6px",
          }}
        >
          ခဏလေး — ပြဿနာအနည်းငယ် ရှိနေပါသည်
        </p>
        <p
          style={{
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
            lineHeight: "var(--lh-normal)",
            margin: "0 0 18px",
          }}
        >
          {body}
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
