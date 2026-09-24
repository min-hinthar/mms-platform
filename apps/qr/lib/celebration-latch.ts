/**
 * Phase 1c · account-star — "a resume is not an arrival" (§15), for the ONE path `resume=1` cannot
 * mark: the browser's own Back.
 *
 * Every link the app builds back to /track carries `resume=1` (lib/live-order.ts), so none of them
 * replays the pay celebration. But Stripe's return URL is the history entry, and a diner who goes
 * /track → /account (to save their Stars, now one tap away) → Back lands on that exact URL again:
 * PaySuccess remounts and replays the confetti, the celebrate haptic and the paid chime, for a
 * payment that moved no money this time. A reload does the same.
 *
 * So the first celebration writes a per-payment marker to sessionStorage (tab-scoped: a new tab or a
 * new visit is a new session and is not silenced), and a remount of the same payment reads it.
 * Both halves FAIL TOWARD "not celebrated": blocked storage celebrates exactly as before, which is
 * the only failure a diner could not tell from a bug.
 */
export function celebrationStorageKey(key: string): string {
  return `mms.celebrated:${key}`;
}

/** Has this payment already had its celebration in this tab? Any storage failure reads as no. */
export function hasCelebrated(store: Pick<Storage, "getItem"> | null, key: string): boolean {
  if (!store) return false;
  try {
    return store.getItem(celebrationStorageKey(key)) !== null;
  } catch {
    return false;
  }
}

/** Record that this payment has celebrated. A storage failure is swallowed — the next mount simply
 *  celebrates again, as it always did. */
export function markCelebrated(store: Pick<Storage, "setItem"> | null, key: string): void {
  if (!store) return;
  try {
    store.setItem(celebrationStorageKey(key), "1");
  } catch {
    /* deliberate: private mode / a full quota must never break the success screen */
  }
}

/** `window.sessionStorage`, or null where it does not exist (SSR) or its getter throws (a sandboxed
 *  frame, blocked site data). Reading the property itself can throw, so it is guarded too. */
export function safeSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
