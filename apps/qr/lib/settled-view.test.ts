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
  HAND_BACK_TTL_MS,
  REFUND_REASONS,
  REFUND_REASON_KEY,
  RECEIPT_ROW_KEY,
  TENDER_KEY,
  groupKey,
  handBackKey,
  receiptRowKey,
  ackHandBack,
  owedHandBacks,
  peekHandBacks,
  refundSheetAfterAnswer,
  rememberHandBack,
  settledChipKey,
  settledClock,
  settledDate,
  settledStatusKey,
  subscribeHandBacks,
  tenderKey,
  type HandBack,
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

describe("rememberHandBack / peekHandBacks / ackHandBack — Phase 2i (D5): a cash hand-back is kept until a person says it was made", () => {
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
  const T0 = 1_800_000_000_000;
  const hb = (lineId: string, cents: number, over: Partial<HandBack> = {}): HandBack => ({
    lineId,
    cents,
    name: `dish ${lineId}`,
    at: T0,
    ...over,
  });

  it("keeps what it is handed, by line, with its dish — and a peek says it again and again", () => {
    const store = memory();
    expect(rememberHandBack(store, hb("l1", 1105, { name: "Mohinga" }))).toBe(true);
    expect(rememberHandBack(store, hb("l2", 250, { name: "Tea" }))).toBe(true);
    const owed = [
      { lineId: "l1", cents: 1105, name: "Mohinga", at: T0 },
      { lineId: "l2", cents: 250, name: "Tea", at: T0 },
    ];
    // MUTATION (p2i-handback/name-dropped): the entry is written without its dish — the instruction
    // can no longer say which refund it is for, and the record refuses it on the way out; red.
    expect(peekHandBacks(store, T0)).toEqual(owed);
    // MUTATION (p2i-handback/peek-forgets): a peek that forgets is the Phase 2h take — a reload
    // after the banner was shown (Next's own, on the refund's answer) loses the instruction; red.
    expect(peekHandBacks(store, T0 + 1)).toEqual(owed);
    expect(store.data.has(HAND_BACK_KEY)).toBe(true);
  });

  it("an acknowledgement forgets ITS entry and no other; the last one clears the record", () => {
    const store = memory();
    rememberHandBack(store, hb("l1", 1105));
    rememberHandBack(store, hb("l2", 250));
    ackHandBack(store, "l1");
    // MUTATION (p2i-handback/ack-all): one [Handed back] silences every instruction; red.
    expect(peekHandBacks(store, T0)).toEqual([hb("l2", 250)]);
    ackHandBack(store, "nope");
    expect(peekHandBacks(store, T0)).toEqual([hb("l2", 250)]);
    ackHandBack(store, "l2");
    expect(peekHandBacks(store, T0)).toEqual([]);
    expect(store.data.has(HAND_BACK_KEY)).toBe(false);
  });

  it("an entry lives a shift: owed until HAND_BACK_TTL_MS has passed, not at it", () => {
    const store = memory();
    rememberHandBack(store, hb("l1", 1105));
    expect(peekHandBacks(store, T0 + HAND_BACK_TTL_MS - 1)).toEqual([hb("l1", 1105)]);
    // MUTATION (p2i-handback/ttl-ignored): an instruction from yesterday's shift is said today; red.
    expect(peekHandBacks(store, T0 + HAND_BACK_TTL_MS)).toEqual([]);
    // ...and a later remember sheds the expired entry from the record itself.
    rememberHandBack(store, hb("l2", 250, { at: T0 + HAND_BACK_TTL_MS }));
    expect(JSON.parse(store.data.get(HAND_BACK_KEY)!)).toEqual([
      hb("l2", 250, { at: T0 + HAND_BACK_TTL_MS }),
    ]);
  });

  it("one line is refunded once: a newer entry for it replaces the older one", () => {
    const store = memory();
    rememberHandBack(store, hb("l1", 1105));
    rememberHandBack(store, hb("l1", 900));
    // MUTATION (p2h-rev-a/handback/line-appended): two instructions for one refund; red.
    expect(peekHandBacks(store, T0)).toEqual([hb("l1", 900)]);
  });

  it("never keeps a figure that is not a hand-back (zero, negative, fractional) or one without its dish", () => {
    const store = memory();
    expect(rememberHandBack(store, hb("l1", 0))).toBe(false);
    expect(rememberHandBack(store, hb("l2", -5))).toBe(false);
    expect(rememberHandBack(store, hb("l3", 1.5))).toBe(false);
    expect(rememberHandBack(store, { lineId: "l4", cents: 5, at: T0 } as HandBack)).toBe(false);
    expect(peekHandBacks(store, T0)).toEqual([]);
    // MUTATION (p2h-rev-a/handback/non-positive-read): "hand back $0.00" or a negative figure; red.
    store.setItem(
      HAND_BACK_KEY,
      JSON.stringify([hb("z", 0), hb("n", -5), hb("ok", 5), { lineId: "x", cents: 5, at: T0 }]),
    );
    expect(peekHandBacks(store, T0)).toEqual([hb("ok", 5)]);
  });

  it("garbage in the slot is replaced by the next real hand-back and never read as one", () => {
    const store = memory();
    store.setItem(HAND_BACK_KEY, "{not json");
    expect(peekHandBacks(store, T0)).toEqual([]);
    expect(rememberHandBack(store, hb("l1", 1105))).toBe(true);
    expect(peekHandBacks(store, T0)).toEqual([hb("l1", 1105)]);
    store.setItem(
      HAND_BACK_KEY,
      JSON.stringify([
        { lineId: 3, cents: 5, name: "a", at: T0 },
        { lineId: "x", cents: "5", name: "a", at: T0 },
      ]),
    );
    expect(peekHandBacks(store, T0)).toEqual([]);
    store.setItem(HAND_BACK_KEY, "{not json");
    ackHandBack(store, "l1");
    expect(store.data.has(HAND_BACK_KEY)).toBe(false);
  });

  it("storage that throws or is absent keeps nothing, says so, and never throws", () => {
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
    expect(rememberHandBack(broken, hb("l1", 1105))).toBe(false);
    expect(peekHandBacks(broken, T0)).toEqual([]);
    expect(() => ackHandBack(broken, "l1")).not.toThrow();
    expect(rememberHandBack(null, hb("l1", 1105))).toBe(false);
    expect(peekHandBacks(null, T0)).toEqual([]);
    expect(() => ackHandBack(null, "l1")).not.toThrow();
  });

  it("a Phase 2h entry ({ lineId, cents } only) is still owed after the rollout reload: no dish, dated now, said dish-less", () => {
    const store = memory();
    store.setItem(HAND_BACK_KEY, JSON.stringify([{ lineId: "old", cents: 1105 }]));
    // MUTATION (p2i-handback/legacy-dropped): the 2h tab's owed instruction — written precisely
    // for the next mount — is dropped by the very reload that brings in this build; red.
    const owed = peekHandBacks(store, T0);
    expect(owed).toEqual([{ lineId: "old", cents: 1105, name: "", at: T0 }]);
    // Dated by each read, so it never ages out on its own: only [Handed back] ends it.
    expect(peekHandBacks(store, T0 + HAND_BACK_TTL_MS)).toHaveLength(1);
    // MUTATION (p2i-handback/legacy-said-for-nobody): "hand back $11.05 for  from the drawer"; red.
    expect(handBackKey(owed[0]!)).toBe("floor.settled.confirmed.cash");
    expect(handBackKey(hb("l1", 5))).toBe("floor.settled.confirmed.cashFor");
    ackHandBack(store, "old");
    expect(peekHandBacks(store, T0)).toEqual([]);
  });

  it("the banner's list: the record's entries, then the ones this document could not keep — each once", () => {
    const a = hb("a", 100);
    const b = hb("b", 200);
    const b2 = hb("b", 300);
    // MUTATION (p2i-handback/unkept-dropped): a hand-back storage refused is never said at all; red.
    expect(owedHandBacks([a], [b])).toEqual([a, b]);
    // MUTATION (p2i-handback/unkept-said-twice): the same line said from both sources; red.
    expect(owedHandBacks([a, b], [b2])).toEqual([a, b]);
    expect(owedHandBacks([], [])).toEqual([]);
  });
});

