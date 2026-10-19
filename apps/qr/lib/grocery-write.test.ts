import { describe, expect, it } from "vitest";
import { groceryRefusalSentence, groceryWriteOutcome } from "./grocery-write";

/**
 * #362 (blind pass 4) — `setQty` now RESOLVES a refusal it names (`{ refused, at }`) where it used to
 * throw. /grocery's stepper and add-Undo set `wrote = true` on any resolve, so a refused write kept
 * its optimistic "Removed {name}", and the Undo spent the charge record and the pairing for a write
 * that never landed. Staff void has no grocery exclusion, so a grocery line CAN leave draft.
 */
describe("groceryWriteOutcome — a resolve is not a landing", () => {
  it("a view (or the written-unreadable null) landed; a named refusal did not", () => {
    // MUTATION (lcb/grocery-write/refusal-reads-landed): read any resolve as a landing; red.
    expect(groceryWriteOutcome({ items: [], totals: {} })).toEqual({ landed: true });
    expect(groceryWriteOutcome(null)).toEqual({ landed: true });
    expect(groceryWriteOutcome({ refused: "voided", at: "2026-10-13T12:00:00Z" })).toEqual({
      landed: false,
      refused: "voided",
    });
    expect(groceryWriteOutcome({ refused: "not_draft", at: "2026-10-13T12:00:00Z" })).toEqual({
      landed: false,
      refused: "not_draft",
    });
  });
});

describe("groceryRefusalSentence — honest, in the basket's words", () => {
  it("says what the server named", () => {
    // MUTATION (lcb/grocery-write/voided-unsaid): the generic retry — a retry that can never land; red.
    expect(groceryRefusalSentence("voided", "Jasmine rice")).toBe(
      "Our staff already took Jasmine rice off your basket.",
    );
    expect(groceryRefusalSentence("not_draft", "Jasmine rice")).toBe(
      "Jasmine rice can’t be changed now — ask our staff.",
    );
    expect(groceryRefusalSentence("sold_out", "Jasmine rice")).toBe(
      "Jasmine rice can’t be added right now.",
    );
  });
});
