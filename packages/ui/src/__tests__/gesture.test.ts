import { describe, expect, it } from "vitest";
import { SAME_GESTURE_MS, removeHeld } from "../gesture";

/**
 * Phase 1c · cart-motion — the Stepper's remove-arm, value-falsified. The WIRING (the "−" arms it,
 * the Remove refuses inside it) is pinned by apps/qr's Checkout.test.tsx, which presses the real
 * Stepper; this file pins the rule the wiring reads.
 */
describe("removeHeld — a Remove that was a “−” a moment ago", () => {
  it("never holds a Remove that was never a “−” (it mounted at the minimum)", () => {
    // MUTATION: treat `null` as 0 — a Remove tapped within 350ms of page load is swallowed, red.
    expect(removeHeld(null, 100)).toBe(false);
  });

  it("holds strictly inside the window and releases AT its edge", () => {
    expect(removeHeld(1000, 1000 + SAME_GESTURE_MS - 1)).toBe(true);
    // MUTATION: `<` → `<=` — the tap exactly one window later is still swallowed, red.
    expect(removeHeld(1000, 1000 + SAME_GESTURE_MS)).toBe(false);
  });

  it("the window is Android's double-tap timeout plus a frame of headroom", () => {
    // 300ms (ViewConfiguration.DOUBLE_TAP_TIMEOUT) + one 16.7ms frame, rounded up to 350.
    expect(SAME_GESTURE_MS).toBe(350);
    expect(removeHeld(1000, 1349)).toBe(true);
    expect(removeHeld(1000, 1350)).toBe(false);
  });
});
