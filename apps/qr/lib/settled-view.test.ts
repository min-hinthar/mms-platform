import { afterEach, describe, expect, it, vi } from "vitest";
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
  announceHandBacks,
  handBackSubjects,
  owedHandBacks,
  owedHandBacksNow,
  peekHandBacks,
  refundSheetAfterAnswer,
  rememberHandBack,
  resetHandBackDocumentForTests,
  settledChipKey,
  settledClock,
  settledDate,
  settledStatusKey,
  subscribeHandBacks,
  tenderKey,
  type HandBack,
} from "./settled-view";
import { refundLineInput } from "@mms/db/schemas";
import { autoBlock, reloadHolds, resetHoldsForTests, type GuardInput } from "./reload-guard";

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
  afterEach(() => {
    resetHandBackDocumentForTests();
    resetHoldsForTests();
    vi.useRealTimers();
  });
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
  /** Storage that refuses every call (private mode, quota). */
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
  const T0 = 1_800_000_000_000;
  const hb = (lineId: string, cents: number, over: Partial<HandBack> = {}): HandBack => ({
    lineId,
    cents,
    name: `dish ${lineId}`,
    code: `R-${lineId}`,
    at: T0,
    ...over,
  });
  /** Nothing but holds can refuse an automatic reload here: quiet, online, nothing in flight. */
  const quiet = (): GuardInput => ({
    online: true,
    holds: reloadHolds(),
    youngWrite: false,
    stalledWrite: false,
    ownWait: false,
    msSinceWriteSettled: null,
    msSinceInput: 1e9,
    dialogOpen: false,
    typing: false,
    retired: false,
  });

  it("keeps what it is handed, by line, with its dish and receipt — and a peek says it again and again", () => {
    const store = memory();
    expect(rememberHandBack(store, hb("l1", 1105, { name: "Mohinga", code: "AA0001" }))).toBe(
      "kept",
    );
    expect(rememberHandBack(store, hb("l2", 250, { name: "Tea", code: "AA0002" }))).toBe("kept");
    const owed = [
      { lineId: "l1", cents: 1105, name: "Mohinga", code: "AA0001", at: T0 },
      { lineId: "l2", cents: 250, name: "Tea", code: "AA0002", at: T0 },
    ];
    // MUTATION (p2i-handback/name-dropped): the entry is written without its dish — the instruction
    // can no longer say which refund it is for, and the record refuses it on the way out; red.
    // MUTATION (p2i-handback/code-dropped): written without its receipt — two orders' same dish
    // read alike, and the record refuses it on the way out; red.
    expect(peekHandBacks(store, T0)).toEqual(owed);
    // MUTATION (p2i-handback/peek-forgets): a peek that forgets is the Phase 2h take — a reload
    // after the banner was shown (Next's own, on the refund's answer) loses the instruction; red.
    expect(peekHandBacks(store, T0 + 1)).toEqual(owed);
    expect(store.data.has(HAND_BACK_KEY)).toBe(true);
    // Written down, so nothing is held in memory and no automatic reload is held.
    expect(reloadHolds()).toEqual([]);
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

  it("never keeps a figure that is not a hand-back (zero, negative, fractional) or one without its dish or receipt", () => {
    const store = memory();
    expect(rememberHandBack(store, hb("l1", 0))).toBe("invalid");
    expect(rememberHandBack(store, hb("l2", -5))).toBe("invalid");
    expect(rememberHandBack(store, hb("l3", 1.5))).toBe("invalid");
    expect(rememberHandBack(store, { lineId: "l4", cents: 5, code: "R", at: T0 } as HandBack)).toBe(
      "invalid",
    );
    expect(rememberHandBack(store, { lineId: "l5", cents: 5, name: "x", at: T0 } as HandBack)).toBe(
      "invalid",
    );
    expect(peekHandBacks(store, T0)).toEqual([]);
    // MUTATION (p2h-rev-a/handback/non-positive-read): "hand back $0.00" or a negative figure; red.
    store.setItem(
      HAND_BACK_KEY,
      JSON.stringify([hb("z", 0), hb("n", -5), hb("ok", 5), { lineId: "x", cents: 5, at: T0 }]),
    );
    expect(peekHandBacks(store, T0)).toEqual([hb("ok", 5)]);
  });

  it("critic F7 — where storage refuses, a figure that is no hand-back is still kept NOWHERE: not said, not held", () => {
    const told: string[] = [];
    const off = subscribeHandBacks((w) => told.push(w));
    // MUTATION (p2i-handback/invalid-kept-in-memory): validation runs only on the way to storage, so
    // private mode says "hand back $0.00 from the drawer" with a [Handed back]; red.
    expect(rememberHandBack(broken, hb("z", 0))).toBe("invalid");
    expect(rememberHandBack(null, hb("f", 1.5))).toBe("invalid");
    expect(owedHandBacksNow(broken, T0)).toEqual([]);
    expect(reloadHolds()).toEqual([]);
    expect(told).toEqual([]);
    off();
  });

  it("garbage in the slot is replaced by the next real hand-back and never read as one", () => {
    const store = memory();
    store.setItem(HAND_BACK_KEY, "{not json");
    expect(peekHandBacks(store, T0)).toEqual([]);
    expect(rememberHandBack(store, hb("l1", 1105))).toBe("kept");
    expect(peekHandBacks(store, T0)).toEqual([hb("l1", 1105)]);
    store.setItem(
      HAND_BACK_KEY,
      JSON.stringify([
        { lineId: 3, cents: 5, name: "a", code: "c", at: T0 },
        { lineId: "x", cents: "5", name: "a", code: "c", at: T0 },
      ]),
    );
    expect(peekHandBacks(store, T0)).toEqual([]);
    store.setItem(HAND_BACK_KEY, "{not json");
    ackHandBack(store, "l1");
    expect(store.data.has(HAND_BACK_KEY)).toBe(false);
  });

  it("storage that throws or is absent writes nothing down, says so, and never throws", () => {
    expect(rememberHandBack(broken, hb("l1", 1105))).toBe("memory");
    expect(peekHandBacks(broken, T0)).toEqual([]);
    expect(() => ackHandBack(broken, "l1")).not.toThrow();
    expect(rememberHandBack(null, hb("l1", 1105))).toBe("memory");
    expect(peekHandBacks(null, T0)).toEqual([]);
    expect(() => ackHandBack(null, "l1")).not.toThrow();
  });

  it("critic F1 · F2 — one storage refused is held in the DOCUMENT's memory: said to every reader, and an automatic reload waits while it stands", () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const told: string[] = [];
    const off = subscribeHandBacks((w) => told.push(w));
    expect(rememberHandBack(broken, hb("l1", 1105))).toBe("memory");
    // MUTATION (p2i-handback/memory-unsaid): memory is not part of what is owed — a late answer
    // after its zone unmounted reaches no mount at all; red.
    expect(owedHandBacksNow(broken, T0)).toEqual([hb("l1", 1105)]);
    expect(owedHandBacksNow(null, T0 + 1)).toEqual([hb("l1", 1105)]);
    // MUTATION (p2i-handback/memory-unheard): a late answer held only in memory is told to no zone
    // already mounted — the instruction waits for some later mount; red.
    expect(told).toEqual(["remembered"]);
    // MUTATION (p2i-handback/memory-unheld): nothing holds a reload while the only copy of a drawer
    // instruction is in memory — the automatic reload erases it; red.
    expect(autoBlock(quiet())).toEqual({ kind: "hold", reason: "handBack" });
    // Written down later (storage came back), the record is the one copy: memory lets it go, and
    // the reload hold with it.
    const store = memory();
    expect(rememberHandBack(store, hb("l1", 1105))).toBe("kept");
    expect(owedHandBacksNow(store, T0)).toEqual([hb("l1", 1105)]);
    expect(reloadHolds()).toEqual([]);
    // Refused again, then acknowledged: memory forgets it and the hold is released.
    rememberHandBack(broken, hb("l2", 250));
    expect(reloadHolds()).toHaveLength(1);
    ackHandBack(broken, "l2");
    // MUTATION (p2i-handback/memory-ack-kept): the [Handed back] reaches only the record, and memory
    // says the instruction again after the money left the drawer; red.
    expect(owedHandBacksNow(broken, T0)).toEqual([]);
    // MUTATION (p2i-handback/memory-hold-kept): the hold outlives what it protects — no automatic
    // reload ever again in this tab; red.
    expect(reloadHolds()).toEqual([]);
    expect(autoBlock(quiet())).toBeNull();
    off();
  });

  it("critic F1 — a memory entry's hold ends with its shift: the entry ages out, the hold is released, and readers re-read quietly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const told: string[] = [];
    const off = subscribeHandBacks((w) => told.push(w));
    rememberHandBack(broken, hb("l1", 1105));
    vi.advanceTimersByTime(HAND_BACK_TTL_MS - 1);
    expect(reloadHolds()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    // MUTATION (p2i-handback/memory-hold-forever): the hold has no end but [Handed back] — a tab
    // nobody acknowledges on never takes a new build; red.
    expect(reloadHolds()).toEqual([]);
    expect(owedHandBacksNow(broken, T0 + HAND_BACK_TTL_MS)).toEqual([]);
    expect(told).toEqual(["remembered", "expired"]);
    off();
  });

  it("a Phase 2h entry ({ lineId, cents } only) is still owed after the rollout reload: no dish, dated by its first read, said dish-less", () => {
    const store = memory();
    store.setItem(HAND_BACK_KEY, JSON.stringify([{ lineId: "old", cents: 1105 }]));
    // MUTATION (p2i-handback/legacy-dropped): the 2h tab's owed instruction — written precisely
    // for the next mount — is dropped by the very reload that brings in this build; red.
    const owed = peekHandBacks(store, T0);
    expect(owed).toEqual([{ lineId: "old", cents: 1105, name: "", code: "", at: T0 }]);
    // Critic F9 — dated ONCE, by the first read, and written back: its shift runs from there.
    // MUTATION (p2i-handback/legacy-redated): re-dated by every read, it never ages out — a dish-less
    // instruction standing for days in a long-lived tab; red.
    expect(peekHandBacks(store, T0 + HAND_BACK_TTL_MS - 1)).toHaveLength(1);
    expect(peekHandBacks(store, T0 + HAND_BACK_TTL_MS)).toEqual([]);
    // MUTATION (p2i-handback/legacy-said-for-nobody): "hand back $11.05 for  from the drawer"; red.
    expect(handBackKey(owed[0]!)).toBe("floor.settled.confirmed.cash");
    expect(handBackKey(hb("l1", 5))).toBe("floor.settled.confirmed.cashFor");
    ackHandBack(store, "old");
    expect(peekHandBacks(store, T0)).toEqual([]);
  });

  it("critic F3 — each instruction is called by its dish and receipt; two that still read alike are numbered, never identical", () => {
    const a = hb("a", 1105, { name: "Mohinga", code: "AA0001" });
    const b = hb("b", 840, { name: "Mohinga", code: "AA0002" });
    const legacy = hb("c", 500, { name: "", code: "" });
    expect(handBackSubjects([a, b, legacy])).toEqual([
      "Mohinga · AA0001",
      "Mohinga · AA0002",
      "$5.00",
    ]);
    // Two lines of one dish on one receipt; two dish-less entries of one figure.
    const a2 = hb("a2", 1105, { name: "Mohinga", code: "AA0001" });
    const legacy2 = hb("d", 500, { name: "", code: "" });
    // MUTATION (p2i-handback/subjects-collide): the two read alike — two identical [Handed back]
    // buttons, and a tap that may acknowledge the other payout; red.
    expect(handBackSubjects([a, legacy, a2, legacy2, b])).toEqual([
      "Mohinga · AA0001 (1)",
      "$5.00 (1)",
      "Mohinga · AA0001 (2)",
      "$5.00 (2)",
      "Mohinga · AA0002",
    ]);
    expect(handBackSubjects([])).toEqual([]);
  });

  it("critic F4 — an instruction is announced once per document: true only for what this document has not said", () => {
    const a = hb("a", 100);
    const b = hb("b", 200);
    expect(announceHandBacks([a])).toBe(true);
    // MUTATION (p2i-handback/announce-every-time): every mount re-announces and steals focus; red.
    expect(announceHandBacks([a])).toBe(false);
    expect(announceHandBacks([a, b])).toBe(true);
    // The same line answered again (a newer entry) is new news.
    expect(announceHandBacks([hb("a", 100, { at: T0 + 5 })])).toBe(true);
    expect(announceHandBacks([])).toBe(false);
    resetHandBackDocumentForTests(); // a reload: a new document says everything again
    expect(announceHandBacks([a])).toBe(true);
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

describe("subscribeHandBacks — Phase 2i: a hand-back remembered is said to every zone in the document", () => {
  afterEach(() => {
    resetHandBackDocumentForTests();
    resetHoldsForTests();
  });
  const T0 = 1_800_000_000_000;
  const store = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };
  const e = (lineId: string, cents: number) => ({ lineId, cents, name: "x", code: "R", at: T0 });
  it("tells each listener once per hand-back remembered, never for one refused; a throwing listener spoils nothing", () => {
    const heard: string[] = [];
    const offA = subscribeHandBacks(() => heard.push("a"));
    const offBad = subscribeHandBacks(() => {
      throw new Error("boom");
    });
    const offB = subscribeHandBacks(() => heard.push("b"));
    const s = store();
    expect(rememberHandBack(s, e("l1", 100))).toBe("kept");
    // MUTATION (p2i-handback/late-unheard): a zone that mounted after its refund was sent never
    // hears the late answer — the drawer instruction waits for some later mount; red.
    expect(heard).toEqual(["a", "b"]);
    expect(rememberHandBack(s, e("l2", 0))).toBe("invalid");
    expect(heard).toEqual(["a", "b"]);
    offA();
    offBad();
    rememberHandBack(s, e("l4", 100));
    expect(heard).toEqual(["a", "b", "b"]);
    offB();
  });
});
