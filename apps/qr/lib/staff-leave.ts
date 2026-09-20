/**
 * M34 — the one way a staff board LEAVES for the login on its own poll's `signin` verdict.
 *
 * `window.location.assign`, not the router: a genuinely expired session must land on a fresh
 * document, and a soft navigation would carry the stale tree (the floor board's line since K10).
 * Its own module so a suite can PIN the exit: jsdom cannot navigate, and it reports the attempt
 * through a virtual console the test's `console` spy never sees (vitest replaces the console object
 * per test), so the only honest observation of "the board left" is a mock of this function.
 */
export function leaveForLogin(): void {
  window.location.assign("/staff/login");
}

/**
 * The exit for a `role` verdict: still signed in, no longer a manager. A fresh `/staff` re-renders
 * the counter without the manager zones — the honest surface, where the login would show a signed-in
 * staffer their own profile with no word why.
 */
export function leaveForHome(): void {
  window.location.assign("/staff");
}