describe("subscribeHandBacks — Phase 2i: a hand-back written down is said to every zone in the document", () => {
  const T0 = 1_800_000_000_000;
  const store = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };
  it("tells each listener once per hand-back KEPT, never for one refused; a throwing listener spoils nothing", () => {
    const heard: string[] = [];
    const offA = subscribeHandBacks(() => heard.push("a"));
    const offBad = subscribeHandBacks(() => {
      throw new Error("boom");
    });
    const offB = subscribeHandBacks(() => heard.push("b"));
    const s = store();
    expect(rememberHandBack(s, { lineId: "l1", cents: 100, name: "x", at: T0 })).toBe(true);
    // MUTATION (p2i-handback/late-unheard): a zone that mounted after its refund was sent never
    // hears the late answer — the drawer instruction waits for some later mount; red.
    expect(heard).toEqual(["a", "b"]);
    expect(rememberHandBack(s, { lineId: "l2", cents: 0, name: "x", at: T0 })).toBe(false);
    expect(rememberHandBack(null, { lineId: "l3", cents: 100, name: "x", at: T0 })).toBe(false);
    expect(heard).toEqual(["a", "b"]);
    offA();
    offBad();
    rememberHandBack(s, { lineId: "l4", cents: 100, name: "x", at: T0 });
    expect(heard).toEqual(["a", "b", "b"]);
    offB();
  });
});
