"use client";
import { useEffect, useState, type CSSProperties } from "react";
import posthog from "posthog-js";
import { OutageState } from "@mms/ui";
import { bumpErrorCount, tryChunkReload } from "@/lib/error-recovery";

/**
 * W10b — the staff-voiced error boundary for every /staff route. Catches what the pages throw —
 * including the 503 "unavailable" AuthzErrors the staff reads now raise on an unreadable list
 * (listStaff, getStaffOrders, listPendingApprovals) — and renders operational truth instead of the
 * diner-voiced root boundary. Prod REDACTS server error messages (digest only), so the copy never
 * asserts a cause it can't see: it owns the failure, protects the sign-in ("you're not logged
 * out"), and names the fallback (paper). English-only (`titleMy={null}`) per the console's
 * convention; `reset()` re-renders the route in place, so recovery keeps the URL.
 *
 * A segment boundary SHADOWS the root one, so it must carry the root's recovery itself (pre-merge
 * review, HIGH): the stale-deploy chunk reload — `reset()` would just re-request the dead chunk URL
 * and loop — and the explicit capture React's boundary swallows. Both are shared via
 * lib/error-recovery. This matters most HERE: the KDS/expo tablets are the longest-lived tabs in
 * the building, so they are the likeliest to be holding chunk URLs a deploy has replaced.
 */
export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Lazy init, not an effect (the setState-in-effect lint): one bump per boundary mount.
  const [attempts] = useState(() => bumpErrorCount());
  useEffect(() => {
    posthog.captureException(error);
    if (tryChunkReload(error)) return; // navigating away — the shell below never paints
  }, [error]);

  // Sustained failure stops promising "in a moment" — the same escalation shape as the root
  // boundary and the frozen boards, in the console's voice.
  const sustained = attempts >= 3;

  return (
    <main style={wrap}>
      <OutageState
        focusOnMount
        headingLevel="h1"
        titleMy={null}
        title="This screen couldn’t load"
        body={
          sustained
            ? "This keeps failing — your sign-in is fine, it’s on our end. Take new orders on paper; everything already recorded is safe."
            : "It’s on our end — your sign-in is fine. Try again in a moment; if it keeps failing, take new orders on paper. Everything already recorded is safe."
        }
        escalatedBody="Still failing — keep running on paper. Nothing recorded is lost; this screen comes back as soon as our side does."
        onRetry={reset}
        exit={
          <a href="/staff" style={exitLink}>
            ← Back to the floor
          </a>
        }
      />
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "var(--s8) var(--s6)",
};
const exitLink: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  textDecoration: "none",
};
