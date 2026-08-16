import { describe, expect, it } from "vitest";
import { pickupContactMissing, validPickupPhone } from "./pickup-contact";

/**
 * W21 — the pickup contact gate (create-intent refuses a pickup payment until name + phone are
 * real). The client runs the same predicate, so these tests pin BOTH ends at once.
 */

describe("validPickupPhone — shape AND substance", () => {
  it.each(["6265550142", "(626) 555-0142", "+1 626 555 0142", "626-555-0142", "626.555.0142"])(
    "accepts a real number in common formats (%s)",
    (p) => {
      expect(validPickupPhone(p)).toBe(true);
    },
  );

  it("trims before judging — a pasted number with padding is fine", () => {
    expect(validPickupPhone("  6265550142  ")).toBe(true);
  });

  it.each(["", "   ", "call me", "555-0142x99", "626_555_0142"])(
    "refuses a non-number (%s)",
    (p) => {
      expect(validPickupPhone(p)).toBe(false);
    },
  );

  it("refuses separator-only strings that pass the SHAPE — the digit floor is the real rule", () => {
    // "-------" is 7 chars of the allowed class with ZERO digits; without the floor it parses.
    expect(validPickupPhone("-------")).toBe(false);
    expect(validPickupPhone("() () () ()")).toBe(false);
  });

  it("the digit floor's boundary belongs to the allowed side (7 digits pass, 6 fail)", () => {
    expect(validPickupPhone("5550142")).toBe(true);
    expect(validPickupPhone("555014")).toBe(false);
  });

  it("refuses past the 20-char transport bound (mirrors the column CHECK)", () => {
    expect(validPickupPhone("1".repeat(21))).toBe(false);
    expect(validPickupPhone("1".repeat(20))).toBe(true);
  });
});

describe("pickupContactMissing — ask order, one predicate for both ends", () => {
  it("names the FIRST missing thing, in field order", () => {
    expect(pickupContactMissing("", "")).toBe("name");
    expect(pickupContactMissing("   ", "6265550142")).toBe("name");
    expect(pickupContactMissing("Aye Aye", "")).toBe("phone");
    expect(pickupContactMissing("Aye Aye", "-------")).toBe("phone");
  });

  it("complete contact passes", () => {
    expect(pickupContactMissing("Aye Aye", "(626) 555-0142")).toBeNull();
  });
});
