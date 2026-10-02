import { describe, expect, it, vi } from "vitest";
import {
  msSinceWriteSettled,
  onTrackedRejection,
  outReadSlot,
  outstanding,
  stalledSince,
  track,
} from "./bounded-write";
import { holdReload, reloadHolds } from "./reload-guard";
import { dispatchUpdate, updateSnapshot } from "./app-update";
import { thisLoad } from "./tab-load";
import {
  announceHandBacks,
  owedHandBacksNow,
  rememberHandBack,
  subscribeHandBacks,
  thisDocumentId,
} from "./settled-view";

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

/** Phase 2i (P2bi) — the answer-window stamp and the rejection witnesses are emptied too. */
describe("every case starts with no write answered and no witness listening", () => {
  const heard: unknown[] = [];
  it("a case may settle a write and install a witness…", async () => {
    onTrackedRejection((e) => {
      heard.push(e);
    });
    await track(Promise.resolve(1));
    expect(msSinceWriteSettled()).not.toBeNull();
  });

  it("…and the next case inherits neither", async () => {
    // MUTATION (p2i-setup/write-signals-leak): the setup's reset is gone — this case's quiet moment
    // is shortened by the first case's write, and the first case's witness hears this case's
    // rejection (a retired tab in a suite that never retired anything); red.
    expect(msSinceWriteSettled()).toBeNull();
    await track(Promise.reject(new Error("x"))).catch(() => {});
    expect(heard).toEqual([]);
  });
});

/** Phase 2i (P2bi) — the reload hold register is emptied too. */
describe("every case starts with no reload hold", () => {
  it("a case may leave a hold registered…", () => {
    holdReload({ kind: "sound", reason: "kdsSound", subject: "kds", survives: false });
    expect(reloadHolds()).toHaveLength(1);
  });

  it("…and the next case does not inherit it", () => {
    // MUTATION (p2i-setup/holds-leak): the setup's reset is gone — this case's automatic reload is
    // refused for a sound the first case turned on; red.
    expect(reloadHolds()).toEqual([]);
  });
});

/** Phase 2i (P2bi) — the update store and this document's claimed load are emptied too. */
describe("every case starts with a current screen and an unclaimed load", () => {
  it("a case may leave the screen stale and a load claimed…", () => {
    dispatchUpdate({ e: "retired", now: 0 });
    expect(updateSnapshot().phase.k).toBe("stale");
    vi.stubGlobal("window", { sessionStorage: null });
    vi.stubGlobal("location", { pathname: "/staff/expo" });
    expect(thisLoad().initialPath).toBe("/staff/expo");
    vi.unstubAllGlobals();
  });

  it("…and the next case inherits neither", () => {
    // MUTATION (p2i-setup/update-leaks): this case's row would render for a version nobody served
    // it, and its tap would meet another case's latch; red.
    expect(updateSnapshot().phase.k).toBe("current");
    // MUTATION (p2i-setup/load-leaks): this case's lane would resume against another case's load; red.
    vi.stubGlobal("window", { sessionStorage: null });
    vi.stubGlobal("location", { pathname: "/staff/kds" });
    expect(thisLoad().initialPath).toBe("/staff/kds");
    vi.unstubAllGlobals();
  });
});

/** Blind review (concurrency G) — the cash hand-back's document state is emptied too. */
describe("every case starts as a new document with no hand-back in memory and nobody listening", () => {
  const hb = { lineId: "l1", cents: 1105, name: "Mohinga", code: "AA0001", at: Date.now() };
  const heard: string[] = [];
  let firstDoc = "";
  it("a case may leave a hand-back in memory (storage refused), its hold, a listener, and what it said…", () => {
    firstDoc = thisDocumentId();
    subscribeHandBacks((what) => {
      heard.push(what);
    });
    expect(rememberHandBack(null, hb)).toBe("memory");
    expect(announceHandBacks([hb])).toBe(true);
    expect(reloadHolds()).toHaveLength(1);
  });

  it("…and the next case inherits none of it — and a new memory entry is held again", () => {
    // MUTATION (p2i-setup/handbacks-leak): the setup's reset is gone — this case is told about, and
    // says, the first case's refund; its id is the first case's, and the hold's release dangles; red.
    expect(thisDocumentId()).not.toBe(firstDoc);
    expect(owedHandBacksNow(null, Date.now())).toEqual([]);
    expect(announceHandBacks([hb])).toBe(true);
    heard.length = 0;
    expect(rememberHandBack(null, { ...hb, lineId: "l2" })).toBe("memory");
    // MUTATION (p2i-setup/listeners-leak): the first case's listener hears this case's answer; red.
    expect(heard).toEqual([]);
    expect(reloadHolds()).toEqual([
      expect.objectContaining({ kind: "unread", reason: "handBack" }),
    ]);
  });
});
