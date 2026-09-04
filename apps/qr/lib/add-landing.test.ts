import { describe, expect, it } from "vitest";
import { addShortfallNotice, classifyAddLanding, type LineUnits } from "./add-landing";

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

/** A line, identified. The id defaults from the dish so single-line fixtures read cleanly; the
 *  peer cases pass an explicit id, because a peer's line of the same dish is a DIFFERENT row. */
const line = (menuItemId: string, qty: number, id = menuItemId): LineUnits => ({
  id,
  menuItemId,
  qty,
});

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

  // ⚠️ THE CASE THE BLIND PASS FOUND MISSING, and the one where the shipped rule speaks. A single
  // line grows by 2 against a request of 5 — nothing else moved, so the shortfall IS this tap's, and
  // the cap sentence is owed. Without a fixture at exactly this shape, a rule that never spoke would
  // look as green as one that spoke correctly.
  it("reports the shortfall when this dish's only line grew short of the request AND hit the cap", () => {
    const r = classifyAddLanding({
      before: [line("mohinga", 97)],
      after: [line("mohinga", 99)],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r).toEqual({ landed: 2, outcome: "partial" });
  });

  // ⚠️ THE ROUND-3 CASE (Codex, #250). Line identity separates a PEER's row from ours; it cannot
  // separate two writes to the SAME row. An authorized host editing this very line during our add
  // moves it under us — from a snapshot of 10 the host sets 9, our 5 lands, the line reads 14 — a
  // net growth of 4 against a request of 5 with NOTHING capped and everything having worked.
  // `mms_cart_item_inc_qty` only short-fills at the column maximum, so the resulting quantity is the
  // evidence and the delta alone is an inference.
  it("answers unknown for a shortfall on a line nowhere near the cap", () => {
    const r = classifyAddLanding({
      before: [line("mohinga", 10)],
      after: [line("mohinga", 14)],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r.outcome).toBe("unknown");
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
      before: [line("mohinga", 4, "mine"), line("tea", 1)],
      after: [line("mohinga", 2, "mine"), line("tea", 1)],
      menuItemId: "mohinga",
      requested: 5,
    });
    // `landed` is 0, not -2: nothing was attributed, and a negative "units added" is not a number
    // any caller should be handed.
    expect(r).toEqual({ landed: 0, outcome: "unknown" });
  });

  // ⚠️ THE ROUND-1 FINDING (Codex, #250), and it is this module's own defect one level down. A dish
  // has SEVERAL lines — `insertOrIncLine` merges only into a row matching on seat AND added_by AND
  // fulfillment AND notes AND price — so a tablemate's line of the same dish is not ours. Our five
  // land in full while the peer decrements theirs by one: the aggregate says 4, and "Added 4 — that
  // line is now at our 99 max" would be a cap that never happened. Nothing here can attribute the
  // difference, so nothing here should describe it.
  // ⚠️ THE ROUND-1 CASE (Codex, #250), and attribution answers it EXACTLY rather than merely safely.
  // Summed over the dish this reads 4 (5 ours − 1 theirs) and would say "Added 4 — that line is now
  // at our 99 max" about a dish at 6 of 99. Attributed to the one line that grew, it is a full
  // landing and nothing is said at all — which is the truth.
  it("reports a FULL landing when a peer decrements their own same-dish line", () => {
    const r = classifyAddLanding({
      before: [line("mohinga", 1, "mine"), line("mohinga", 3, "theirs")],
      after: [line("mohinga", 6, "mine"), line("mohinga", 2, "theirs")],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r).toEqual({ landed: 5, outcome: "full" });
  });

  it("still sees a real shortfall when a peer's same-dish line vanishes in the window", () => {
    // Our line grew 1 → 5 against a request of 5, so four landed and the correction is owed. The
    // peer's disappearing line neither adds to that count nor hides it.
    const r = classifyAddLanding({
      before: [line("mohinga", 95, "mine"), line("mohinga", 3, "theirs")],
      after: [line("mohinga", 99, "mine")],
      menuItemId: "mohinga",
      requested: 5,
    });
    expect(r).toEqual({ landed: 4, outcome: "partial" });
  });

  // The bound on that rule: a peer moving the dish must not SUPPRESS a cap we can still see. Here
  // the shortfall is real and no line shrank, so the correction still fires.
  // TWO lines of one dish growing in the same window is the case nothing here can resolve: an add
  // grows exactly ONE line, so the other is a peer's — and which is which needs the seat the server
  // matched on, not the totals. Summing them speaks an inflated number ("Added 3" when one landed);
  // guessing speaks a confident one. Silence is the only honest answer, and it costs a correction
  // rather than inventing one. Both shapes: a brand-new peer line, and an existing one growing.
  it.each([
    [
      "a brand-new peer line",
      [line("mohinga", 98, "mine")],
      [line("mohinga", 99, "mine"), line("mohinga", 2, "theirs")],
    ],
    [
      "an existing peer line growing",
      [line("mohinga", 1, "mine"), line("mohinga", 1, "theirs")],
      [line("mohinga", 4, "mine"), line("mohinga", 3, "theirs")],
    ],
  ])("answers unknown when two lines of the dish grew (%s)", (_label, before, after) => {
    const r = classifyAddLanding({ before, after, menuItemId: "mohinga", requested: 5 });
    expect(r).toEqual({ landed: 0, outcome: "unknown" });
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

  it("attributes growth to the ONE line that moved, ignoring the dish's other lines", () => {
    // One dish holds several lines (different modifiers, seats, notes). Only ours grows; the
    // untouched sibling must neither add to the count nor make it unknowable.
    const r = classifyAddLanding({
      before: [line("mohinga", 1, "mine"), line("mohinga", 7, "theirs")],
      after: [line("mohinga", 4, "mine"), line("mohinga", 7, "theirs")],
      menuItemId: "mohinga",
      requested: 3,
    });
    expect(r).toEqual({ landed: 3, outcome: "full" });
  });
});

/**
 * ⚠️ THE NOTICE STATES NO COUNT, and that is what the fourth round of review established. A
 * resulting quantity of 99 proves the line is CAPPED; it does not make the delta attributable to
 * this add, because an authorized host editing the same row moves it under us. So the copy says what
 * the data proves and stops.
 */
describe("addShortfallNotice — says what is known, and nothing more", () => {
  it("names the cap when the line is provably at it", () => {
    expect(addShortfallNotice("partial")).toBe(
      "Some of that couldn’t be added — that line is at our 99 max",
    );
  });

  it("states the outcome WITHOUT a cause when nothing landed", () => {
    // A zero can be the cap or a comped sibling (T25) — naming either would be a guess.
    expect(addShortfallNotice("none")).toBe("Nothing was added — your order below is up to date");
  });

  it.each(["full", "unknown"] as const)("says nothing for %s", (outcome) => {
    expect(addShortfallNotice(outcome)).toBeNull();
  });

  it("never states a COUNT OF UNITS — the one number that is not attributable", () => {
    // Precise on purpose: 99 is the column maximum, a constant the server proves, and naming it is
    // fine. What no branch may say is how many units THIS tap added, because a concurrent write to
    // the same row makes that delta someone else's too.
    for (const o of ["full", "partial", "none", "unknown"] as const) {
      expect(addShortfallNotice(o) ?? "").not.toMatch(/\bAdded\s+\d/);
    }
  });
});
