import { describe, expect, it } from "vitest";
import { SAME_GESTURE_MS } from "@mms/ui";
import {
  ADD_UNDO_MS,
  chipArmed,
  undoOpen,
  undoSecondsLeft,
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

describe("undoTargetQty — one fewer, never below zero", () => {
  it("steps the line down by exactly the one that was added", () => {
    // MUTATION: write 0 → an Undo on a ×3 line removes all three; red.
    expect(undoTargetQty(3)).toBe(2);
    expect(undoTargetQty(1)).toBe(0);
    expect(undoTargetQty(0)).toBe(0);
  });
});
