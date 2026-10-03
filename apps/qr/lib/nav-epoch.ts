/**
 * Codex round 2 on 3b (#312) — the moment a navigation STARTS, as one monotonic counter.
 *
 * Every continuation that queues a push behind a write barrier (the Order tab's drain, CartBar's
 * `settled()`, the market's checkout) must drop its push when the diner has meanwhile left by another
 * door. Round 1 keyed that on the ROUTE (`usePathname()` / an unmount), but the route moves only when
 * the new one COMMITS: `TransitionLink` starts the transition router on the click, and until the
 * commit `usePathname()` still reports the old route, so a drain resolving in that window pushed
 * anyway and yanked the diner to the checkout. The grammar therefore records that a navigation has
 * STARTED, synchronously, through each of its doors — `TransitionLink`'s in-tab click,
 * `useJourneyRouter().push`, the browser's Back — and a continuation compares the epoch it captured
 * at the tap with the current one. One module-level counter, never React state: it must be readable
 * from inside a resolved promise with no render in between.
 */
let epoch = 0;

export const navEpoch = {
  /** A navigation is starting. Returns the new epoch. */
  bump: (): number => ++epoch,
  /** The epoch now; a continuation captures this at the tap and re-reads it when its barrier resolves. */
  current: (): number => epoch,
};
