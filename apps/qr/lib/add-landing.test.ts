import { describe, expect, it } from "vitest";
import { classifyAddLanding, partialAddNotice, type LineUnits } from "./add-landing";

/**
 * T21(c) — the landed count, tested on fixtures that SEPARATE the two implementations.
 *
 * The shipped defect counted BASKET-WIDE, so every fixture here carries a second dish that moves in
 * the same window. A fixture with one line would let the basket-wide sum and the per-item count
 * produce identical numbers — a degenerate fixture, which is exactly what a surviving mutant means.
 *
 * The near-cap numbers are real: the line maximum is 99, so "asked for 5 against a line at 98" is
 * the shape that yields a partial fill of 1.
 */

const line = (menuItemId: string, qty: number): LineUnits => ({ menuItemId, qty });

describe("classifyAddLanding — counts THIS dish, not the basket", () => {
  it("reports a full landing", () => {
    const r = classifyAddLanding({
      before: [line("mohinga", 1)],
      after: [line("mohinga", 6)],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r).toEqual({ landed: 5, outcome: "full" });
  });

  it("reports a partial fill at the 99 cap", () => {
    // 98 + 5 asked → 99 landed 1. The row's own worked example.
    const r = classifyAddLanding({
      before: [line("mohinga", 98)],
      after: [line("mohinga", 99)],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r).toEqual({ landed: 1, outcome: "partial" });
  });

  it("reports nothing landing when the line is already at the cap", () => {
    const r = classifyAddLanding({
      before: [line("mohinga", 99)],
      after: [line("mohinga", 99)],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r).toEqual({ landed: 0, outcome: "none" });
  });

  // ⚠️ THE SEPARATING CASE, and the defect that needed no cap to reach. A peer removes a unit of a
  // DIFFERENT dish inside our round trip. Basket-wide: 5 added − 1 removed = 4 → "Added 4 — that
  // line is now at our 99 max" about a dish sitting at 6 of 99. Per item: 5 → full, say nothing.
  it("ignores a peer's concurrent change to ANOTHER dish", () => {
    const r = classifyAddLanding({
      before: [line("mohinga", 1), line("tea", 3)],
      after: [line("mohinga", 6), line("tea", 2)],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r).toEqual({ landed: 5, outcome: "full" });
  });

  it("still reports a real cap when a peer moves another dish at the same time", () => {
    // The other direction of the same fixture: the cap is real, and a peer ADDING elsewhere must not
    // mask it. Basket-wide would read 1 + 4 = 5 → "full" → the overstatement stands uncorrected.
    const r = classifyAddLanding({
      before: [line("mohinga", 98), line("tea", 1)],
      after: [line("mohinga", 99), line("tea", 5)],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r).toEqual({ landed: 1, outcome: "partial" });
  });

  it("answers unknown — never a cap — when the count went DOWN", () => {
    // A peer removed OUR dish mid-add. The difference describes the table, not this tap, so there is
    // nothing honest to announce about it.
    const r = classifyAddLanding({
      before: [line("mohinga", 4), line("tea", 1)],
      after: [line("mohinga", 2), line("tea", 1)],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r).toEqual({ landed: -2, outcome: "unknown" });
  });

  it("treats an over-landing as full", () => {
    // A peer added the SAME dish inside the window. Over-reporting our own tap cannot mislead the
    // diner about what THEY did; claiming a cap that did not happen would.
    const r = classifyAddLanding({
      before: [line("mohinga", 1)],
      after: [line("mohinga", 9)],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r.outcome).toBe("full");
  });

  it("counts a dish that was not in the cart before", () => {
    const r = classifyAddLanding({
      before: [line("tea", 2)],
      after: [line("tea", 2), line("mohinga", 3)],
      menuItemId: "mohinga",
      requested: 3,
    });
    expect(r).toEqual({ landed: 3, outcome: "full" });
  });

  it("sums MULTIPLE lines of the same dish", () => {
    // One dish can hold several lines (different modifiers, seats, notes). A per-LINE count instead
    // of a per-DISH sum would read 2 here and invent a cap.
    const r = classifyAddLanding({
      before: [line("mohinga", 1), line("mohinga", 1)],
      after: [line("mohinga", 3), line("mohinga", 2)],
      menuItemId: "mohinga",
      requested: 3,
    });
    expect(r).toEqual({ landed: 3, outcome: "full" });
  });
});

describe("partialAddNotice — the two strings the diner already hears", () => {
  it("names the units that landed", () => {
    expect(partialAddNotice(1)).toBe("Added 1 — that line is now at our 99 max");
    expect(partialAddNotice(4)).toBe("Added 4 — that line is now at our 99 max");
  });

  it("says the line was already full when nothing landed", () => {
    expect(partialAddNotice(0)).toBe("That line is already at our 99 max");
  });
});
