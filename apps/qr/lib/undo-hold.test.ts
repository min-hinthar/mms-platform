import { describe, expect, it } from "vitest";
import {
  NO_HOLD,
  PICKED_HOLD_CAP_MS,
  PICKED_HOLD_WARN_MS,
  capRelease,
  heldFor,
  holdCapPhase,
  pruneToLive,
  setHeld,
} from "./undo-hold";
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

// ── Blind review (2026-09-24) — the cap WARNS, then LETS GO, visibly ──
describe("holdCapPhase / capRelease — a hold that reaches its cap is released, after a warning", () => {
  const CAP = PICKED_HOLD_CAP_MS;
  const WARN = PICKED_HOLD_WARN_MS;
  it("warns inside the last PICKED_HOLD_WARN_MS before the cap, and releases AT it", () => {
    const h = setHeld(NO_HOLD, "toast", true, 1_000);
    expect(holdCapPhase(h, 1_000 + CAP - WARN - 1)).toBe("none");
    // MUTATION `the-cap-never-warns`: the pick lands under a keyboard user with no word first.
    expect(holdCapPhase(h, 1_000 + CAP - WARN)).toBe("warn");
    expect(holdCapPhase(h, 1_000 + CAP - 1)).toBe("warn");
    // MUTATION `the-cap-never-releases`: the drain stays paused (data-held) over a window that is
    // really running — the pill claims a hold the lane no longer honours.
    expect(holdCapPhase(h, 1_000 + CAP)).toBe("release");
    expect(holdCapPhase(h, 1_000 + 10 * CAP)).toBe("release");
    // Nothing holds → nothing to warn about or release, however much time was spent.
    expect(holdCapPhase(setHeld(h, "toast", false, 1_000 + CAP), 1_000 + 2 * CAP)).toBe("none");
  });

  it("the release holds nothing and has spent the whole cap — the window runs its own rest", () => {
    const h = setHeld(setHeld(NO_HOLD, "toast", true, 1_000), "slot", true, 2_000);
    const r = capRelease(h, 1_000 + CAP + 500);
    expect(r.sources.size).toBe(0);
    expect(r.since).toBeNull();
    expect(heldFor(r, 10 * CAP)).toBe(CAP);
  });

  it("a spent hold is never re-held — a new keyboard focus cannot pause the drain again", () => {
    const r = capRelease(setHeld(NO_HOLD, "toast", true, 0), CAP);
    // MUTATION `a-spent-hold-re-holds`: focus lands on Undo again after the release and data-held
    // comes back over a window that is still closing.
    expect(setHeld(r, "slot", true, CAP + 1_000)).toBe(r);
    // An unspent hold still re-holds (the rule is the cap, not "ever held").
    const partial = setHeld(setHeld(NO_HOLD, "toast", true, 0), "toast", false, 1_000);
    expect(setHeld(partial, "slot", true, 5_000).sources.has("slot")).toBe(true);
  });
});

describe("pruneToLive — a bag that left the lane takes its entries with it, deleted", () => {
  it("deletes exactly the ids not in the queue, and reports them", () => {
    const m = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    // MUTATION `the-prune-keeps-dead-entries`: a lane that runs all shift keeps one per bag.
    expect(pruneToLive(m, new Set(["b"]))).toEqual(["a", "c"]);
    expect([...m.keys()]).toEqual(["b"]);
    expect(pruneToLive(m, new Set(["b"]))).toEqual([]);
  });
});
