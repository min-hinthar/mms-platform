import { describe, expect, it } from "vitest";
import {
  checkPaymentSays,
  fulfillAnswer,
  isCartIdShape,
  isRecoverableKind,
  recoveryVerdict,
  refusalAnswer,
  sweepWindow,
  trackRecoveryShows,
  TRACK_RECOVERY_ASK_MS,
  type RecoveryAnswer,
  type RecoveryIntent,
} from "./payment-recovery-verdict";

/**
 * M160(b) — every rule a recovery door must clear before it may fulfill, falsified one at a time.
 * The fixture is a recoverable intent; each case breaks exactly one fact and asserts the refusal
 * that fact earns — so a mutant that drops a rule turns exactly its own case red.
 */
const CART = "22222222-2222-4222-8222-222222222222";
const OTHER_CART = "33333333-3333-4333-8333-333333333333";
const PAYER = "payer-uid-1";
const PI = "pi_live_1";

const intent = (
  over: Partial<RecoveryIntent> = {},
  meta: Record<string, string | undefined> = {},
): RecoveryIntent => ({
  id: PI,
  status: "succeeded",
  currency: "usd",
  metadata: { cartId: CART, earnerUid: PAYER, tipRate: "0.2", ...meta },
  ...over,
});
const guest = { cartId: CART, payerUid: PAYER };
const openLinked = { status: "open", linkedIntent: PI };

describe("recoveryVerdict", () => {
  it("a succeeded, bound, linked intent may be fulfilled", () => {
    expect(recoveryVerdict({ intent: intent(), expect: guest, cart: openLinked })).toEqual({
      ok: true,
    });
  });

  it.each([
    "requires_payment_method",
    "requires_action",
    "processing",
    "requires_capture",
    "canceled",
  ])("Stripe's %s is NOT succeeded — nothing charged that an order could record", (status) => {
    expect(
      recoveryVerdict({ intent: intent({ status }), expect: guest, cart: openLinked }),
    ).toEqual({ ok: false, refusal: "not_succeeded" });
  });

  it.each(["split_share", "terminal", "something_new"])(
    "a %s intent is another path's (or unknown) — refused, never fulfilled here",
    (kind) => {
      expect(
        recoveryVerdict({ intent: intent({}, { kind }), expect: guest, cart: openLinked }),
      ).toEqual({ ok: false, refusal: "unsupported_kind" });
    },
  );

  it("a captured pickup hold (pickup_manual, now succeeded) IS recoverable", () => {
    expect(
      recoveryVerdict({
        intent: intent({}, { kind: "pickup_manual" }),
        expect: guest,
        cart: openLinked,
      }),
    ).toEqual({ ok: true });
  });

  it("a non-dollar charge is refused", () => {
    expect(
      recoveryVerdict({ intent: intent({ currency: "eur" }), expect: guest, cart: openLinked }),
    ).toEqual({ ok: false, refusal: "wrong_currency" });
  });

  it("metadata naming ANOTHER cart is unbound", () => {
    expect(
      recoveryVerdict({
        intent: intent({}, { cartId: OTHER_CART }),
        expect: guest,
        cart: openLinked,
      }),
    ).toEqual({ ok: false, refusal: "unbound" });
  });

  it("metadata with no cart (or a non-uuid one) is unbound", () => {
    for (const cartId of [undefined, "not-a-uuid"])
      expect(
        recoveryVerdict({ intent: intent({}, { cartId }), expect: guest, cart: openLinked }),
      ).toEqual({ ok: false, refusal: "unbound" });
  });

  it("a guest can only recover THEIR OWN payment: another payer's intent is unbound", () => {
    expect(
      recoveryVerdict({
        intent: intent({}, { earnerUid: "someone-else" }),
        expect: guest,
        cart: openLinked,
      }),
    ).toEqual({ ok: false, refusal: "unbound" });
  });

  it("staff and the cron assert no payer, so any payer's intent on the cart passes that rule", () => {
    expect(
      recoveryVerdict({
        intent: intent({}, { earnerUid: "someone-else" }),
        expect: { cartId: CART, payerUid: null },
        cart: openLinked,
      }),
    ).toEqual({ ok: true });
  });

  it("a cart that does not exist here is no_cart", () => {
    expect(recoveryVerdict({ intent: intent(), expect: guest, cart: null })).toEqual({
      ok: false,
      refusal: "no_cart",
    });
  });

  it("an OPEN cart linking a DIFFERENT intent is superseded (M151) — never fulfilled", () => {
    expect(
      recoveryVerdict({
        intent: intent(),
        expect: guest,
        cart: { status: "open", linkedIntent: "pi_successor" },
      }),
    ).toEqual({ ok: false, refusal: "superseded" });
  });

  it("an OPEN cart linking NOTHING is superseded too — nothing proves this intent is current", () => {
    expect(
      recoveryVerdict({
        intent: intent(),
        expect: guest,
        cart: { status: "open", linkedIntent: null },
      }),
    ).toEqual({ ok: false, refusal: "superseded" });
  });

  it.each(["cancelled", "paid"])(
    "a %s cart passes the link rule — the shared fulfillment records the charge as refund-needed",
    (status) => {
      expect(
        recoveryVerdict({ intent: intent(), expect: guest, cart: { status, linkedIntent: null } }),
      ).toEqual({ ok: true });
    },
  );
});

