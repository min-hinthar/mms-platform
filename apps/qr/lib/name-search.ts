/**
 * PD4 (Codex on #329's head `ff29547`) — the Name sheet's search, with the radio KNOWN to be down.
 *
 * The sheet read "offline" only off a COMPLETED empty result, but every keystroke resets the hits to
 * null — so a shopper typing with `navigator.onLine` already false saw "Searching…" and the page
 * still sent a request, leaving them to wait for the network stack to time out before "Search needs
 * a connection" appeared. Both halves are decided here, pure, so a value falsifies each:
 *
 *   · `nameSearchStep` — what the debounced search does: nothing to ask, no request while the radio
 *     is down (the page re-runs the step when it comes back), or fetch;
 *   · `nameSearchOffline` — the sheet's offline state: an asked query with no rows to show while the
 *     radio is down — at ONCE, never after a lookup fails.
 */
export type NameSearchStep = "clear" | "offline" | "fetch";

export function nameSearchStep(query: string, online: boolean): NameSearchStep {
  if (query.trim().length < 2) return "clear";
  return online ? "fetch" : "offline";
}

export function nameSearchOffline(
  asked: boolean,
  online: boolean,
  hits: readonly unknown[] | null,
): boolean {
  return asked && !online && (hits === null || hits.length === 0);
}

/**
 * PD4 (the blind pass on #329 @ f0d013f) — is a lookup ON ITS WAY? Either one is in flight, or a
 * query the radio held back (typed offline, never sent) is about to go now that the radio is back.
 * Reading only the in-flight flag left the reconnect render with nothing true to say, and the page
 * filled it with a failure that never happened ("Search unavailable") and a "Try again" hero that
 * stayed up through the real fetch.
 */
export function nameSearchPending(inFlight: boolean, held: boolean, online: boolean): boolean {
  return inFlight || (held && online);
}
