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

/** A fully captured, unrefunded $52.00 charge — the fixture every rule but the refund rule reads. */
const FULL = { amount: 5200, amount_captured: 5200, amount_refunded: 0, refunded: false };
/** A refund list as `latest_charge.refunds` expands it. */
const refundList = (...rows: { amount: number; status: string }[]) => ({
  data: rows,
  has_more: false,
});
const intent = (
  over: Partial<RecoveryIntent> = {},
  meta: Record<string, string | undefined> = {},
): RecoveryIntent => ({
  id: PI,
  status: "succeeded",
  currency: "usd",
  metadata: { cartId: CART, earnerUid: PAYER, tipRate: "0.2", ...meta },
  latest_charge: FULL,
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

  // Codex on #365 @ a2636db (P1): a PaymentIntent stays `succeeded` after its charge is refunded,
  // and `charge.refunded` for a charge with no order leaves no row. An operator who refunds a
  // stranded charge in Stripe before recovery runs must not get an order fired for money that went
  // back.
  it.each([
    ["a full refund", { ...FULL, amount_refunded: 5200, refunded: true }],
    ["a PARTIAL refund (refunded stays false)", { ...FULL, amount_refunded: 100 }],
    ["refunded flagged with no amount yet", { ...FULL, refunded: true }],
  ])("%s on the charge is refused as refunded — never fulfilled", (_l, charge) => {
    expect(
      recoveryVerdict({
        intent: intent({ latest_charge: charge }),
        expect: guest,
        cart: openLinked,
      }),
    ).toEqual({ ok: false, refusal: "refunded" });
  });

  it.each([
    ["an unexpanded charge id", "ch_123"],
    ["no charge at all", null],
    ["a missing field", undefined],
    // A charge read without the fields the rule compares cannot say what was refunded.
    ["a charge without amount_captured", { amount: 5200, amount_refunded: 0, refunded: false }],
    ["a charge whose capture exceeds its amount", { ...FULL, amount_captured: 5300 }],
  ])("%s cannot prove no refund — refused, fail closed", (_l, latest_charge) => {
    expect(
      recoveryVerdict({
        intent: intent({ latest_charge }),
        expect: guest,
        cart: openLinked,
      }),
    ).toEqual({ ok: false, refusal: "charge_unread" });
  });

  /**
   * M160(b) blind pass on #365 @ 1b760cb (CRITICAL) — a PARTIALLY captured pickup hold (W23c: the
   * kitchen ran out, `amount_to_capture` < the hold). Stripe releases the uncaptured remainder, and
   * whether the charge reports that release in `amount_refunded` is not something the docs pin for
   * this API version — so the rule is written to be right either way: the remainder alone, with no
   * Refund object behind it, is NOT a refund; any money back out of what was CAPTURED is. Hold
   * $60.00, captured $52.00, remainder $8.00.
   */
  describe("a partially captured hold (amount_captured < amount)", () => {
    const PARTIAL = { amount: 6000, amount_captured: 5200, refunded: false };
    const pickup = (latest_charge: unknown) =>
      recoveryVerdict({
        intent: intent({ latest_charge } as Partial<RecoveryIntent>, { kind: "pickup_manual" }),
        expect: guest,
        cart: openLinked,
      });

    it("unrefunded, remainder NOT reported as refunded — recovers", () => {
      expect(pickup({ ...PARTIAL, amount_refunded: 0 })).toEqual({ ok: true });
    });

    it("unrefunded, remainder reported in amount_refunded with no Refund behind it — recovers", () => {
      expect(pickup({ ...PARTIAL, amount_refunded: 800, refunds: refundList() })).toEqual({
        ok: true,
      });
    });

    it("a FAILED refund in the list is not money back — still recovers", () => {
      expect(
        pickup({
          ...PARTIAL,
          amount_refunded: 800,
          refunds: refundList(
            { amount: 800, status: "failed" },
            { amount: 300, status: "canceled" },
          ),
        }),
      ).toEqual({ ok: true });
    });

    it("the remainder figure with its refund list UNREAD cannot be told apart — fail closed", () => {
      expect(pickup({ ...PARTIAL, amount_refunded: 800 })).toEqual({
        ok: false,
        refusal: "charge_unread",
      });
      expect(
        pickup({ ...PARTIAL, amount_refunded: 800, refunds: { ...refundList(), has_more: true } }),
      ).toEqual({ ok: false, refusal: "charge_unread" });
    });

    it("partially captured, then refunded beyond the remainder — refused", () => {
      expect(pickup({ ...PARTIAL, amount_refunded: 1300, refunds: refundList() })).toEqual({
        ok: false,
        refusal: "refunded",
      });
    });

    it("partially captured, then refunded EXACTLY the remainder's figure (a real Refund) — refused", () => {
      // amount_refunded == the remainder by coincidence; the Refund object says it is money back.
      expect(
        pickup({
          ...PARTIAL,
          amount_refunded: 800,
          refunds: refundList({ amount: 800, status: "succeeded" }),
        }),
      ).toEqual({ ok: false, refusal: "refunded" });
      expect(
        pickup({
          ...PARTIAL,
          amount_refunded: 800,
          refunds: refundList({ amount: 800, status: "pending" }),
        }),
      ).toEqual({ ok: false, refusal: "refunded" });
    });

    it("a fully captured charge reporting any refund is refused, list or no list", () => {
      expect(pickup({ ...FULL, amount_refunded: 800, refunds: refundList() })).toEqual({
        ok: false,
        refusal: "refunded",
      });
    });
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

  // Codex on #365 @ a2636db (P1): `closeSecureTab`'s off-session charge never names itself on the
  // cart's link — its binding is the settlement freeze it was minted under (`settle_by`, the
  // request-unique attempt stamped on the intent as `settleAttempt`).
  describe("a secure-tab close (bound by its settlement freeze, not the link)", () => {
    const ATTEMPT = "66666666-6666-4666-8666-666666666666";
    const tabMeta = { closedBy: "staff", settleAttempt: ATTEMPT, earnerUid: undefined };
    const staff = { cartId: CART, payerUid: null };
    const SETTLE_AT = "2026-10-18T12:00:00.000Z";
    const frozen = {
      status: "open",
      linkedIntent: null,
      settleBy: ATTEMPT,
      settleAt: SETTLE_AT,
      locked: false,
      lockedAt: null,
    };
    const verdict = (
      cart: Record<string, unknown>,
      meta: Record<string, string | undefined> = {},
    ) =>
      recoveryVerdict({
        intent: intent({}, { ...tabMeta, ...meta }),
        expect: staff,
        cart: cart as never,
      });

    it("an open cart still frozen under THIS attempt, naming no live intent, may be fulfilled", () => {
      expect(verdict(frozen)).toEqual({ ok: true });
    });

    it("a stale freeze still binds — a lost webhook outlives the 10-minute TTL by design", () => {
      expect(verdict({ ...frozen, settleAt: "2026-10-01T00:00:00.000Z" })).toEqual({ ok: true });
    });

    it("a pay lock that PREDATES the freeze does not unbind it", () => {
      expect(verdict({ ...frozen, locked: true, lockedAt: "2026-10-18T11:00:00.000Z" })).toEqual({
        ok: true,
      });
    });

    it.each([
      ["a LATER attempt holds the freeze", { settleBy: "77777777-7777-4777-8777-777777777777" }],
      ["the freeze was released", { settleBy: null, settleAt: null }],
      ["a live intent is linked (a guest's attempt took the cart)", { linkedIntent: "pi_guest" }],
      ["a pay lock taken AFTER the freeze", { locked: true, lockedAt: "2026-10-18T12:05:00.000Z" }],
      ["a pay lock that cannot be ordered against the freeze", { locked: true, lockedAt: null }],
      ["a freeze with no time on it", { settleAt: null }],
    ])("superseded when %s", (_l, over) => {
      expect(verdict({ ...frozen, ...over })).toEqual({ ok: false, refusal: "superseded" });
    });

    it("the freeze binds only a staff close's shape — a guest's intent with a forged attempt does not", () => {
      expect(verdict(frozen, { closedBy: undefined })).toEqual({
        ok: false,
        refusal: "superseded",
      });
    });

    it("a cart read with no freeze fields never binds by freeze", () => {
      expect(verdict({ status: "open", linkedIntent: null })).toEqual({
        ok: false,
        refusal: "superseded",
      });
    });
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
      "refunded",
      "charge_unread",
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
