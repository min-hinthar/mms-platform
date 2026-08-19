import { describe, expect, it } from "vitest";
import { droppedLineNotice, manualCaptureMode, planCapture } from "./manual-capture";

/**
 * W23c — the authorization window (registry M69).
 *
 * Amounts are chosen so no two figures are confusable: authorized 5200, reduced 3800, difference
 * 1400. A plan that returns the wrong one of the three cannot accidentally match the right one.
 *
 * The asymmetry every rule here descends from: you can capture LESS than you authorized, never
 * more. That is what makes a shrunken basket safe and a grown one a refusal.
 */
describe("manualCaptureMode", () => {
  it("is pickup only", () => {
    expect(manualCaptureMode("pickup")).toBe(true);
    // Dine-in already settles after the meal — it has no window to close. Scan-and-go is goods the
    // shopper is holding; a hold on those is worse service, not better.
    expect(manualCaptureMode("dinein")).toBe(false);
    expect(manualCaptureMode("scango")).toBe(false);
    expect(manualCaptureMode("")).toBe(false);
  });
});

describe("planCapture", () => {
  it("captures the FULL authorization when nothing changed", () => {
    expect(planCapture(5200, 5200)).toEqual({
      action: "capture",
      amountCents: 5200,
      partial: false,
    });
  });

  it("captures the REDUCED total when a dish ran out — and marks it partial", () => {
    // The win: Stripe releases the uncaptured 1400 on its own, so the guest is charged 3800 and
    // never sees a refund, because there was never a charge to refund.
    expect(planCapture(5200, 3800)).toEqual({
      action: "capture",
      amountCents: 3800,
      partial: true,
    });
  });

  it("cancels rather than capturing when nothing survives", () => {
    expect(planCapture(5200, 0)).toEqual({ action: "cancel", reason: "nothing_left" });
  });

  it("cancels on a negative total too — a basket cannot owe the guest money", () => {
    expect(planCapture(5200, -100)).toEqual({ action: "cancel", reason: "nothing_left" });
  });

  it("REFUSES to capture more than was authorized, rather than clamping to the hold", () => {
    // Should be unreachable — voiding lines only shrinks a basket. Clamping would charge a number
    // nobody derived; Stripe would reject the over-capture anyway, and the point of deciding it here
    // is that the failure carries a reason instead of surfacing as an API error.
    expect(planCapture(5200, 5201)).toEqual({ action: "cancel", reason: "over_authorized" });
  });

  it("treats exactly-equal as full, not partial — the boundary is not a partial capture", () => {
    const plan = planCapture(5200, 5200);
    expect(plan.action).toBe("capture");
    expect(plan.action === "capture" ? plan.partial : null).toBe(false);
  });
});

describe("droppedLineNotice", () => {
  it("says nothing when nothing was dropped", () => {
    expect(droppedLineNotice([])).toBeNull();
  });

  it("names the dish and says the guest was NOT charged — never 'refunded'", () => {
    // A guest told "refunded" starts watching their statement for money that was never taken.
    const one = droppedLineNotice(["Mohinga"])!;
    expect(one).toContain("Mohinga");
    expect(one).toContain("weren’t charged");
    expect(one).not.toContain("refund");
  });

  it("lists several dishes readably, and agrees with itself grammatically", () => {
    expect(droppedLineNotice(["Mohinga", "Tea Leaf Salad"])).toBe(
      "Mohinga and Tea Leaf Salad ran out just as you ordered — they’re off your order and you weren’t charged for them.",
    );
    expect(droppedLineNotice(["A", "B", "C"])).toContain("A, B and C");
  });
});
