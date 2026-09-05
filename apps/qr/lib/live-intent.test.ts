import { describe, expect, it } from "vitest";
import { classifyLiveIntent, supersedeOutcome } from "./live-intent";

describe("classifyLiveIntent — what a successor may do to the intent the cart still names", () => {
  it("a charge that exists or is committed can never be cancelled by a successor", () => {
    // THE M151 CASE, in reverse. If either of these came back `cancelable`, a re-checkout would
    // cancel a capture that already happened and the guest would be charged with no order.
    expect(classifyLiveIntent("succeeded")).toBe("captured");
    expect(classifyLiveIntent("processing")).toBe("captured");
  });

  it("an unconfirmed intent, a pending 3DS, and an authorized hold are all cancelable", () => {
    expect(classifyLiveIntent("requires_payment_method")).toBe("cancelable");
    expect(classifyLiveIntent("requires_confirmation")).toBe("cancelable");
    expect(classifyLiveIntent("requires_action")).toBe("cancelable");
    // The hold: same diner, superseded era, capture already refused by the cron — one hold on the
    // card instead of two.
    expect(classifyLiveIntent("requires_capture")).toBe("cancelable");
  });

  it("an already-cancelled intent is dead — nothing to cancel, clear the link", () => {
    expect(classifyLiveIntent("canceled")).toBe("dead");
  });

  it("FAILS CLOSED on a status it has never seen", () => {
    // The two mistakes are not symmetric: cancelling a real charge is money and a missing order;
    // refusing a mint is a retry. A future Stripe status must land on the retry side.
    expect(classifyLiveIntent("requires_something_new")).toBe("captured");
    expect(classifyLiveIntent("")).toBe("captured");
  });
});

describe("supersedeOutcome — folding a cancel attempt into a verdict without guessing", () => {
  const base = { cancelled: false, code: null, statusAfter: null };

  it("a captured verdict refuses regardless of what the cancel did", () => {
    expect(supersedeOutcome({ ...base, verdict: "captured", cancelled: true })).toBe("captured");
  });

  it("a dead intent clears with no cancel needed", () => {
    expect(supersedeOutcome({ ...base, verdict: "dead" })).toBe("cleared");
  });

  it("a successful cancel clears", () => {
    expect(supersedeOutcome({ ...base, verdict: "cancelable", cancelled: true })).toBe("cleared");
  });

  it("a state refusal is re-read, and the re-read decides", () => {
    const refused = {
      verdict: "cancelable" as const,
      cancelled: false,
      code: "payment_intent_unexpected_state",
    };
    // Moved to captured between retrieve and cancel: the guest's card was charged in the gap.
    expect(supersedeOutcome({ ...refused, statusAfter: "succeeded" })).toBe("captured");
    expect(supersedeOutcome({ ...refused, statusAfter: "processing" })).toBe("captured");
    // Cancelled by someone else in the gap: nothing left to do.
    expect(supersedeOutcome({ ...refused, statusAfter: "canceled" })).toBe("cleared");
  });

  it("a state refusal with NO re-read, or one that still reads cancelable, is unknown — never cleared", () => {
    // ⚠️ The separating case. Rounding "Stripe refused but it still looks cancelable" down to
    // `cleared` would replace the pin under a live intent — M152(b) reintroduced through the
    // fix for it.
    expect(
      supersedeOutcome({
        verdict: "cancelable",
        cancelled: false,
        code: "payment_intent_unexpected_state",
        statusAfter: null,
      }),
    ).toBe("unknown");
    expect(
      supersedeOutcome({
        verdict: "cancelable",
        cancelled: false,
        code: "payment_intent_unexpected_state",
        statusAfter: "requires_payment_method",
      }),
    ).toBe("unknown");
  });

  it("a transport failure says nothing about the intent and is reported as nothing", () => {
    for (const code of ["rate_limit", "api_error", null, "some_new_code"]) {
      expect(
        supersedeOutcome({ verdict: "cancelable", cancelled: false, code, statusAfter: null }),
      ).toBe("unknown");
    }
  });

  it("a vanished intent clears — there is nothing left that could capture", () => {
    expect(
      supersedeOutcome({
        verdict: "cancelable",
        cancelled: false,
        code: "resource_missing",
        statusAfter: null,
      }),
    ).toBe("cleared");
  });
});
