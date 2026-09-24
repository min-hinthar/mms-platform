import { describe, expect, it } from "vitest";
import { rewardJustUnlocked } from "./rewards-progress";

const at = (earned: boolean, stars: number | null, milestoneStep: number | null) =>
  rewardJustUnlocked({ earned, stars, milestoneStep });

describe("rewardJustUnlocked — the one 'this order unlocked a reward' rule", () => {
  it("unlocks exactly when the earner's post-order total lands on a milestone", () => {
    expect(at(true, 10, 5)).toBe(true);
    expect(at(true, 11, 5)).toBe(false);
  });

  it("a viewer who did not earn this order is never told they unlocked a reward", () => {
    expect(at(false, 10, 5)).toBe(false);
  });

  it("zero Stars is not a milestone — 0 % step === 0 must not unlock", () => {
    // MUTATION rewards-progress/unlock-at-zero-stars: drop `stars > 0` — a degenerate zeroed
    // summary (earned, stars 0) would claim "Reward unlocked!" at zero Stars; red.
    expect(at(true, 0, 5)).toBe(false);
  });

  it("an unavailable summary claims nothing", () => {
    expect(at(true, null, 5)).toBe(false);
    expect(at(true, 10, null)).toBe(false);
  });

  it("is the SAME rule PaySuccess computed inline before the move — equal on every boundary", () => {
    // The pre-move expression, copied from PaySuccess.tsx (base 0a1a5c6, :115-116) as the oracle.
    // The move is only safe if the two agree everywhere the inputs can reach, so this walks every
    // combination of the boundary values rather than a hand-picked few.
    const before = (earned: boolean, stars: number | null, milestoneStep: number | null) =>
      earned && stars != null && milestoneStep != null && stars > 0 && stars % milestoneStep === 0;
    const STARS = [null, -5, -1, 0, 1, 4, 5, 6, 9, 10, 11, 15];
    const STEPS = [null, 0, 1, 2, 5, 10];
    let compared = 0;
    for (const earned of [true, false])
      for (const stars of STARS)
        for (const step of STEPS) {
          expect(at(earned, stars, step)).toBe(before(earned, stars, step));
          compared++;
        }
    expect(compared).toBe(2 * STARS.length * STEPS.length);
  });
});
