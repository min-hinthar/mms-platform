import { describe, expect, it } from "vitest";
import { boardColumnFit } from "./board-fit";

describe("board-1 — the rush cut is a value: rows shown, rows hidden, the last slot for `+N more`", () => {
  it("shows everything that fits, and says nothing is hidden", () => {
    expect(boardColumnFit(4, 6)).toEqual({ shown: 4, more: 0 });
    expect(boardColumnFit(6, 6)).toEqual({ shown: 6, more: 0 });
  });
  it("an unmeasured column (Infinity) shows everything — the CSS clip holds it meanwhile", () => {
    expect(boardColumnFit(40, Infinity)).toEqual({ shown: 40, more: 0 });
  });
  it("past the cap, the LAST slot is the `+N more` row and the count includes every hidden card", () => {
    // MUTATION: `shown: cap` (no slot for the row) — the row pushes a card off the screen, red.
    expect(boardColumnFit(9, 8)).toEqual({ shown: 7, more: 2 });
    // MUTATION: `more: n - cap` — the row under-counts by one, red.
    expect(boardColumnFit(60, 6)).toEqual({ shown: 5, more: 55 });
  });
  it("a column with room for one row shows only the count", () => {
    expect(boardColumnFit(3, 1)).toEqual({ shown: 0, more: 3 });
    expect(boardColumnFit(3, 0)).toEqual({ shown: 0, more: 3 });
  });
  it("never shows a negative or fractional row count", () => {
    expect(boardColumnFit(-2, 6)).toEqual({ shown: 0, more: 0 });
    expect(boardColumnFit(5, 3.7)).toEqual({ shown: 2, more: 3 });
  });
});
