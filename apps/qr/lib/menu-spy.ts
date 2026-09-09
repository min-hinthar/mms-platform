/**
 * M194 — should the scroll-spy adopt the category it just picked?
 *
 * ## The cost this exists to remove
 *
 * `MenuBrowser.jumpTo` sets the target tab and then smooth-scrolls to its section. A smooth scroll
 * crosses EVERY section between here and there, and the IntersectionObserver fires at each boundary
 * — so one tab tap ran `setActiveCat` about nine times mid-animation. Each of those re-rendered the
 * whole browser (the ~97-card grid is its child) AND re-ran the rail-centering effect, which takes
 * two `getBoundingClientRect()` — a forced synchronous layout, during a scroll — and restarts the
 * rail's own smooth scroll. The rail visibly flickered through every intermediate category on its
 * way to the one the diner asked for, which is also just wrong: they picked a destination, not a
 * tour.
 *
 * ## Why this is a module and not an `if` in the component
 *
 * `MenuBrowser.tsx` has no suite and sits outside `verify:slice`'s mutate set, so a rule written
 * there is guarded by nothing (the same reasoning as `cart-freeze.ts`'s "why this is a module"
 * note). This rule is a pure function of two strings, so it is falsified by a VALUE rather than by a
 * render plus a mocked IntersectionObserver — `lib/` first, per the W17 rule.
 *
 * ## The over-blocking hazard, and where it is handled
 *
 * Suppressing the spy is a gate, and the delivery repo has paid for a gate that was correct about
 * the case it named and disastrous for the valid one (`computeDeliveryGate`, where a bare
 * `!gate.isOpen` disabled Place Order for an entire valid window with no escape). The failure here
 * would be a latch that never clears: the target section may never CROSS the reading line at all —
 * the last category is short, the page bottoms out before its top reaches the toolbar — and the rail
 * would then freeze on a stale tab for the rest of the visit.
 *
 * So this function deliberately does NOT own the release. It answers only "is this pick the one we
 * are waiting for?", and the caller releases the latch three ways: on `arrive`, on a settle timeout,
 * and on the diner's own next scroll input. Two of those are unconditional, so a target that never
 * arrives costs at most one settle window, never a stuck rail.
 */
export type SpyAdoption =
  /** No jump in flight (or the pick is the one we awaited): take it. */
  | "adopt"
  /** The awaited target arrived — take it AND release the latch. */
  | "arrive"
  /** An intermediate section swept past during a programmatic jump: not a reading position. */
  | "ignore";

/**
 * @param pending the category a programmatic jump is scrolling toward, or `null` when the diner is
 *   scrolling under their own power.
 * @param picked  the category the spy computed from the section rects.
 */
export function spyAdoption(pending: string | null, picked: string): SpyAdoption {
  if (pending === null) return "adopt";
  return picked === pending ? "arrive" : "ignore";
}
