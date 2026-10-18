import { describe, expect, it } from "vitest";
import {
  counterTender,
  refundArmCopy,
  settledFoot,
  settledSpoken,
  trackRefunded,
} from "./track-settled";
import { summarizeRefund } from "./refund-view";

/**
 * Lifecycle audit (2026-10-13), C and H — /track's terminal arms speak receipt-view's vocabulary.
 * The CLAUDE.md rule under test: a refunded order must never read "Paid in full". The case that broke
 * it: `mms_refund_cash_line` writes `refunded_cents` and leaves `status = 'paid'`, so the tracker's
 * `status === 'refunded'` arm never fired for a table refunded in cash.
 */
const cashRefundedInFull = summarizeRefund(4200, 4200, "paid");
const partly = summarizeRefund(4200, 1400, "paid");
const none = summarizeRefund(4200, 0, "paid");

describe("trackRefunded — the refund arm's ONE predicate is the refund state, not status", () => {
  it("fires for a cash refund to the last cent while status still reads 'paid'", () => {
    expect(cashRefundedInFull.state).toBe("full");
    expect(trackRefunded(cashRefundedInFull)).toBe(true);
  });
  it("fires for a status-flipped card refund, and not for a partial or no refund", () => {
    expect(trackRefunded(summarizeRefund(4200, 0, "refunded"))).toBe(true);
    expect(trackRefunded(partly)).toBe(false);
    expect(trackRefunded(none)).toBe(false);
  });
});

describe("settledSpoken — the live region never says 'in full' over a refund", () => {
  it("speaks the receipt's own line", () => {
    expect(settledSpoken(none, "cash")).toBe("Paid in full · Cash. Your table’s bill is paid.");
    // RED when the spoken line is the old constant "Paid in full — your table’s bill is paid."
    expect(settledSpoken(partly, "cash")).toBe(
      "Partly refunded · Cash. Your table’s bill is paid.",
    );
    expect(settledSpoken(partly, "cash")).not.toMatch(/in full/);
  });
});

describe("refundArmCopy — where the money went, by tender", () => {
  it("a CASH refund was handed back — never 'on its way' or a bank's 5–10 days", () => {
    const c = refundArmCopy("cash");
    expect(c.lead).toBe("Your money was handed back.");
    for (const s of [c.lead, c.body, c.spoken])
      expect(s).not.toMatch(/bank|business days|way back/);
  });
  it("a card or Terminal refund keeps W1c's shipped words, verbatim", () => {
    for (const tender of ["card", "terminal"]) {
      const c = refundArmCopy(tender);
      expect(c.lead).toBe("Your money is on its way back.");
      expect(c.body).toBe(
        "This order was refunded to your original payment method — banks typically post it within 5–10 business days.",
      );
    }
  });
});

describe("settledFoot — H, the receipt 'lives' only where it does", () => {
  it("a card order's receipt lives in the order history", () => {
    expect(settledFoot("Your table’s all settled", "card", false)).toBe(
      "Your table’s all settled — this receipt lives in your order history.",
    );
  });
  it("a COUNTER order is in no history (M206): the foot names the link, and only when it rendered", () => {
    for (const tender of ["cash", "terminal"]) {
      expect(counterTender(tender)).toBe(true);
      // RED when the counter arm falls through to "order history".
      expect(settledFoot("Your table’s all settled", tender, true)).toBe(
        "Your table’s all settled — keep your receipt with the link above.",
      );
      expect(settledFoot("You’re free to go", tender, false)).toBe("You’re free to go.");
    }
    expect(counterTender("card")).toBe(false);
  });
});
