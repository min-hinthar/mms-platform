import { describe, expect, it } from "vitest";
import { DEFAULT_KDS_THRESHOLDS, kdsUrgency, shapeKdsThresholds } from "./kds-urgency";
import type { KdsThresholds } from "./kitchen-types";

/**
 * Phase 2b — kitchen lateness, named ONCE. `kdsUrgency` was a module-private `urgency()` inside
 * `KdsBoard.tsx`, and the thresholds' defaults a module-private constant inside `kitchen.ts` (a
 * "use server" module, which cannot export a value). The floor's wait pill (2d) needs both, so they
 * live here and every consumer imports them — nobody restates 8/12.
 *
 * The fixture thresholds are deliberately ASYMMETRIC (dine-in 8/12, pickup 2/4): with equal
 * thresholds the channel ternary could be swapped, crossed or dropped and every case would read the
 * same — a degenerate fixture that proves nothing about which channel reads which pair.
 */
const TH: KdsThresholds = {
  dineinAmberMin: 8,
  dineinRedMin: 12,
  pickupAmberMin: 2,
  pickupRedMin: 4,
  rechimeSec: 75,
};
const MIN = 60_000;

describe("kdsUrgency — which channel reads which thresholds", () => {
  it("a dine-in ticket five minutes old is ok; a pickup or scan-and-go ticket that old is red", () => {
    // MUTATION kds-urgency/channel-swapped: the ternary reads pickup for dine-in — dine-in at 5 min
    // crosses pickup's red (4) and reads red, so the first assertion goes red.
    expect(kdsUrgency("dinein", 5 * MIN, TH)).toBe("ok");
    expect(kdsUrgency("pickup", 5 * MIN, TH)).toBe("red");
    // scango ages on the PICKUP pair — the counter customer is standing there.
    expect(kdsUrgency("scango", 5 * MIN, TH)).toBe("red");
    expect(kdsUrgency("pickup", 3 * MIN, TH)).toBe("amber");
  });

  it("each edge is inclusive: exactly 8:00 is amber and exactly 12:00 is red", () => {
    // MUTATIONS kds-urgency/amber-edge-exclusive and kds-urgency/red-edge-exclusive: `>=` → `>` on
    // either edge — the ticket sitting exactly on the threshold reads one level too calm.
    expect(kdsUrgency("dinein", 8 * MIN - 1, TH)).toBe("ok");
    expect(kdsUrgency("dinein", 8 * MIN, TH)).toBe("amber");
    expect(kdsUrgency("dinein", 12 * MIN - 1, TH)).toBe("amber");
    expect(kdsUrgency("dinein", 12 * MIN, TH)).toBe("red");
  });
});

describe("shapeKdsThresholds — the config row, or the defaults", () => {
  it("a missing row is the defaults, 8/12/8/12/75", () => {
    expect(shapeKdsThresholds(null)).toStrictEqual({
      dineinAmberMin: 8,
      dineinRedMin: 12,
      pickupAmberMin: 8,
      pickupRedMin: 12,
      rechimeSec: 75,
    });
    expect(shapeKdsThresholds(undefined)).toStrictEqual(DEFAULT_KDS_THRESHOLDS);
  });

  it("a row maps field-for-field — every field a distinct value, so a crossed pair is visible", () => {
    // MUTATIONS kds-urgency/config-ignored (always the defaults) and kds-urgency/config-crossed
    // (dine-in ↔ pickup) — five distinct values make either change a different object.
    expect(
      shapeKdsThresholds({
        dinein_amber_min: 5,
        dinein_red_min: 9,
        pickup_amber_min: 3,
        pickup_red_min: 6,
        rechime_sec: 90,
      }),
    ).toStrictEqual({
      dineinAmberMin: 5,
      dineinRedMin: 9,
      pickupAmberMin: 3,
      pickupRedMin: 6,
      rechimeSec: 90,
    });
  });
});
