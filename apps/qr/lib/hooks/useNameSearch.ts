"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { nameSearchPending, nameSearchStep } from "../name-search";

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/**
 * PD4 — the ONE name search behind Browse and the Name sheet: the query, its rows, and the radio.
 *
 * Lifted out of the grocery page by the blind pass on #329 @ f0d013f, which found two defects in the
 * page's effect that no test could reach, both from making `online` a dependency of the search:
 *
 *   · RECONNECT ANNOUNCED A FAILURE THAT NEVER HAPPENED. A query typed with the radio down was marked
 *     `searchFailed`; when the radio came back the sheet read "Search unavailable — please try
 *     again." about a search nobody sent, and its "Try again" hero stayed up through the real fetch.
 *     A held query is now HELD, not failed: no request, nothing marked failed, and the moment the
 *     radio returns it reads as on its way (`nameSearchPending`) and is sent once.
 *   · A RADIO DROP WIPED ROWS STILL ON SCREEN. The effect re-ran on every `offline` event and emptied
 *     the results — the rows a shopper can still tap to queue an add offline ("Already saved — we'll
 *     check it when you're back online"), and on Browse the row holding keyboard focus. The search
 *     now runs only when the QUERY changes or a retry asks; the radio dropping changes nothing on
 *     screen.
 *
 * All setState lives in timeout callbacks — never synchronously in an effect body (the
 * cascading-render lint).
 */
export function useNameSearch<H>(search: (q: string) => Promise<H[]>) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<H[] | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false); // a failed search ≠ an empty one
  /** The radio was down when this query was due: it was never sent, and goes when the radio is back. */
  const [held, setHeld] = useState(false);
  // "Try again" (and the reconnect) re-issue the SAME query: a nonce the search effect reads.
  const [nonce, setNonce] = useState(0);
  // The radio, live (the ScanStage reads it the same way): the Name sheet's offline state is
  // "Search needs a connection", not "unavailable".
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine !== false,
    () => true,
  );

  // The ONE way a query changes (Codex r1 on #329): the previous query's rows leave at once — a row
  // from "tea" must not be tappable under "durian" while the debounce waits — and "Searching…" shows
  // in the same render, only for a query that will actually be sent (lib/name-search.ts).
  const changeQuery = useCallback((q: string) => {
    setQuery(q);
    setHits(null);
    setSearchFailed(false);
    setHeld(false);
    setInFlight(nameSearchStep(q, navigator.onLine !== false) === "fetch");
  }, []);
  // The hero must not swap under the finger while the debounce waits (blind pass on #329):
  // "Searching…" turns on in the SAME render as the retry.
  const retry = useCallback(() => {
    setSearchFailed(false);
    setInFlight(true);
    setNonce((n) => n + 1);
  }, []);
  /** An emptied field — a sheet opening fresh, or Browse closing on an add. */
  const reset = useCallback(() => {
    setQuery("");
    setHits(null);
    setSearchFailed(false);
    setHeld(false);
  }, []);

  // Debounced: a query under 2 chars clears without a round-trip; otherwise 220 ms after the last
  // keystroke it is sent — or, with the radio KNOWN down (Codex on #329's head ff29547), held.
  // ⚠️ `online` is NOT a dependency, and the radio is read where the step is decided: a radio drop
  // must not re-run this and empty the rows on screen (the blind pass on #329 @ f0d013f).
  useEffect(() => {
    const q = query.trim();
    let active = true;
    const t = window.setTimeout(() => {
      if (!active) return;
      const step = nameSearchStep(q, navigator.onLine !== false);
      if (step === "clear") {
        setHits(null);
        setSearchFailed(false);
        setInFlight(false);
        setHeld(false);
        return;
      }
      if (step === "offline") {
        // Nothing sent, so nothing FAILED: Browse says its shipped "Search unavailable — please try
        // again.", the Name sheet "Search needs a connection", both off `held` and the radio.
        setHits([]);
        setInFlight(false);
        setHeld(true);
        return;
      }
      setHeld(false);
      setInFlight(true);
      search(q)
        .then((res) => {
          if (!active) return;
          setHits(res);
          setSearchFailed(false);
        })
        .catch(() => {
          if (!active) return;
          setHits([]);
          setSearchFailed(true); // a lookup failure, not a genuine zero-result search
        })
        .finally(() => active && setInFlight(false));
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [query, nonce, search]);

  // The radio is back with a query it held: send it, once. A query that was SENT and failed is not
  // re-sent here — it still says so, with "Try again" (m4 §H, item 8).
  const resend = held && online;
  useEffect(() => {
    if (!resend) return;
    const t = window.setTimeout(() => {
      setHeld(false);
      setInFlight(true);
      setNonce((n) => n + 1);
    }, 0);
    return () => window.clearTimeout(t);
  }, [resend]);

  return {
    query,
    hits,
    searching: nameSearchPending(inFlight, held, online),
    searchFailed,
    held,
    online,
    changeQuery,
    retry,
    reset,
  };
}
