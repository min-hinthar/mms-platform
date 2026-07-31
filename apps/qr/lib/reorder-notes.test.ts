import { describe, expect, it } from "vitest";
import { carryNote, NOTES_MAX } from "./reorder-notes";

// W9c — this is the one guard in the slice with a safety consequence. The item sheet tells a diner
// "add any allergy in the note below and the kitchen will see it"; reorder silently dropped that note
// for the whole life of the feature. The rules below are what stops it happening again, and the
// truncation rule in particular is what stops a WORSE failure being introduced as a "fix".

describe("carryNote — a note that exists comes back", () => {
  it("carries a note verbatim, trimmed", () => {
    expect(carryNote("  no peanuts — allergy  ")).toEqual({
      carry: true,
      note: "no peanuts — allergy",
    });
  });

  it("carries a note of exactly the cap (the boundary is inclusive, like the column CHECK)", () => {
    const atCap = "x".repeat(NOTES_MAX);
    expect(carryNote(atCap)).toEqual({ carry: true, note: atCap });
  });
});

describe("carryNote — nothing to carry is not a failure", () => {
  it("an absent note reports nothing to disclose", () => {
    expect(carryNote(null)).toEqual({ carry: false, dropped: false });
    expect(carryNote(undefined)).toEqual({ carry: false, dropped: false });
  });

  it("a whitespace-only note is absent, not dropped — there is nothing to tell the diner", () => {
    expect(carryNote("   \n\t ")).toEqual({ carry: false, dropped: false });
  });

  it("a non-string (a malformed legacy row) is absent, never coerced", () => {
    expect(carryNote(42)).toEqual({ carry: false, dropped: false });
    expect(carryNote({ note: "no peanuts" })).toEqual({ carry: false, dropped: false });
  });
});

describe("carryNote — an over-cap note is DROPPED and disclosed, never truncated", () => {
  const long = `no peanuts, no shellfish, no sesame — severe allergy. ${"y".repeat(NOTES_MAX)}`;

  it("reports dropped so the caller can name the dish", () => {
    expect(carryNote(long)).toEqual({ carry: false, dropped: true });
  });

  it("NEVER returns a shortened note — a cut allergy list reads as complete and is not", () => {
    const r = carryNote(long);
    // The structural guarantee: there is no `note` field to render on the dropped arm at all, so no
    // caller can accidentally send a partial allergy list to the kitchen.
    expect("note" in r).toBe(false);
    expect(r.carry).toBe(false);
  });

  it("one character over the cap is already over — no silent grace margin", () => {
    expect(carryNote("z".repeat(NOTES_MAX + 1))).toEqual({ carry: false, dropped: true });
  });

  it("trims BEFORE measuring, so trailing spaces alone can't push a valid note over", () => {
    expect(carryNote("w".repeat(NOTES_MAX) + "    ")).toEqual({
      carry: true,
      note: "w".repeat(NOTES_MAX),
    });
  });
});
