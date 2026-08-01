"use client";
import { useEffect, type CSSProperties } from "react";
import { OutageState } from "@mms/ui";

/**
 * W10b — the staff-voiced error boundary for every /staff route. Catches what the pages throw —
 * including the 503 "unavailable" AuthzErrors the staff reads now raise on an unreadable list
 * (listStaff, getStaffOrders, listPendingApprovals) — and renders operational truth instead of the
 * diner-voiced root boundary. Prod REDACTS server error messages (digest only), so the copy never
 * asserts a cause it can't see: it owns the failure, protects the sign-in ("you're not logged
 * out"), and names the fallback (paper). English-only (`titleMy={null}`) per the console's
 * convention; `reset()` re-renders the route in place, so recovery keeps the URL.
 */
export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[staff] route error boundary", error);
  }, [error]);

  return (
    <main style={wrap}>
      <OutageState
        focusOnMount
        headingLevel="h1"
        titleMy={null}
        title="This screen couldn’t load"
        body="It’s on our end — your sign-in is fine. Try again in a moment; if it keeps failing, take new orders on paper. Everything already recorded is safe."
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
