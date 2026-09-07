"use client";
import { useEffect, useState, type CSSProperties } from "react";
import posthog from "posthog-js";
import { OutageState } from "@mms/ui";
import { bumpErrorCount, tryChunkReload } from "@/lib/error-recovery";
import { Chrome } from "@/components/staff/Chrome";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
import { useStaffLang } from "@/components/staff/StaffLangProvider";

/**
 * W10b — the staff-voiced error boundary for every /staff route. Catches what the pages throw —
 * including the 503 "unavailable" AuthzErrors the staff reads now raise on an unreadable list
 * (listStaff, getStaffOrders, listPendingApprovals) — and renders operational truth instead of the
 * diner-voiced root boundary. Prod REDACTS server error messages (digest only), so the copy never
 * asserts a cause it can't see: it owns the failure, protects the sign-in ("you're not logged
 * out"), and names the fallback (paper). `reset()` re-renders the route in place, so recovery keeps
 * the URL.
 *
 * A segment boundary SHADOWS the root one, so it must carry the root's recovery itself (pre-merge
 * review, HIGH): the stale-deploy chunk reload — `reset()` would just re-request the dead chunk URL
 * and loop — and the explicit capture React's boundary swallows. Both are shared via
 * lib/error-recovery. This matters most HERE: the KDS/expo tablets are the longest-lived tabs in
 * the building, so they are the likeliest to be holding chunk URLs a deploy has replaced.
 *
 * P7·2 — it speaks the device language, the way `StaffOutageShell` does: every sentence through
 * `<Chrome>` (`out.err.*`), the retry pair the shell's own, and it MOUNTS THE LANGUAGE CONTROL,
 * because it is a takeover — the page it replaces took its bar with it, and this is exactly the
 * screen where a person who cannot read English needs the switch most. The language comes from the
 * provider: `app/staff/error.tsx` renders INSIDE `app/staff/layout.tsx` (a segment boundary catches
 * its page, never its own layout), so `useStaffLang()` always has one.
 *
 * The way out is the DOORS by name (`?doors=1` wins over a remembered door), as a hard link: the
 * router may be the thing that failed.
 */
export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const lang = useStaffLang();
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
    <main className="staff-main">
      <div className="staff-col" style={wrap}>
        {/* Above the card, trailing edge — the shell's placement: the control is the one thing on
            this screen that still works, and it must not sit between the focused heading and Retry. */}
        <div style={switchRow}>
          <StaffLangSwitch lang={lang} />
        </div>
        <OutageState
          focusOnMount
          headingLevel="h1"
          titleMy={null}
          title={<Chrome lang={lang} k="out.err.title" echo="stack" />}
          body={
            <Chrome
              lang={lang}
              k={sustained ? "out.err.bodySustained" : "out.err.body"}
              echo="stack"
            />
          }
          escalatedBody={<Chrome lang={lang} k="out.err.escalated" echo="stack" />}
          retryLabel={<Chrome lang={lang} k="out.shell.retry" echo="stack" />}
          retryBusyLabel={<Chrome lang={lang} k="out.shell.retrying" echo="stack" />}
          onRetry={reset}
          exit={
            <a href="/staff?doors=1" className="staff-back staff-press">
              <Chrome lang={lang} k="out.err.back" />
            </a>
          }
        />
      </div>
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 640, paddingTop: "var(--s4)" };
const switchRow: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginBottom: "var(--s4)",
};
