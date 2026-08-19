import { describe, expect, it } from "vitest";
import {
  buildRefundRows,
  lineRefundLabel,
  receiptStatusLabel,
  summarizeRefund,
} from "./refund-view";

/**
 * W23b — the receipt must never tell a guest they paid in full over money that came back.
 *
 * The defect this pins was a TYPE, not an arithmetic slip: `receiptStatusLabel` took a boolean, a
 * partial refund is a third state, and a boolean cannot express three states — so every
 * partially-refunded order printed "Paid in full · Card" with every line at full price. The fixtures
 * below therefore separate the three states on the ONE field that distinguishes them, so a guard
 * that collapses any two of them reddens here and only here.
 *
 * Amounts are chosen so no two are confusable: total 5200, refund 1400, net 3800 — the pairwise sums
 * and differences (6600 · 3800 · 1400) are all distinct, so a row that renders the wrong one cannot
 * accidentally match the right one.
 */
describe("summarizeRefund", () => {
  it("an unrefunded order is 'none', and its net is the whole total", () => {
    expect(summarizeRefund(5200, 0, "paid")).toEqual({
      state: "none",
      refundedCents: 0,
      netPaidCents: 5200,
    });
  });

  it("a part-returned order is 'partial', and the net is what the guest is out of pocket", () => {
    expect(summarizeRefund(5200, 1400, "paid")).toEqual({
      state: "partial",
      refundedCents: 1400,
      netPaidCents: 3800,
    });
  });

  it("status='refunded' is full even when refunded_cents is 0 — the legacy/dashboard row", () => {
    // A pre-W23b full refund, or one issued from the Stripe dashboard (which writes no ledger row),
    // carries the status with no amount. Reporting "$0.00 came back" would be a lie in the guest's
    // favour, and no less a lie for it — the whole total is what returned.
    expect(summarizeRefund(5200, 0, "refunded")).toEqual({
      state: "full",
      refundedCents: 5200,
      netPaidCents: 0,
    });
  });

  it("refunded_cents ≥ total is full BEFORE the status flip lands", () => {
    // mms_record_refund bumps the column inside its own transaction; the charge.refunded webhook
    // flips the status a beat later. In that window the receipt must not claim a PARTIAL refund on
    // an order that is entirely returned.
    expect(summarizeRefund(5200, 5200, "paid").state).toBe("full");
  });

  it("does not read a $0 order as fully refunded", () => {
    // `amount >= total` is trivially true at 0 ≥ 0. Guarding on `total > 0` is what stops a $0 order
    // (a fully comped table) from being stamped "Refunded" having never been charged anything.
    expect(summarizeRefund(0, 0, "paid").state).toBe("none");
  });

  it("floors a corrupt negative rather than reading it as a charge", () => {
    // The column carries a >= 0 CHECK so this cannot occur; if it ever did, the failure must not be
    // a receipt claiming the guest owes MORE than they were charged.
    expect(summarizeRefund(5200, -900, "paid")).toEqual({
      state: "none",
      refundedCents: 0,
      netPaidCents: 5200,
    });
  });

  it("never reports a negative net", () => {
    expect(summarizeRefund(5200, 9999, "paid").netPaidCents).toBe(0);
  });
});

describe("receiptStatusLabel", () => {
  const partial = summarizeRefund(5200, 1400, "paid");
  const full = summarizeRefund(5200, 5200, "paid");
  const none = summarizeRefund(5200, 0, "paid");

  it("never claims 'Paid in full' on a refunded order — partial or full", () => {
    expect(receiptStatusLabel(none, "terminal")).toBe("Paid in full · Card · reader");
    expect(receiptStatusLabel(full, "card")).toBe("Refunded — this charge was returned to you");
    expect(receiptStatusLabel(full, "card")).not.toContain("Paid");
    // The regression that shipped: a PARTIAL refund reading as "Paid in full".
    expect(receiptStatusLabel(partial, "card")).toBe("Partly refunded · Card");
    expect(receiptStatusLabel(partial, "card")).not.toContain("Paid in full");
  });

  it("keeps the tender on the partial line — the guest still paid something, on something", () => {
    expect(receiptStatusLabel(partial, "terminal")).toBe("Partly refunded · Card · reader");
  });

  it("carries no amount — the settle line states the state, the rows state the money", () => {
    expect(receiptStatusLabel(partial, "card")).not.toContain("14");
    expect(receiptStatusLabel(full, "card")).not.toContain("52");
  });
});

describe("buildRefundRows", () => {
  it("adds NOTHING to an unrefunded receipt", () => {
    // Every surface splices these rows in unconditionally, so the overwhelming case must be a no-op.
    expect(buildRefundRows(summarizeRefund(5200, 0, "paid"))).toEqual([]);
  });

  it("states what came back, then what the guest actually paid", () => {
    expect(buildRefundRows(summarizeRefund(5200, 1400, "paid"))).toEqual([
      { key: "refunded", label: "Refunded", amountCents: 1400, negative: true },
      { key: "net", label: "You paid", amountCents: 3800, grand: true },
    ]);
  });

  it("a full refund shows the whole amount back and $0 paid", () => {
    expect(buildRefundRows(summarizeRefund(5200, 5200, "paid"))).toEqual([
      { key: "refunded", label: "Refunded", amountCents: 5200, negative: true },
      { key: "net", label: "You paid", amountCents: 0, grand: true },
    ]);
  });

  it("marks the refunded row NEGATIVE — it renders with a leading −", () => {
    // Without the flag the row reads as another charge stacked on the total, which is the opposite
    // of what happened.
    expect(buildRefundRows(summarizeRefund(5200, 1400, "paid"))[0]!.negative).toBe(true);
  });
});

describe("lineRefundLabel", () => {
  it("says nothing for a line that was not refunded", () => {
    expect(lineRefundLabel(0)).toBeNull();
  });

  it("states the amount, so a clamped refund cannot overclaim", () => {
    // mms_refund_authorize clamps a line's refund to the order's remaining refundable pool, so a
    // line can come back for LESS than it cost. A strike-through would claim the whole dish
    // returned; the number never can.
    expect(lineRefundLabel(1400)).toBe("Refunded $14.00");
  });
});
