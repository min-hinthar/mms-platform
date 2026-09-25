import { describe, expect, it } from "vitest";
import { COUNTER_PAY_REFUSAL_COPY, counterAskLive, counterPayRefusal } from "./counter-pay-state";

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

  it("names the fix in plain words", () => {
    expect(COUNTER_PAY_REFUSAL_COPY.unsent).toBe(
      "Send everything to the kitchen first — then pay at the counter.",
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
