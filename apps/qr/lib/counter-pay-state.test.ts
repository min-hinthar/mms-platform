import { describe, expect, it } from "vitest";
import {
  COUNTER_ASK_CARRIES_UNSENT,
  COUNTER_CARD_OUTSIDE_APP,
  COUNTER_PAY_REFUSAL_COPY,
  REGISTER_SETTLING_COPY,
  sameAsk,
  splitBoardShown,
  counterAskLive,
  counterPayRefusal,
  counterPayRefusalCopy,
  counterTakesCard,
} from "./counter-pay-state";

/**
 * A1 — the "Pay at the counter" rules, pinned as VALUES.
 *
 * Every case below is a distinct input, and the fixture is chosen so each rule is the ONLY thing
 * separating two neighbouring cases: dine-in vs pickup with everything else equal, locked vs not
 * with everything else equal. A mutant that drops one rule therefore changes exactly one verdict.
 */
const base = {
  mode: "dinein" as const,
  locked: false,
  settling: false,
  itemCount: 2,
};

describe("counterPayRefusal", () => {
  it("a dine-in table with something on it may ask", () => {
    expect(counterPayRefusal(base)).toBeNull();
  });

  it("only dine-in has a counter to walk to — pickup and scan-and-go are refused", () => {
    expect(counterPayRefusal({ ...base, mode: "pickup" })).toBe("not_dinein");
    expect(counterPayRefusal({ ...base, mode: "scango" })).toBe("not_dinein");
  });

  it("a card payment holding the cart refuses the ask", () => {
    expect(counterPayRefusal({ ...base, locked: true })).toBe("paying");
  });

  it("a split freeze refuses the ask, and outranks the lock when both hold", () => {
    expect(counterPayRefusal({ ...base, settling: true })).toBe("settling");
    // Both axes can hold at once (`locked_at` and `settle_at` are independent columns); the wider
    // state is the one named, the same rank `inertReason` documents.
    expect(counterPayRefusal({ ...base, settling: true, locked: true })).toBe("settling");
  });

  it("an empty table has nothing to settle", () => {
    expect(counterPayRefusal({ ...base, itemCount: 0 })).toBe("empty");
    expect(counterPayRefusal({ ...base, itemCount: -1 })).toBe("empty");
  });

  it("the mode rule is read before the freeze rules — a frozen pickup cart is still 'not a table'", () => {
    expect(counterPayRefusal({ ...base, mode: "pickup", locked: true, settling: true })).toBe(
      "not_dinein",
    );
  });

  it("every refusal has a diner-facing sentence", () => {
    for (const r of ["not_dinein", "paying", "settling", "empty"] as const) {
      expect(COUNTER_PAY_REFUSAL_COPY[r].length).toBeGreaterThan(10);
      expect(COUNTER_PAY_REFUSAL_COPY[r]).not.toMatch(/_/); // never a code
    }
  });
});

// ── PD2 (m2 STATES "Unsent dishes", decision 12) — the ask CARRIES unsent dishes ──
describe("counterPayRefusal — unsent dishes never refuse the ask (PD2's lift, after P2do)", () => {
  it("the refusals are the four table states — Phase 2c's `unsent` is gone, so no sentence can name it", () => {
    // The copy table is a `Record` over the refusal union: its keys ARE the refusals that exist.
    expect(Object.keys(COUNTER_PAY_REFUSAL_COPY).sort()).toEqual(
      ["empty", "not_dinein", "paying", "settling"].sort(),
    );
    expect(Object.values(COUNTER_PAY_REFUSAL_COPY).join(" ")).not.toMatch(/kitchen first/);
  });

  it("the dock says what the counter does with them — m2's words, verbatim, telling nobody to send", () => {
    // Exact, so it pins everything a looser read would: the line goes to host, guest and hostless
    // table alike, so it orders nobody to send (only the host can) and promises no time.
    expect(COUNTER_ASK_CARRIES_UNSENT).toBe(
      "You can still ask — the counter will check them with your table.",
    );
  });
});

describe("counterAskLive", () => {
  it("a stamp is live regardless of age — there is no TTL by design", () => {
    expect(counterAskLive("2026-09-09T10:00:00.000Z")).toBe(true);
    expect(counterAskLive("2020-01-01T00:00:00.000Z")).toBe(true);
  });
  it("null, undefined and an empty string are not an ask", () => {
    expect(counterAskLive(null)).toBe(false);
    expect(counterAskLive(undefined)).toBe(false);
    expect(counterAskLive("")).toBe(false);
  });
});

