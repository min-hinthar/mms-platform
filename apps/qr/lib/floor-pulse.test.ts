import { describe, expect, it } from "vitest";
import { isRealTransition } from "./floor-pulse";

// Pins R9a's honesty invariant: the floor "just moved" ring fires on REAL transitions only — never on a
// passive TTL self-revert (fabricated liveness), but still on a real void/edit that lands on the same pair.
describe("isRealTransition", () => {
  const at = (status: string, activityMs: number) => ({ status, activityMs });

  it("no pulse when the status is unchanged", () => {
    expect(isRealTransition(at("ordering", 100), at("ordering", 200))).toBe(false);
  });

  it("pulses on forward transitions", () => {
    expect(isRealTransition(at("seated", 100), at("ordering", 100))).toBe(true);
    expect(isRealTransition(at("ordering", 100), at("paying", 100))).toBe(true);
    expect(isRealTransition(at("paying", 100), at("paid", 200))).toBe(true);
    expect(isRealTransition(at("settling", 100), at("paid", 200))).toBe(true);
  });

  it("SUPPRESSES a passive TTL self-revert (no new activity → fabricated liveness)", () => {
    // lock/split window elapsed; lastActivityAt unchanged.
    expect(isRealTransition(at("paying", 500), at("ordering", 500))).toBe(false);
    expect(isRealTransition(at("settling", 500), at("ordering", 500))).toBe(false);
    expect(isRealTransition(at("paying", 500), at("seated", 500))).toBe(false);
  });

  it("PULSES a real revert (a void/edit advanced lastActivityAt on the same status pair)", () => {
    expect(isRealTransition(at("paying", 500), at("ordering", 900))).toBe(true);
    expect(isRealTransition(at("settling", 500), at("seated", 900))).toBe(true);
  });

  it("pulses on a non-TTL revert pair even without an activity bump (real by construction)", () => {
    // settling→paying (payer switches split→solo) isn't a TTL self-revert pair → always real.
    expect(isRealTransition(at("settling", 100), at("paying", 100))).toBe(true);
  });
});
