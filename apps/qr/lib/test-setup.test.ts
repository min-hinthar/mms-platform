import { describe, expect, it } from "vitest";
import { outReadSlot, outstanding, stalledSince, track } from "./bounded-write";

/**
 * Phase 2h (F7) — the stall ledger is emptied after every case by `lib/test-setup.ts` (vitest's
 * `setupFiles`). The two cases below run IN ORDER in one file, which is exactly the shape that
 * leaked: the first leaves an action hung, the second must not inherit it.
 */
describe("every case starts with an empty stall ledger", () => {
  it("a case may leave an action hung…", () => {
    track(new Promise(() => {}));
    expect(outstanding()).toBe(1);
  });

  it("…and the next case does not inherit it", () => {
    // MUTATION (p2h-core/ledger-reset-per-case): the setup's reset is gone — this case reads the
    // first one's hang, and in a component suite a money door refuses as "stuck" for it; red.
    expect(outstanding()).toBe(0);
    expect(stalledSince()).toBeNull();
  });
});

/** Codex r2 on #310 (B2) — the per-key register of a read still out is emptied after every case too. */
describe("every case starts with no read still out", () => {
  const rosterRead = () => {};
  it("a case may leave a roster read hung…", () => {
    outReadSlot<string[]>(rosterRead).current = new Promise(() => {});
    expect(outReadSlot<string[]>(rosterRead).current).not.toBeNull();
  });

  it("…and the next case's mount does not attach to it", () => {
    // MUTATION (p2h-cx2b/out-read-reset-per-case): the setup's reset is gone — this case's roster
    // mount would await the first case's hung read instead of its own, and pass or fail by its
    // position in the file; red.
    expect(outReadSlot<string[]>(rosterRead).current).toBeNull();
  });
});