describe("PD2 (m2 decision 15) — the settling sentence names who holds the freeze", () => {
  it("with the self-serve split PARKED, a settling refusal is the register's sentence", () => {
    // MUTATION (counter/settling-sentence-names-a-parked-split): the flag ignored — a family whose
    // bill Dad is taking in cash reads "The table's splitting the bill", a door no phone can open; red.
    expect(counterPayRefusalCopy("settling", false)).toBe(REGISTER_SETTLING_COPY);
    expect(REGISTER_SETTLING_COPY).toBe(
      "The counter is taking your table’s payment right now — this screen updates when it’s done.",
    );
  });
  it("with the split OPEN the shipped split sentence stands, and every other refusal is unchanged either way", () => {
    expect(counterPayRefusalCopy("settling", true)).toBe(COUNTER_PAY_REFUSAL_COPY.settling);
    for (const r of ["not_dinein", "paying", "empty"] as const) {
      expect(counterPayRefusalCopy(r, false)).toBe(COUNTER_PAY_REFUSAL_COPY[r]);
      expect(counterPayRefusalCopy(r, true)).toBe(COUNTER_PAY_REFUSAL_COPY[r]);
    }
  });
});

describe("PD2 (m2 decision 7) — the tender truth is derived, never a literal", () => {
  it("the counter is cash-only by default (ruling #11; no reader, #26), and a configured reader takes a card", () => {
    expect(COUNTER_CARD_OUTSIDE_APP).toBe(false);
    expect(counterTakesCard(false)).toBe(false);
    // MUTATION (counter/reader-ignored-by-the-tender-sentence): the reader dropped — a register
    // with a card reader still tells every table "The counter takes cash."; red.
    expect(counterTakesCard(true)).toBe(true);
  });
});

describe("splitBoardShown — the split board is the SPLIT's screen (the last blind pass on #331)", () => {
  const on = { isGroup: true, settling: true, hasSplit: true, selfServeSplitOpen: true };
  it("a group's freeze shows the board only while the self-serve split door is open", () => {
    expect(splitBoardShown(on)).toBe(true);
    // MUTATION (counter/split-board-ignores-the-split-door): the split door dropped — the register's
    // cash settle flips a whole table to "splitting the bill"; red.
    expect(splitBoardShown({ ...on, selfServeSplitOpen: false })).toBe(false);
  });
  it("never for a solo table, a cart that is not settling, or a missing split context", () => {
    expect(splitBoardShown({ ...on, isGroup: false })).toBe(false);
    expect(splitBoardShown({ ...on, settling: false })).toBe(false);
    expect(splitBoardShown({ ...on, hasSplit: false })).toBe(false);
  });
});

describe("REGISTER_SETTLING_COPY — one sentence in two homes, pinned equal (the blind passes on #331)", () => {
  it("is the diner dictionary's registerSettling, verbatim", async () => {
    const { t } = await import("./i18n");
    // RED if either copy is edited alone: the refusal and the dock would say two sentences.
    expect(REGISTER_SETTLING_COPY).toBe(t("en", "registerSettling"));
  });
});

describe("sameAsk — one ask in two formats is the same ask (the blind passes on #331)", () => {
  it("compares instants: the action's ISO 'Z' and PostgREST's '+00:00' name the same ask", () => {
    expect(sameAsk("2026-10-08T06:00:00.123Z", "2026-10-08T06:00:00.123+00:00")).toBe(true);
    expect(sameAsk("2026-10-08T06:00:00.123Z", "2026-10-08T06:05:00.000Z")).toBe(false);
  });
  it("a stamp Date.parse cannot read falls back to string equality, never 'a new ask' by default", () => {
    // MUTATION (counter/same-ask-nan-is-a-new-ask): the fallback dropped — NaN !== NaN, so the SAME
    // unreadable stamp restored reads as a tablemate's new ask; red.
    expect(sameAsk("not-a-time", "not-a-time")).toBe(true);
    expect(sameAsk("not-a-time", "other")).toBe(false);
  });
});
