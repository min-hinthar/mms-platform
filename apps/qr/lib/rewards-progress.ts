/**
 * Phase 1c · account-star — the ONE "did this order unlock a reward?" rule.
 *
 * Moved VERBATIM out of `PaySuccess` (where it was computed inline), because a second surface now
 * quotes it: the save-your-Stars card on /track says "the reward you just unlocked" in the same
 * breath as PaySuccess's "Reward unlocked!". Two copies of one derivation is how those two claims
 * would eventually disagree on one screen — the W17 "name it ONCE" rule — so both read this binding.
 *
 * The rule itself is unchanged: the reward is issued server-side when a paid order completes a
 * milestone cycle, so the viewer's post-order total landing on a multiple of the step IS the unlock.
 * Gated on `earned` (only the order's earner — a split share-payer earned nothing) and on `stars > 0`
 * (0 % step === 0, so without it a degenerate zeroed summary would claim a reward at zero Stars).
 *
 * Pure: types only, no I/O.
 */
export function rewardJustUnlocked({
  earned,
  stars,
  milestoneStep,
}: {
  /** Did THIS viewer earn this order's Star? (`starsEarned > 0` / `earnedThisOrder`). */
  earned: boolean;
  /** The viewer's total Stars AFTER this order; null = summary unavailable. */
  stars: number | null;
  /** Reward cadence (Stars per reward); null = summary unavailable. */
  milestoneStep: number | null;
}): boolean {
  return (
    earned && stars != null && milestoneStep != null && stars > 0 && stars % milestoneStep === 0
  );
}
