/**
 * Phase 1c · cart-motion — ONE number for "the same gesture".
 *
 * A double-tap is two taps that land within the platform's double-tap window. Android's
 * `ViewConfiguration.DOUBLE_TAP_TIMEOUT` is 300ms; one frame of headroom, rounded, gives 350. Two
 * rules read this constant, and they must read the SAME one or they drift apart:
 *
 *  - the Stepper's remove-arm: a "−" that just turned into "Remove {name}" ignores taps for this
 *    long, so the second half of a double-tap on "−" at qty 2 can never delete the dish;
 *  - /cart's tap hold: whatever moved under a finger after a removal is held from taps for this
 *    long, so a quick second tap never lands on the next dish, a tip chip or the Pay CTA.
 *
 * Pure and dependency-free so the rule is falsified by a value, not a render.
 */
export const SAME_GESTURE_MS = 350;

/**
 * Is a Remove that was a "−" at `morphedAt` still inside the same gesture at `now`? `null` means the
 * Remove was never a "−" this stay (it mounted at the minimum), so nothing is held.
 */
export function removeHeld(morphedAt: number | null, now: number): boolean {
  return morphedAt !== null && now - morphedAt < SAME_GESTURE_MS;
}
