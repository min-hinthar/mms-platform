import { describe, expect, it } from "vitest";
import { NO_HOLD, PICKED_HOLD_CAP_MS, heldFor, setHeld } from "./undo-hold";
import { PICKED_UNDO_MS, pickedUndoOpen } from "./expo-rules";

/**
 * Phase 2b · feedback — the lane's picked-up window HOLDS while a keyboard user sits on an Undo
 * (WCAG 2.2.1). The hold is a SET of sources (the toast's Undo, the card's in-slot Undo), because
 * both can be focused in one window and either may blur first; the tick reads
 * `pickedUndoOpen(at + heldFor(hold, now), now)`, so the expo-rules find strings stay untouched.
 */
describe("setHeld — a set of sources, one clock", () => {
  it("releasing a source that is not held changes nothing — the same Hold, the same time", () => {
    const toast = setHeld(NO_HOLD, "toast", true, 1_000);
    const after = setHeld(toast, "slot", false, 3_000);
    // MUTATION `an-unheld-release-counts`: the tap-focus blur (never held) folds time in, and the
    // toast's still-open hold is counted twice — the window stretches for a hold nobody made.
    expect(after).toBe(toast);
    expect(heldFor(after, 5_000)).toBe(4_000);
    expect(setHeld(NO_HOLD, "slot", false, 9_000)).toBe(NO_HOLD);
  });

  it("releasing ONE of two sources keeps the window held", () => {
    let h = setHeld(NO_HOLD, "toast", true, 1_000);
    h = setHeld(h, "slot", true, 1_500);
    h = setHeld(h, "toast", false, 2_000);
    // MUTATION `one-release-frees-every-source`: the toast's blur frees the slot's hold too — the
    // keyboard user still sitting on the card's Undo loses the window under them.
    expect([...h.sources]).toEqual(["slot"]);
    expect(heldFor(h, 10_000)).toBe(9_000);
    h = setHeld(h, "slot", false, 10_000);
    expect(h.sources.size).toBe(0);
    expect(heldFor(h, 99_000)).toBe(9_000);
  });

  it("holding a source twice is one hold, and a second hold later accumulates", () => {
    let h = setHeld(NO_HOLD, "toast", true, 1_000);
    expect(setHeld(h, "toast", true, 2_000)).toBe(h);
    h = setHeld(h, "toast", false, 3_000); // 2 s held
    h = setHeld(h, "slot", true, 10_000);
    expect(heldFor(h, 11_000)).toBe(3_000);
  });
});

describe("heldFor — the cap", () => {
  it("an open hold keeps the window open far past its six seconds — until the cap", () => {
    const at = 0;
    const h = setHeld(NO_HOLD, "slot", true, 5_000);
    expect(pickedUndoOpen(at + heldFor(h, 60_000), 60_000)).toBe(true);
    // The window's own six seconds, measured from the moment the held total reaches the cap.
    const closes = 5_000 + PICKED_HOLD_CAP_MS + PICKED_UNDO_MS - 5_000;
    expect(pickedUndoOpen(at + heldFor(h, closes - 1), closes - 1)).toBe(true);
    // MUTATION `the-hold-has-no-cap`: a focus left parked on Undo (a tablet walked away from) holds
    // the bag on the tracker and the wall forever.
    expect(pickedUndoOpen(at + heldFor(h, closes), closes)).toBe(false);
    expect(heldFor(h, 10 * PICKED_HOLD_CAP_MS)).toBe(PICKED_HOLD_CAP_MS);
  });
  it("PICKED_HOLD_CAP_MS is a minute", () => {
    expect(PICKED_HOLD_CAP_MS).toBe(60_000);
  });
});
