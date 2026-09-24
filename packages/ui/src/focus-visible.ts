/**
 * Phase 2b · feedback — did focus arrive the KEYBOARD way?
 *
 * `:focus-visible` is the browser's own heuristic: true after Tab (and after a programmatic focus
 * that follows a key press), false after a tap or a click — including Android's focus-on-tap. A
 * control that PAUSES a timer on focus (WCAG 2.2.1) must ask this, not listen for bare `focus`:
 * a touch tap would otherwise stall the very write the tap was about. An engine that cannot parse
 * the pseudo-class reads as "not keyboard" — the timer runs, which is the as-built behaviour.
 *
 * ONE matcher for the toast's action and the lane's in-slot Undo, so the two holds cannot disagree
 * about what a keyboard user is.
 */
export function matchesFocusVisible(el: { matches: (selector: string) => boolean }): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}
