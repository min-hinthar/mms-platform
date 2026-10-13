import { describe, expect, it } from "vitest";
import { displayedSoldOut, soldOutWarned, staffSettleSoldOutVerdict } from "./settle-sold-out";

/** #360 — PD8's acknowledgement, for a sold-out draft: the compare, the words, what a page displays. */
const M = { id: "m", name: "Mohinga" };
const T = { id: "t", name: "Tea leaf salad" };

describe("staffSettleSoldOutVerdict — a re-warning, never a block", () => {
  it("nothing sold out, or everything sold out ACKNOWLEDGED: passes", () => {
    expect(staffSettleSoldOutVerdict({ ok: true, lines: [] }, [])).toBeNull();
    // lck/settle-sold-out/acknowledgement-ignored
    expect(staffSettleSoldOutVerdict({ ok: true, lines: [M, T] }, ["m", "t"])).toBeNull();
  });
  it("a dish the tap did not display refuses, carrying every sold-out dish", () => {
    // lck/settle-sold-out/unseen-passes
    expect(staffSettleSoldOutVerdict({ ok: true, lines: [M, T] }, ["m"])).toEqual({
      unseen: [T],
      all: [M, T],
    });
  });
  it("an unreadable read is `unreadable` — never 'nothing is sold out'", () => {
    // lck/settle-sold-out/unreadable-passes
    expect(staffSettleSoldOutVerdict({ ok: false }, ["m"])).toBe("unreadable");
  });
});

describe("soldOutWarned / displayedSoldOut", () => {
  it("names the dishes this tap had not seen; every one only when none is new", () => {
    expect(soldOutWarned([M, T], ["m"])).toBe("Tea leaf salad");
    expect(soldOutWarned([M, T], ["m", "t"])).toBe("Mohinga, Tea leaf salad");
  });
  it("a page displays its sold-out DRAFTS, one id per dish", () => {
    // lck/settle-sold-out/sent-dish-acknowledged — a sent dish is the kitchen's, never a draft to ack.
    expect(
      displayedSoldOut([
        { state: "draft", soldOut: true, menuItemId: "m" },
        { state: "draft", soldOut: true, menuItemId: "m" },
        { state: "fired", soldOut: true, menuItemId: "t" },
        { state: "draft", soldOut: false, menuItemId: "x" },
        { state: "draft", soldOut: true, menuItemId: null },
      ]),
    ).toEqual(["m"]);
  });
});
