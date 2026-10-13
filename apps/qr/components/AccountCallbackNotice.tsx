"use client";
import { useEffect, useState, type CSSProperties } from "react";
import {
  readCallbackOutcome,
  signedInCallbackMessage,
  stripCallbackParams,
} from "@/lib/oauth-callback";

/**
 * M214 — an OAuth bounce that lands on a SIGNED-IN /account.
 *
 * Every reader of the callback params lived inside `AccountUpgrade`, which /account renders only for
 * a guest. So when the round trip landed on a session the server already resolves as signed in (a
 * sign-in completed in another tab, a stale-tab reload), nothing said a word and the raw
 * `?error_code=…` stayed in the address bar — harmless to their data, but the page read as broken.
 * This is that diner's half: one plain line saying what is true, and the same strip the guest card
 * uses (`stripCallbackParams`), so the address bar is clean and the hub stays on You.
 *
 * The params come from the SERVER render (the page already holds them), so SSR and the first client
 * render agree, and the line is captured once — the strip's own `replaceState` propagates to
 * `useSearchParams` in Next, which would erase a live-derived line one frame after it appeared (the
 * defect AccountUpgrade's capture note records).
 *
 * Not a live region: it is the page's INITIAL content (nothing changes to announce), and the view's
 * regions belong to the cards beneath it.
 */
export function AccountCallbackNotice({
  errorCode,
  error,
}: {
  errorCode: string | null;
  error: string | null;
}) {
  const [message] = useState(() => signedInCallbackMessage(readCallbackOutcome(errorCode, error)));
  useEffect(() => {
    if (!message) return;
    window.history.replaceState(null, "", stripCallbackParams(window.location.href));
  }, [message]);
  if (!message) return null;
  return <p style={line}>{message}</p>;
}

const line: CSSProperties = {
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
  margin: "0 0 var(--s4)",
};
