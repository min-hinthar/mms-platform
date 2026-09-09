import { describe, expect, it } from "vitest";
import { classifyLiveIntent, offSessionChargeOutcome, supersedeOutcome } from "./live-intent";

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

describe("offSessionChargeOutcome — a transport failure is not a decline", () => {
  it("reports a real card decline as declined", () => {
    // The issuer answered. The money did not move, the table is free to take another tender.
    expect(offSessionChargeOutcome({ type: "StripeCardError", code: "card_declined" })).toBe(
      "declined",
    );
    expect(offSessionChargeOutcome({ type: "StripeCardError", code: "insufficient_funds" })).toBe(
      "declined",
    );
  });

  it("separates a card that needs SCA from one that was refused", () => {
    // Same class, different remedy — telling staff "declined" here sends them to ask for another
    // card when the guest simply has to confirm.
    expect(
      offSessionChargeOutcome({ type: "StripeCardError", code: "authentication_required" }),
    ).toBe("needs_action");
  });

  it.each([
    ["StripeConnectionError", null],
    ["StripeAPIError", null],
    ["StripeRateLimitError", "rate_limit"],
    // ⚠️ `StripeInvalidRequestError` + `resource_missing` WAS IN THIS LIST AND IS DELIBERATELY OUT
    // (Codex round 4 on #275, P2). The reversal is safe because the reason this list exists does not
    // reach that code: these arms are unknowable because the request may have REACHED Stripe and
    // succeeded while the response was lost. `resource_missing` is Stripe ANSWERING — it received
    // the create and rejected it, because the stored customer or payment method has been deleted.
    // No intent exists, so nothing can be captured later, and holding the settlement freeze on it
    // blocked every other tender for the full TTL over a charge that provably never happened. The
    // repo already trusts this exact code as definitive absence on the retrieve and cancel paths
    // (`split-hold.ts`, `supersedeSettlementIntent`); the create path was the odd one out. Any
    // OTHER invalid-request code stays unknown — only this one means "nothing was created".
    ["StripeInvalidRequestError", "parameter_invalid_empty"],
  ])("reports %s as UNKNOWN — it says nothing about whether the card was charged", (type, code) => {
    // THE DOUBLE-COLLECT CASE. The PaymentIntent is created with `confirm: true`, so it can be
    // captured while the response never arrives. Calling any of these a decline is how staff take
    // cash over a live charge; the succeeded webhook then writes a qr_refunds_needed row and the
    // guest waits on a manual refund.
    expect(offSessionChargeOutcome({ type, code })).toBe("unknown");
  });

  it("treats a missing type as unknown rather than assuming a decline", () => {
    // A non-Stripe throw (a bug in our own code, an aborted fetch) carries no type at all. The
    // safe reading of "I have no idea what this is" is never "the card was refused".
    expect(offSessionChargeOutcome({})).toBe("unknown");
    expect(offSessionChargeOutcome({ type: null, code: null })).toBe("unknown");
    // A card CODE without the card TYPE must not be enough — the code field is attacker-adjacent
    // (it is whatever the SDK put there) and the type is what Stripe classifies by.
    expect(offSessionChargeOutcome({ code: "card_declined" })).toBe("unknown");
  });
});

describe("offSessionChargeOutcome — a rejected REQUEST is a fact, not an ambiguity (Codex round 4)", () => {
  it("calls a deleted customer/payment method `no_method`, never `unknown`", () => {
    // `paymentIntents.create` answers `resource_missing` when the stored customer or payment method
    // is gone: no intent was created, so nothing can be captured later. Classifying that as
    // `unknown` made `closeSecureTab` HOLD the settlement freeze for the full TTL — blocking cash,
    // another card and cart edits — over a charge that provably never happened. The repo already
    // treats this code as definitive absence on the retrieve and cancel paths.
    expect(
      offSessionChargeOutcome({ type: "StripeInvalidRequestError", code: "resource_missing" }),
    ).toBe("no_method");
  });

  it("still refuses to guess at a genuine transport failure", () => {
    // The arm that must NOT widen. A reset, a 429, a 5xx or a timeout says nothing about whether the
    // charge landed — the intent was created with `confirm: true` and may be capturing right now.
    for (const code of ["rate_limit", "api_error", null]) {
      expect(offSessionChargeOutcome({ type: "StripeConnectionError", code })).toBe("unknown");
    }
  });

  it("leaves the issuer's own answers alone", () => {
    expect(offSessionChargeOutcome({ type: "StripeCardError", code: "card_declined" })).toBe(
      "declined",
    );
    expect(
      offSessionChargeOutcome({ type: "StripeCardError", code: "authentication_required" }),
    ).toBe("needs_action");
  });
});
