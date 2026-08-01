"use client";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { DegradedStrip } from "@mms/ui";
import { publishAuthPlaneStatus, useAuthPlaneStatus } from "@/lib/session-status";
import { useConnectionTruth } from "@/lib/useConnectionTruth";
import { useEffect, useState } from "react";

/**
 * W10a — the pre-session honesty strip: renders ONLY when AnonAuthGate has published `failed`
 * (anonymous sign-in itself is failing — the auth plane is down or unreachable), which previously
 * died in the console while every downstream surface sat in eternal-skeleton limbo. Mount once per
 * entry surface (home; the menu/grocery doors carry their own session recovery further in).
 *
 * The retry re-attempts the sign-in DIRECTLY (the gate only re-runs on route change): on success it
 * publishes `ok` and refreshes the route so sessionless SSR fallbacks self-heal.
 */
export function SessionUnavailableStrip() {
  const status = useAuthPlaneStatus();
  const { truth, diagnose } = useConnectionTruth();
  const router = useRouter();
  const [retryFailed, setRetryFailed] = useState(false);

  // Attribution: when the strip appears, ask the ONE probe whether it's us — so the copy below
  // never guesses. Fires only on the failed state (no probe on healthy visits).
  useEffect(() => {
    if (status === "failed") void diagnose();
  }, [status, diagnose]);

  if (status !== "failed") return null;

  return (
    <DegradedStrip
      onRetry={async () => {
        const supa = browserClient();
        // Pre-check BEFORE minting: another tab / the gate's next run may have recovered the
        // session already — signInAnonymously would mint a fresh anon user OVER it, orphaning any
        // state keyed to the recovered uid (pre-PR review). Reuse an existing session.
        const { data } = await supa.auth.getSession();
        // Belt-and-braces: auth-js normally refreshes (or nulls) an expired session, but treat a
        // stored-yet-expired one as NOT ok — publishing "ok" on a dead session would re-create the
        // exact silent-limbo this strip exists to end.
        const stored = data.session;
        const stillValid =
          !!stored?.user && (stored.expires_at == null || stored.expires_at * 1000 > Date.now());
        let ok = stillValid;
        if (!ok) {
          const { error } = await supa.auth.signInAnonymously();
          ok = !error;
        }
        if (ok) {
          // The strip unmounts on "ok" — park focus on the page heading FIRST so it doesn't drop
          // to <body> from the just-tapped Retry (WCAG 2.4.3; pre-PR review).
          const h = document.querySelector("main h1");
          if (h instanceof HTMLElement) {
            h.tabIndex = -1;
            h.focus({ preventScroll: true });
          }
          publishAuthPlaneStatus("ok");
          router.refresh();
        } else {
          setRetryFailed(true); // swaps the strip copy below — the role=status region announces it
          void diagnose();
        }
      }}
      style={{ margin: "0 20px 14px" }}
    >
      {truth === "you-offline"
        ? "You look offline — ordering needs a connection. Reconnect and try again."
        : truth === "we-down"
          ? "We’re having trouble on our end — ordering is briefly unavailable. It’s not your connection; your table and order are safe."
          : retryFailed
            ? "Still couldn’t start your session — sorry. Give it a minute and try again, or ask our staff."
            : "We couldn’t start your session just now — try again."}
    </DegradedStrip>
  );
}
