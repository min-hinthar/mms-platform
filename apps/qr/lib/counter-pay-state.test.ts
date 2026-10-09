import { describe, expect, it } from "vitest";
import {
  COUNTER_CARD_OUTSIDE_APP,
  COUNTER_PAY_REFUSAL_COPY,
  REGISTER_SETTLING_COPY,
  sameAsk,
  splitBoardShown,
  counterAskLive,
  counterPayRefusal,
  counterPayRefusalCopy,
  counterTakesCard,
  counterUnsentTapCopy,
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
  unsentBlocks: false,
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
    for (const r of ["not_dinein", "paying", "settling", "empty", "unsent"] as const) {
      expect(COUNTER_PAY_REFUSAL_COPY[r].length).toBeGreaterThan(10);
      expect(COUNTER_PAY_REFUSAL_COPY[r]).not.toMatch(/_/); // never a code
    }
  });
});

// ── Phase 2c · gate ──
describe("counterPayRefusal — the ask is refused while the table's dishes are unsent", () => {
  it("unsent dishes refuse the ask; a sent table may ask", () => {
    // MUTATION (counter-pay-state/unsent-ask-allowed): drop the rule — the family is told to walk to
    // the register while dishes nobody is cooking sit on their bill, and the register's own settle
    // gate then refuses them at the counter; red.
    expect(counterPayRefusal({ ...base, unsentBlocks: true })).toBe("unsent");
    expect(counterPayRefusal({ ...base, unsentBlocks: false })).toBeNull();
  });

  it("is named AFTER the wider states — a frozen or empty table says that first", () => {
    expect(counterPayRefusal({ ...base, unsentBlocks: true, settling: true })).toBe("settling");
    expect(counterPayRefusal({ ...base, unsentBlocks: true, locked: true })).toBe("paying");
    expect(counterPayRefusal({ ...base, unsentBlocks: true, mode: "pickup" })).toBe("not_dinein");
  });

  it("the server's sentence goes to EVERY member, so it tells nobody to do what only the host can", () => {
    // Critic finding: "Send everything to the kitchen first" reached a guest who cannot send (the
    // server returns it to whoever asked). True for both roles: nothing in it is an order to send.
    expect(COUNTER_PAY_REFUSAL_COPY.unsent).toBe(
      "Everything has to go to the kitchen first — then pay at the counter.",
    );
    expect(COUNTER_PAY_REFUSAL_COPY.unsent).not.toMatch(/^Send\b/);
  });

  it("a tap on the dimmed counter button names the fix to the host and WHO sends to a guest", () => {
    // The host can send: told to.
    expect(counterUnsentTapCopy(null)).toBe(
      "Send everything to the kitchen first — then pay at the counter.",
    );
    // MUTATION (counter-pay-state/unsent-guest-told-to-send): the host's sentence for everyone — a
    // guest is told to send dishes only the host can send; red.
    expect(counterUnsentTapCopy("Aye")).toBe(
      "Aye sends everything to the kitchen first — then pay at the counter.",
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
    for (const r of ["not_dinein", "paying", "empty", "unsent"] as const) {
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
