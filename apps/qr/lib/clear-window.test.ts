import { describe, expect, it } from "vitest";
import {
  CLEAR_UNDO_MS,
  clearWindowLeftMs,
  clearWindowStale,
  type ClearWatch,
} from "./clear-window";
import { NO_HOLD, setHeld } from "./undo-hold";

/** PD7 — the clearing window's pure rules. Red-first by mutant (`clear-window/*`). */
const AT: ClearWatch = {
  members: ["a", "b"],
  lines: [
    { id: "l1", qty: 2 },
    { id: "l2", qty: 1 },
  ],
  paying: false,
};

describe("clearWindowStale — the table moved under the window: drop it, nothing sent", () => {
  it("as it was — or a member LEFT — keeps the window", () => {
    expect(clearWindowStale(AT, AT)).toBeNull();
    expect(clearWindowStale(AT, { ...AT, members: ["a"] })).toBeNull();
    expect(clearWindowStale(AT, { ...AT, lines: [...AT.lines].reverse() })).toBeNull();
  });
  it("a payment starting, someone sitting down, a dish added, removed or re-counted", () => {
    // MUTATION clear-window/payment-ignored → red.
    expect(clearWindowStale(AT, { ...AT, paying: true })).toBe("paying");
    // MUTATION clear-window/join-ignored → a party that just sat down is closed out; red.
    expect(clearWindowStale(AT, { ...AT, members: ["a", "b", "c"] })).toBe("joined");
    // MUTATION clear-window/change-ignored → red.
    expect(clearWindowStale(AT, { ...AT, lines: [...AT.lines, { id: "l3", qty: 1 }] })).toBe(
      "changed",
    );
    expect(clearWindowStale(AT, { ...AT, lines: [AT.lines[0]!] })).toBe("changed");
    expect(clearWindowStale(AT, { ...AT, lines: [{ id: "l1", qty: 3 }, AT.lines[1]!] })).toBe(
      "changed",
    );
    // A payment outranks a join (the money is the fact to act on).
    expect(clearWindowStale(AT, { ...AT, paying: true, members: ["a", "b", "c"] })).toBe("paying");
  });
});

describe("clearWindowLeftMs — six seconds, sliding by the time a keyboard held it", () => {
  it("runs from the open, and a hold slides it", () => {
    expect(clearWindowLeftMs(1_000, NO_HOLD, 1_000)).toBe(CLEAR_UNDO_MS);
    expect(clearWindowLeftMs(1_000, NO_HOLD, 1_000 + CLEAR_UNDO_MS)).toBe(0);
    const held = setHeld(NO_HOLD, "slot", true, 2_000);
    // MUTATION clear-window/hold-not-subtracted → a held window still runs out; red.
    expect(clearWindowLeftMs(1_000, held, 1_000 + CLEAR_UNDO_MS)).toBe(CLEAR_UNDO_MS - 1_000);
  });
});
