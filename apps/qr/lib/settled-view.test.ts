import { describe, expect, it } from "vitest";
import { STAFF } from "./i18n/staff";
import { fill } from "./i18n/fill";
import { buildReceiptRows, fulfillmentLabel, tenderLabel } from "./receipt-view";
import {
  buildRefundRows,
  receiptStatusLabel,
  refundChipLabel,
  summarizeRefund,
} from "./refund-view";
import {
  GROUP_KEY,
  REFUND_REASONS,
  REFUND_REASON_KEY,
  RECEIPT_ROW_KEY,
  TENDER_KEY,
  groupKey,
  receiptRowKey,
  settledChipKey,
  settledClock,
  settledStatusKey,
  tenderKey,
} from "./settled-view";
import { refundLineInput } from "@mms/db/schemas";

/**
 * A4·3 · M204 — the settled list reads the receipt, and its bilingual half must say what the
 * receipt says. Every English value here is pinned to the receipt derivation it stands in for, so
 * a reworded artifact row reddens this suite instead of the two surfaces drifting apart.
 */
describe("settled-view — the dictionary mirrors the receipt", () => {
  it("every receipt row the artifact can produce has a key whose EN is the row's own label", () => {
    // A breakdown that charges every row, on a partially refunded order — all eight rows at once.
    const rows = [
      ...buildReceiptRows(
        {
          subtotalCents: 4000,
          discountCents: 400,
          serviceChargeCents: 180,
          taxCents: 300,
          tipCents: 700,
        },
        4780,
      ),
      ...buildRefundRows(summarizeRefund(4780, 1000, "paid")),
    ];
    expect(rows.map((r) => r.key).sort()).toEqual(Object.keys(RECEIPT_ROW_KEY).sort());
    for (const r of rows) {
      const k = receiptRowKey(r);
      expect(k, r.key).not.toBeNull();
      // The ONE deliberate exception: the artifact's "You paid" addresses the guest; the manager's
      // screen names the guest instead. Every other row is the receipt's own word.
      if (r.key === "net") expect(STAFF[k!].en).toBe("Guest paid");
      else expect(STAFF[k!].en, r.key).toBe(r.label);
    }
    expect(receiptRowKey({ key: "nope", label: "?", amountCents: 0 })).toBeNull();
  });

  it("every tender the receipt names has a key whose EN is `tenderLabel`'s word", () => {
    for (const t of Object.keys(TENDER_KEY)) {
      const k = tenderKey(t);
      expect(k, t).not.toBeNull();
      expect(STAFF[k!].en, t).toBe(tenderLabel(t));
    }
    expect(tenderKey("bitcoin")).toBeNull();
  });

  it("every destination heading the receipt can print has a key whose EN is `fulfillmentLabel`'s word", () => {
    for (const f of Object.keys(GROUP_KEY)) {
      const k = groupKey(f);
      expect(k, f).not.toBeNull();
      expect(STAFF[k!].en, f).toBe(fulfillmentLabel(f));
    }
    expect(groupKey("delivery")).toBeNull();
  });

  it("the paid and partly-refunded status lines are `receiptStatusLabel` word for word", () => {
    for (const tender of ["card", "cash", "terminal"]) {
      const x = tenderLabel(tender);
      const none = summarizeRefund(2000, 0, "paid");
      const partial = summarizeRefund(2000, 500, "paid");
      expect(fill(STAFF[settledStatusKey(none)].en, { x }, "en")).toBe(
        receiptStatusLabel(none, tender),
      );
      expect(fill(STAFF[settledStatusKey(partial)].en, { x }, "en")).toBe(
        receiptStatusLabel(partial, tender),
      );
    }
    // `full` deliberately does not mirror the artifact ("returned to you" names the guest).
    const full = summarizeRefund(2000, 2000, "refunded");
    expect(settledStatusKey(full)).toBe("floor.settled.status.full");
    expect(STAFF["floor.settled.status.full"].en).not.toContain("you");
  });

  it("the collapsed chip is `refundChipLabel`, keyed — and absent when nothing came back", () => {
    const partial = summarizeRefund(2000, 500, "paid");
    const full = summarizeRefund(2000, 2000, "refunded");
    const none = summarizeRefund(2000, 0, "paid");
    expect(STAFF[settledChipKey(partial)!].en).toBe(refundChipLabel(partial));
    expect(STAFF[settledChipKey(full)!].en).toBe(refundChipLabel(full));
    expect(settledChipKey(none)).toBeNull();
    expect(refundChipLabel(none)).toBeNull();
  });

  it("the reason list IS the schema's enum — same members, no extra, no missing", () => {
    const schemaReasons = refundLineInput.shape.reason.options;
    expect([...REFUND_REASONS].sort()).toEqual([...schemaReasons].sort());
    for (const r of REFUND_REASONS)
      expect(STAFF[REFUND_REASON_KEY[r]].en.length).toBeGreaterThan(0);
  });

  it("settledClock renders the service zone's wall clock, Latin, and '' for an unparseable stamp", () => {
    expect(settledClock("2026-09-13T19:41:00Z", "America/Los_Angeles")).toBe("12:41 PM");
    expect(settledClock("2026-09-13T19:41:00Z", "Asia/Yangon")).toBe("2:11 AM");
    expect(settledClock("not a date", "America/Los_Angeles")).toBe("");
  });
});
