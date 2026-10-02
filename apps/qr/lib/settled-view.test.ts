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
  HAND_BACK_KEY,
  REFUND_REASONS,
  REFUND_REASON_KEY,
  RECEIPT_ROW_KEY,
  TENDER_KEY,
  groupKey,
  receiptRowKey,
  refundSheetAfterAnswer,
  rememberHandBack,
  settledChipKey,
  settledClock,
  settledDate,
  settledStatusKey,
  takeHandBacks,
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

  it("settledDate renders the service zone's calendar day, Latin, and '' for an unparseable stamp (Codex round 1 on #283)", () => {
    // 2026-09-13T05:41Z is still Sep 12 in Los Angeles — the date is the ZONE's, never UTC's.
    expect(settledDate("2026-09-13T05:41:00Z", "America/Los_Angeles")).toBe("Sep 12");
    expect(settledDate("2026-09-13T05:41:00Z", "Asia/Yangon")).toBe("Sep 13");
    expect(settledDate("not a date", "America/Los_Angeles")).toBe("");
  });
});

describe("refundSheetAfterAnswer — Phase 2h · integration b: a refund's answer closes only its OWN line's sheet", () => {
  const sheet = (lineId: string) => ({ order: { id: "o1" }, line: { id: lineId } });

  it("closes the open sheet for the answered line; keeps another line's; nothing open stays nothing", () => {
    expect(refundSheetAfterAnswer(sheet("l1"), "l1", false)).toBeNull();
    // MUTATION (p2h-int-b/settled/after-answer-closes-any): a LATE answer for line l1 shuts the
    // sheet the manager has since opened for l2, under their hands.
    const other = sheet("l2");
    expect(refundSheetAfterAnswer(other, "l1", false)).toBe(other);
    expect(refundSheetAfterAnswer(null, "l1", false)).toBeNull();
  });

  it("critic S1 — a drawer hand-back closes ANY open sheet: its instruction must never sit under one", () => {
    // MUTATION (p2h-int-b/settled/hand-back-keeps-other-sheet): the hand-back is ignored, and the
    // instruction to pay the guest lands aria-hidden behind l2's sheet; red.
    expect(refundSheetAfterAnswer(sheet("l2"), "l1", true)).toBeNull();
    expect(refundSheetAfterAnswer(sheet("l1"), "l1", true)).toBeNull();
    expect(refundSheetAfterAnswer(null, "l1", true)).toBeNull();
  });
});

describe("rememberHandBack / takeHandBacks — Phase 2h · review a (A2): a cash hand-back the zone could not say is kept for its next mount", () => {
  function memory(): Storage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  }

  it("keeps what it is handed, by line, and the take says it ONCE", () => {
    const store = memory();
    rememberHandBack(store, "l1", 1105);
    rememberHandBack(store, "l2", 250);
    expect(takeHandBacks(store)).toEqual([
      { lineId: "l1", cents: 1105 },
      { lineId: "l2", cents: 250 },
    ]);
    // MUTATION (p2h-rev-a/handback/take-keeps): the next mount says "hand back $11.05" again, and
    // the guest is paid twice; red.
    expect(takeHandBacks(store)).toEqual([]);
    expect(store.data.has(HAND_BACK_KEY)).toBe(false);
  });

  it("one line is refunded once: a newer entry for it replaces the older one", () => {
    const store = memory();
    rememberHandBack(store, "l1", 1105);
    rememberHandBack(store, "l1", 900);
    // MUTATION (p2h-rev-a/handback/line-appended): two instructions for one refund; red.
    expect(takeHandBacks(store)).toEqual([{ lineId: "l1", cents: 900 }]);
  });

  it("never keeps a figure that is not a hand-back (zero, negative, fractional)", () => {
    const store = memory();
    rememberHandBack(store, "l1", 0);
    rememberHandBack(store, "l2", -5);
    rememberHandBack(store, "l3", 1.5);
    // MUTATION (p2h-rev-a/handback/non-positive-read): "hand back $0.00" or a negative figure; red.
    expect(takeHandBacks(store)).toEqual([]);
  });

  it("garbage in the slot is replaced by the next real hand-back and never read as one", () => {
    const store = memory();
    store.setItem(HAND_BACK_KEY, "{not json");
    expect(takeHandBacks(store)).toEqual([]);
    store.setItem(HAND_BACK_KEY, "{not json");
    rememberHandBack(store, "l1", 1105);
    expect(takeHandBacks(store)).toEqual([{ lineId: "l1", cents: 1105 }]);
    store.setItem(
      HAND_BACK_KEY,
      JSON.stringify([
        { lineId: 3, cents: 5 },
        { lineId: "x", cents: "5" },
      ]),
    );
    expect(takeHandBacks(store)).toEqual([]);
  });

  it("storage that throws or is absent keeps nothing and never throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => rememberHandBack(broken, "l1", 1105)).not.toThrow();
    expect(takeHandBacks(broken)).toEqual([]);
    expect(() => rememberHandBack(null, "l1", 1105)).not.toThrow();
    expect(takeHandBacks(null)).toEqual([]);
  });
});
