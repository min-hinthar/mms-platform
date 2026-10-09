import { describe, expect, it } from "vitest";
import { SAME_GESTURE_MS } from "@mms/ui";
import {
  ADD_UNDO_MS,
  chipArmed,
  undoOpen,
  undoSecondsLeft,
  undoFromAdd,
  undoOutcome,
  undoSentence,
  undoTargetQty,
  type AddUndo,
} from "./scan-undo";

/**
 * PD4 — the add-Undo's window and the chip's arm. Each MUTATION is a row in scripts/verify-slice.mjs
 * (`scan-undo/…`), induced and watched go red. The milliseconds are spelled out where the constant
 * is the subject, so a changed constant cannot stay green by reading itself (the M186 lesson).
 */

const u: AddUndo = {
  lineId: "l1",
  barcode: "2990000000017",
  name: "Tea Leaves -400g",
  confirmedQty: 1,
  openedAt: 1000,
};

describe("undoOpen — six seconds, slid by a keyboard hold", () => {
  it("the window is 6 s", () => {
    expect(ADD_UNDO_MS).toBe(6000);
    expect(undoOpen(u, 1000)).toBe(true);
    expect(undoOpen(u, 1000 + 5999)).toBe(true);
    // MUTATION: a minute-long window → the chip's "Add another" is gone for a minute; red.
    // MUTATION: a 100 ms window → the Undo is gone before the hand moves; red.
    expect(undoOpen(u, 1000 + 6000)).toBe(false);
  });

  it("a hold slides the start — the time held does not count", () => {
    expect(undoOpen(u, 1000 + 8000, 2500)).toBe(true);
    expect(undoOpen(u, 1000 + 8000, 1999)).toBe(false);
  });

  it("the seconds leaf counts down in whole seconds and never goes negative", () => {
    expect(undoSecondsLeft(u, 1000)).toBe(6);
    expect(undoSecondsLeft(u, 1000 + 4100)).toBe(2);
    expect(undoSecondsLeft(u, 1000 + 9000)).toBe(0);
    expect(undoSecondsLeft(u, 1000 + 7000, 3000)).toBe(2);
  });
});

describe("chipArmed — the chip ignores the closing double-tap (Codex correction 15)", () => {
  it("inside the same-gesture window after the sheet closed, the slot refuses", () => {
    // MUTATION: always armed → the second half of a double-tap buys a second jar; red.
    expect(chipArmed(5000, 5000)).toBe(false);
    expect(chipArmed(5000, 5000 + SAME_GESTURE_MS - 1)).toBe(false);
  });

  it("at the window's end it arms — and the window is @mms/ui's ONE constant", () => {
    expect(SAME_GESTURE_MS).toBe(350);
    expect(chipArmed(5000, 5000 + SAME_GESTURE_MS)).toBe(true);
  });

  it("no sheet closed this stay → always armed (a camera add never waits)", () => {
    expect(chipArmed(null, 0)).toBe(true);
  });
});

const view = (qty: number) => [
  { lineId: "l1", barcode: "2990000000017", name: "Tea Leaves -400g", qty },
];

describe("undoFromAdd — the record comes from the add's OWN confirmed view", () => {
  it("keeps the qty the add's own response reported", () => {
    // MUTATION: a fixed confirmedQty of 1 → an Undo on a ×2 line writes 0 and takes both units; red.
    expect(undoFromAdd({ barcode: "2990000000017", lines: view(2), openedAt: 5 })).toEqual({
      lineId: "l1",
      barcode: "2990000000017",
      name: "Tea Leaves -400g",
      confirmedQty: 2,
      openedAt: 5,
    });
  });

  it("no confirmed view, or a view without the line → no Undo is offered (its target would be a guess)", () => {
    expect(undoFromAdd({ barcode: "2990000000017", lines: null, openedAt: 5 })).toBeNull();
    expect(undoFromAdd({ barcode: "2990000000024", lines: view(1), openedAt: 5 })).toBeNull();
  });
});

describe("undoTargetQty — exactly one fewer than the add's confirmed qty", () => {
  it("THE INTERLEAVING: a read issued after the add applied first and left the client view at ×1; the add's own view says ×2 → the Undo writes 1, never 0", () => {
    // The page's client view is not an input to this rule at all — check:scan-repeat
    // proposition 6 pins that the page's write takes `undoTargetQty(<the record>)`.
    const fromTheAdd = undoFromAdd({ barcode: "2990000000017", lines: view(2), openedAt: 0 })!;
    expect(undoTargetQty(fromTheAdd)).toBe(1);
  });

  it("one fewer, never below zero", () => {
    // MUTATION: write 0 → an Undo on a line the basket held at ×1 before the add removes both; red.
    expect(undoTargetQty({ ...u, confirmedQty: 3 })).toBe(2);
    expect(undoTargetQty({ ...u, confirmedQty: 1 })).toBe(0);
    expect(undoTargetQty({ ...u, confirmedQty: 0 })).toBe(0);
  });
});

describe("undoOutcome — the words follow what the FOLLOW-UP read confirms", () => {
  const two = { ...u, confirmedQty: 2 }; // target 1

  it("the line is absent from the read → removed", () => {
    expect(undoOutcome(u, [])).toEqual({ kind: "removed" });
  });

  it("the read shows exactly the target → stepped to it", () => {
    expect(undoOutcome(two, [{ lineId: "l1", qty: 1 }])).toEqual({ kind: "stepped", qty: 1 });
  });

  it("AN INTERLEAVED WRITE: the read shows another qty → unconfirmed, never a past tense it does not show", () => {
    // MUTATION: trust the intended target whatever the read shows → "Tea Leaves × 1" over a list
    // that says ×2; red.
    expect(undoOutcome(two, [{ lineId: "l1", qty: 2 }])).toEqual({ kind: "unconfirmed" });
    // ...and a target of 0 whose line is still listed is not "Removed".
    expect(undoOutcome(u, [{ lineId: "l1", qty: 1 }])).toEqual({ kind: "unconfirmed" });
  });

  it("no read (it failed, or was refused) → unconfirmed", () => {
    // MUTATION: a missing read counts as an empty basket → "Removed" with nothing confirmed; red.
    expect(undoOutcome(u, null)).toEqual({ kind: "unconfirmed" });
  });
});

describe("undoSentence — past tense only for what was confirmed", () => {
  it("names each outcome", () => {
    expect(undoSentence({ kind: "removed" }, "Tea Leaves -400g")).toBe("Removed Tea Leaves -400g");
    expect(undoSentence({ kind: "stepped", qty: 1 }, "Tea Leaves -400g")).toBe(
      "Tea Leaves -400g × 1",
    );
    expect(undoSentence({ kind: "unconfirmed" }, "Tea Leaves -400g")).toBe(
      "Undo saved — checking your basket…",
    );
  });
});

describe("undoOpen — a write in flight never expires under the pill", () => {
  it("past the window, but removing → still open", () => {
    // MUTATION: ignore `removing` → the pill vanishes mid-write and its outcome lands on nothing; red.
    expect(undoOpen(u, 1000 + 9000, 0, true)).toBe(true);
    expect(undoOpen(u, 1000 + 9000, 0, false)).toBe(false);
  });
});
