"use client";
import { useEffect, useState } from "react";
import { sessionPeekOutput, type SessionPeekOutput } from "@mms/db/schemas";
import { useAnonSession } from "./useAnonSession";

export type PeekSession = SessionPeekOutput["sessions"][number];

/**
 * W5a — the passive live-session peek (GET /api/session/peek) behind the home resume card and the
 * picker's "your table" state. Advisory + display-only: it never mints, never slides the TTL, and a
 * failed peek resolves to "no sessions" (the surfaces it powers simply don't render) — never an
 * error UI. Returns `null` while loading/unauthenticated, then the (possibly empty) session list.
 */
export function useSessionPeek(): PeekSession[] | null {
  const anon = useAnonSession();
  const [sessions, setSessions] = useState<PeekSession[] | null>(null);

  useEffect(() => {
    if (!anon) return;
    let active = true;
    const load = () => {
      fetch("/api/session/peek", {
        headers: { Authorization: `Bearer ${anon.accessToken}` },
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return sessionPeekOutput.parse(await r.json());
        })
        .then((d) => {
          if (active) setSessions(d.sessions);
        })
        .catch(() => {
          // Deliberate swallow: the peek is decorative (a resume card) — on an INITIAL failure the
          // card just doesn't render; the diner still has every door. But a failed RE-peek (tab
          // wake on flaky wifi) must NOT wipe a rendered card / flip "Your table" back to "Seated"
          // mid-view — keep the last-known-good list and let the next wake retry.
          if (active) setSessions((prev) => prev ?? []);
        });
    };
    load();
    // A bfcache restore (external-site back-nav) or a long-idle tab waking can render a FROZEN
    // card — "Table 5 is still open" after the party settled. Re-peek on those wakes (the J3
    // freshness pattern); an in-flight duplicate is harmless (last write wins, same source).
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) load();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [anon]);

  return sessions;
}