describe("the answers", () => {
  it("only not_succeeded is said as not_paid; every other refusal is refused", () => {
    expect(refusalAnswer("not_succeeded")).toEqual({ kind: "not_paid" });
    for (const r of [
      "unsupported_kind",
      "wrong_currency",
      "unbound",
      "no_cart",
      "superseded",
    ] as const)
      expect(refusalAnswer(r)).toEqual({ kind: "refused" });
  });

  it("an order written or on record is recorded; a charge with no order is NEVER recorded", () => {
    expect(fulfillAnswer({ kind: "fulfilled", orderId: "o" })).toEqual({ kind: "recorded" });
    expect(fulfillAnswer({ kind: "already_recorded", orderId: "o" })).toEqual({ kind: "recorded" });
    expect(fulfillAnswer({ kind: "settled_elsewhere", cartStatus: "cancelled" })).toEqual({
      kind: "refund_needed",
    });
    expect(fulfillAnswer({ kind: "amount_mismatch", cartCents: 1, capturedCents: 2 })).toEqual({
      kind: "refund_needed",
    });
    expect(fulfillAnswer({ kind: "no_cart_metadata" })).toEqual({ kind: "refused" });
    expect(fulfillAnswer({ kind: "retry", step: "fulfill" })).toEqual({ kind: "error" });
  });

  it("staff's sentence follows the answer exactly — 'went through' for recorded alone", () => {
    const all: RecoveryAnswer["kind"][] = [
      "recorded",
      "not_paid",
      "refund_needed",
      "refused",
      "nothing",
      "wait",
      "error",
    ];
    const keys = all.map((kind) => checkPaymentSays({ kind } as RecoveryAnswer));
    expect(keys).toEqual([
      "settle.check.recorded",
      "settle.check.notPaid",
      "settle.check.refund",
      "settle.check.refused",
      "settle.check.nothing",
      "settle.check.wait",
      "settle.check.error",
    ]);
  });

  it("/track changes only on recorded (re-read) and refund_needed (stranded)", () => {
    expect(trackRecoveryShows({ kind: "recorded" })).toBe("refresh");
    expect(trackRecoveryShows({ kind: "refund_needed" })).toBe("stranded");
    for (const kind of ["not_paid", "refused", "nothing", "wait", "error"] as const)
      expect(trackRecoveryShows({ kind })).toBeNull();
  });
});

describe("the bounds", () => {
  it("the sweep window is in Stripe's seconds, from lookback to min-age", () => {
    // 2026-10-18T12:00:00Z, a day back, three minutes clear of the webhook.
    const now = Date.UTC(2026, 9, 18, 12, 0, 0);
    expect(sweepWindow(now, 24 * 3600_000, 3 * 60_000)).toEqual({
      gte: Date.UTC(2026, 9, 17, 12, 0, 0) / 1000,
      lte: Date.UTC(2026, 9, 18, 11, 57, 0) / 1000,
    });
  });

  it("/track asks twice: past the webhook's 1–2 s, and past the ~30 s give-up", () => {
    expect(TRACK_RECOVERY_ASK_MS).toEqual([12_000, 40_000]);
  });

  it("the kind rule and the id shape", () => {
    expect(isRecoverableKind(undefined)).toBe(true);
    expect(isRecoverableKind("pickup_manual")).toBe(true);
    expect(isRecoverableKind("terminal")).toBe(false);
    expect(isCartIdShape(CART)).toBe(true);
    expect(isCartIdShape(`${CART}x`)).toBe(false);
    expect(isCartIdShape("")).toBe(false);
  });
});
