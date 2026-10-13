import { describe, expect, it } from "vitest";
import { PULL_MAX_PX, PULL_TRIGGER_PX, pullArmed, pullTravel } from "./pull-refresh";

describe("the rubber band", () => {
  it("arms at exactly 96px of finger travel", () => {
    // The curve is its own inverse at the midpoint, which is why the trigger is a computed number
    // rather than a chosen one. Values verified in a shell, never transcribed from prose.
    expect(pullTravel(96)).toBe(48);
    expect(pullArmed(pullTravel(96))).toBe(true);
    expect(pullArmed(pullTravel(95))).toBe(false);
  });

  it("stiffens rather than running away, and never passes the cap", () => {
    expect(pullTravel(24)).toBeCloseTo(19.2, 6);
    expect(pullTravel(48)).toBe(32);
    expect(pullTravel(200)).toBeCloseTo(64.8648648, 6);
    // A frantic pull still cannot tear the indicator off the screen.
    expect(pullTravel(10_000)).toBeLessThan(PULL_MAX_PX);
    expect(pullTravel(1e9)).toBeLessThan(PULL_MAX_PX);
  });

  it("is monotonic — every extra pixel of finger moves the indicator forward", () => {
    // Without this a diner could pull further and watch the indicator retreat, which reads as the
    // gesture failing. Guards against an easy sign error in the denominator.
    let prev = -1;
    for (let dy = 0; dy <= 400; dy += 7) {
      const t = pullTravel(dy);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it("treats an upward drag as no pull at all", () => {
    // The caller only engages at scrollTop 0, but a downward-then-upward drag crosses zero mid-gesture
    // and must not produce a negative offset (which would push the indicator up behind the header).
    expect(pullTravel(0)).toBe(0);
    expect(pullTravel(-1)).toBe(0);
    expect(pullTravel(-500)).toBe(0);
    expect(pullArmed(pullTravel(-500))).toBe(false);
  });

  it("keeps the trigger comfortably below the cap", () => {
    // If the trigger ever met the cap, the band would have to be pulled infinitely far to arm.
    expect(PULL_TRIGGER_PX).toBeLessThan(PULL_MAX_PX);
  });
});
