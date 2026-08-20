/**
 * W22c — the pull-to-refresh gesture's physics and its arm threshold. PURE, so the curve and the
 * threshold can carry `verify:slice` mutants; `apps/qr/vitest.config.ts` is `environment: "node"`
 * with `include: ["**\/*.test.ts"]`, so a rule left in the `.tsx` could not be guarded at all.
 *
 * ⚠️ THE INDICATOR MOVES; THE PAGE DOES NOT. `/menu`'s `<main>` hosts two `position: fixed`
 * descendants — `PaperAmbient` (z:-1) and `CartBar` (the primary CTA). A `transform` on an ancestor
 * creates a containing block for fixed descendants, so translating the page for the pull would drag
 * the Add-to-cart bar off the bottom of the screen and crop the ambient. Same family as the
 * `isolation: isolate` rule W22a·depth learned on `PaperAmbient`'s host. This is why `pullTravel`
 * describes an INDICATOR offset and nothing else.
 */

/** Asymptote of the rubber band: the indicator never travels further than this, however hard the
 *  pull. Keeps the gesture from reading as "the page tore off". */
export const PULL_MAX_PX = 96;

/** Indicator travel at which the gesture arms. The curve below is its own inverse at the midpoint,
 *  so `pullTravel(96) === 48` exactly — and since the caller feeds it `dy - DEADZONE` (8px), arming
 *  takes **104px of finger movement**, not 96. Stated precisely because the first version of this
 *  comment said 96 and the deadzone falsified it. Computed, not chosen: a threshold a diner reaches
 *  by accident while scrolling a long menu is worse than none. */
export const PULL_TRIGGER_PX = 48;

/**
 * Finger distance → indicator travel. Asymptotic to `PULL_MAX_PX`, so the band gets stiffer the
 * further it is pulled and never runs away.
 *
 * Negative and zero return 0 rather than a negative offset: an upward drag is a scroll, not a pull,
 * and the caller only engages this once the scroller is already at the top.
 */
export function pullTravel(dy: number): number {
  return dy <= 0 ? 0 : dy / (1 + dy / PULL_MAX_PX);
}

/** Has the pull travelled far enough to fire on release? */
export function pullArmed(travel: number): boolean {
  return travel >= PULL_TRIGGER_PX;
}
