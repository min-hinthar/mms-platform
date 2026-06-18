"use client";
import { useEffect, useState } from "react";
import { browserClient } from "@mms/db";

export type AnonSession = { accessToken: string; seat: string };

/**
 * The diner's anonymous-auth session, surfaced to client code. `seat` is `auth.uid()` (the stable
 * presence key — no ghosts; see LEARNINGS), `accessToken` is what Realtime (`setAuth`) and any
 * `Authorization: Bearer` fetch (e.g. POST /api/session) authorize with. Tracks token refreshes
 * via `onAuthStateChange`. Returns `null` until the session exists (AnonAuthGate establishes it).
 */
export function useAnonSession(): AnonSession | null {
  const [session, setSession] = useState<AnonSession | null>(null);

  useEffect(() => {
    const supa = browserClient();
    let active = true;
    const apply = (s: { access_token: string; user: { id: string } } | null) => {
      if (active) setSession(s ? { accessToken: s.access_token, seat: s.user.id } : null);
    };
    supa.auth.getSession().then(({ data }) => apply(data.session));
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((_event, s) => apply(s));
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return session;
}
