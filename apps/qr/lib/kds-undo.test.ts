import { describe, expect, it } from "vitest";
import { KDS_UNDO_MS } from "./kds-undo";

/**
 * PD5 (round 3) — the ONE settle constant, pinned. The undo pill, the TV's table TURN, the phone's
 * pay door and the staff guide's "6 seconds" all read this value; a drift here opens the pay door
 * while Mom can still take a bump back, or shortens the only way back from a mis-tap.
 */
describe("KDS_UNDO_MS — the kitchen's one settle window", () => {
  it("is exactly six seconds (`kds-undo/window-shortened`, `kds-undo/window-lengthened`)", () => {
    expect(KDS_UNDO_MS).toBe(6_000);
  });
});
