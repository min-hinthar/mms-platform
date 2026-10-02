import { afterEach, describe, expect, it } from "vitest";
import {
  ANSWER_READ_MS,
  QUIET_MS,
  RETIRED_ANSWER_MS,
  RETIRED_QUIET_MS,
  autoBlock,
  blockKey,
  holdReload,
  manualBlock,
  reloadHolds,
  resetHoldsForTests,
  subscribeReloadHolds,
  type ApplyBlock,
  type GuardInput,
  type Hold,
  type HoldInput,
} from "./reload-guard";
import { STAFF } from "./i18n/staff";

/**
 * Phase 2i (P2bi) — the hold register and the two reload verdicts. Every case is a moment on a real
 * staff screen: a lane with a bag picked up seconds ago, a KDS with its Undo bar showing, a counter
 * whose bell is on. MANUAL refuses only what a reload would silently lose; AUTO refuses everything
 * that could be lost or unread; RETIRED relaxes exactly three things.
 */
afterEach(() => {
  resetHoldsForTests();
});

/** A screen at rest: online, nothing held, nothing out, long quiet. Auto would reload it. */
const IDLE: GuardInput = {
  online: true,
  holds: [],
  youngWrite: false,
  stalledWrite: false,
  ownWait: false,
  msSinceWriteSettled: null,
  msSinceInput: QUIET_MS + ANSWER_READ_MS,
  dialogOpen: false,
  typing: false,
  retired: false,
};
let seq = 0;
const hold = (h: Partial<Hold> & Pick<Hold, "kind" | "reason">): Hold => ({
  subject: "s",
  survives: false,
  seq: ++seq,
  ...h,
});
const PICK = () => hold({ kind: "unsent", reason: "pick" });
const UNDO = () => hold({ kind: "unsent", reason: "kitchenUndo" });
const RECALL = () => hold({ kind: "unread", reason: "kitchenRecall" });
const OFFER = () => hold({ kind: "standing", reason: "reloadOffer" });
const SOUND = () => hold({ kind: "sound", reason: "kdsSound" });
const both = (i: Partial<GuardInput>) => [
  manualBlock({ ...IDLE, ...i }),
  autoBlock({ ...IDLE, ...i }),
];

describe("the register — token-bound holds", () => {
  it("two holds for one reason: releasing one leaves the other", () => {
    // MUTATION (p2i-guard/release-by-reason): a release drops every hold of its reason — one pick's
    // window closing frees the reload over another still open; red.
    const a = holdReload({ kind: "unsent", reason: "pick", subject: "o1", survives: false });
    holdReload({ kind: "unsent", reason: "pick", subject: "o2", survives: false });
    a();
    expect(reloadHolds().map((h) => h.subject)).toEqual(["o2"]);
  });

  it("a release is idempotent — a second call never takes another token's hold", () => {
    // MUTATION (p2i-guard/double-release-steals): Strict Mode's double cleanup releases a NEWER
    // registration of the same reason; red.
    const a = holdReload({ kind: "unsent", reason: "pick", subject: "o1", survives: false });
    holdReload({ kind: "unsent", reason: "pick", subject: "o2", survives: false });
    a();
    a();
    expect(reloadHolds()).toHaveLength(1);
  });

  it("the snapshot keeps its identity until a change (useSyncExternalStore), and changes notify", () => {
    // MUTATION (p2i-guard/snapshot-fresh): a fresh array per read — React re-renders forever; red.
    let calls = 0;
    const off = subscribeReloadHolds(() => {
      calls++;
    });
    const first = reloadHolds();
    expect(reloadHolds()).toBe(first);
    const release = holdReload({
      kind: "sound",
      reason: "bellSound",
      subject: "c",
      survives: false,
    });
    expect(calls).toBe(1);
    const second = reloadHolds();
    expect(second).not.toBe(first);
    expect(reloadHolds()).toBe(second);
    release();
    expect(calls).toBe(2);
    off();
    holdReload({ kind: "sound", reason: "bellSound", subject: "c", survives: false });
    expect(calls).toBe(2);
  });

  it("holds come out oldest first, each with its own seq", () => {
    holdReload({ kind: "unsent", reason: "kitchenUndo", subject: "k", survives: false });
    holdReload({ kind: "unsent", reason: "pick", subject: "l", survives: true });
    const hs = reloadHolds();
    expect(hs.map((h) => h.reason)).toEqual(["kitchenUndo", "pick"]);
    expect(hs[0]!.seq).toBeLessThan(hs[1]!.seq);
    expect(hs[1]!.survives).toBe(true);
  });
});

describe("shared precedence (both verdicts)", () => {
  it("a screen at rest: neither refuses", () => {
    expect(both({})).toEqual([null, null]);
  });

  it("offline outranks a held pick", () => {
    // MUTATION (p2i-guard/hold-outranks-offline): the pick's sentence is said on a dead network,
    // and the person waits for a save that cannot happen; red.
    expect(both({ online: false, holds: [PICK()] })).toEqual([
      { kind: "offline" },
      { kind: "offline" },
    ]);
  });

  it("unsent work refuses manual AND auto, oldest first", () => {
    // MUTATION (p2i-guard/manual-ignores-unsent): a tap reloads over an open pick window or the KDS
    // Undo bar, and the bag reads ready again / the Undo is gone; red.
    expect(both({ holds: [PICK()] })).toEqual([
      { kind: "hold", reason: "pick" },
      { kind: "hold", reason: "pick" },
    ]);
    expect(manualBlock({ ...IDLE, holds: [UNDO()] })).toEqual({
      kind: "hold",
      reason: "kitchenUndo",
    });
    // MUTATION (p2i-guard/unsent-newest-first): the NEWEST unsent hold is named; red.
    const older = UNDO();
    const newer = PICK();
    expect(manualBlock({ ...IDLE, holds: [newer, older] })).toEqual({
      kind: "hold",
      reason: "kitchenUndo",
    });
  });

  it("a young write refuses — even while a read is stalled", () => {
    // MUTATION (p2i-guard/manual-ignores-young): a tap reloads over a write still saving; red.
    expect(both({ youngWrite: true, stalledWrite: true })).toEqual([
      { kind: "saving" },
      { kind: "saving" },
    ]);
  });
});

describe("manual — only what a reload would silently lose", () => {
  it("a stall or an own wait never refuses a person: the reload is the cure", () => {
    // MUTATION (p2i-guard/manual-refuses-the-cure): the stuck screen's own Reload is refused; red.
    expect(manualBlock({ ...IDLE, stalledWrite: true })).toBeNull();
    expect(manualBlock({ ...IDLE, ownWait: true })).toBeNull();
  });

  it("live sound never refuses a person (the 2g deadlock) — but holds auto", () => {
    // MUTATION (p2i-guard/sound-blocks-manual): a sound-live board can never be reloaded at all; red.
    expect(both({ holds: [SOUND()] })).toEqual([null, { kind: "hold", reason: "kdsSound" }]);
  });

  it("unread lines, a standing offer, a dialog and typing never refuse a person", () => {
    // MUTATION (p2i-guard/unread-blocks-manual): the person tapping IS reading; refused, they are
    // stuck on an old screen for a line they have already seen; red.
    expect(manualBlock({ ...IDLE, holds: [RECALL()] })).toBeNull();
    expect(manualBlock({ ...IDLE, holds: [OFFER()] })).toBeNull();
    expect(manualBlock({ ...IDLE, dialogOpen: true, typing: true })).toBeNull();
    expect(manualBlock({ ...IDLE, msSinceInput: 0, msSinceWriteSettled: 0 })).toBeNull();
  });
});

describe("auto — every contributor refuses on its own", () => {
  const cases: Array<[string, Partial<GuardInput>, ApplyBlock]> = [
    // MUTATION (p2i-guard/auto-ignores-stall)
    ["a stalled write", { stalledWrite: true }, { kind: "waiting" }],
    // MUTATION (p2i-guard/auto-ignores-ownwait)
    ["a money surface's own wait", { ownWait: true }, { kind: "waiting" }],
    // MUTATION (p2i-guard/auto-ignores-unread)
    ["an unread line", { holds: [RECALL()] }, { kind: "hold", reason: "kitchenRecall" }],
    // MUTATION (p2i-guard/auto-ignores-standing)
    ["a standing reload offer", { holds: [OFFER()] }, { kind: "hold", reason: "reloadOffer" }],
    // MUTATION (p2i-guard/auto-ignores-sound)
    ["live sound", { holds: [SOUND()] }, { kind: "hold", reason: "kdsSound" }],
    // MUTATION (p2i-guard/auto-ignores-screen)
    ["an open dialog", { dialogOpen: true }, { kind: "screen" }],
    // MUTATION (p2i-guard/auto-ignores-typing)
    ["typing", { typing: true }, { kind: "screen" }],
  ];
  it.each(cases)("%s", (_name, input, block) => {
    expect(autoBlock({ ...IDLE, ...input })).toEqual(block);
  });

  it("the quiet window refuses UNDER QUIET_MS, and not at it", () => {
    // MUTATION (p2i-guard/quiet-off-by-one): `<=`; red.
    expect(autoBlock({ ...IDLE, msSinceInput: QUIET_MS - 1 })).toEqual({ kind: "input" });
    expect(autoBlock({ ...IDLE, msSinceInput: QUIET_MS })).toBeNull();
  });

  it("the answer window refuses UNDER ANSWER_READ_MS, and not at it; null (no write yet) never refuses", () => {
    // MUTATION (p2i-guard/answer-off-by-one): `<=`; red.
    expect(autoBlock({ ...IDLE, msSinceWriteSettled: ANSWER_READ_MS - 1 })).toEqual({
      kind: "answer",
    });
    expect(autoBlock({ ...IDLE, msSinceWriteSettled: ANSWER_READ_MS })).toBeNull();
    expect(autoBlock({ ...IDLE, msSinceWriteSettled: null })).toBeNull();
  });
});

describe("retired — relaxes exactly three things (W3)", () => {
  const R = { retired: true };
  it("a young write still refuses both", () => {
    // MUTATION (p2i-guard/retired-relaxes-young): a rename retires ONE id — the write still saving
    // may land, and a reload over it loses it; red.
    expect(both({ ...R, youngWrite: true })).toEqual([{ kind: "saving" }, { kind: "saving" }]);
  });
  it("a stall still refuses auto", () => {
    // MUTATION (p2i-guard/retired-relaxes-stall); red.
    expect(autoBlock({ ...IDLE, ...R, stalledWrite: true })).toEqual({ kind: "waiting" });
  });
  it("an unread line still refuses auto", () => {
    // MUTATION (p2i-guard/retired-relaxes-unread): a money line is reloaded away unread; red.
    expect(autoBlock({ ...IDLE, ...R, holds: [RECALL()] })).toEqual({
      kind: "hold",
      reason: "kitchenRecall",
    });
  });
  it("a dialog or typing still refuses auto", () => {
    // MUTATION (p2i-guard/retired-relaxes-dialog); red.
    expect(autoBlock({ ...IDLE, ...R, dialogOpen: true })).toEqual({ kind: "screen" });
    expect(autoBlock({ ...IDLE, ...R, typing: true })).toEqual({ kind: "screen" });
  });
  it("unsent work that is NOT stashed still refuses both", () => {
    // MUTATION (p2i-guard/retired-relaxes-unsurviving): the KDS Undo bar is reloaded away; red.
    expect(both({ ...R, holds: [UNDO()] })).toEqual([
      { kind: "hold", reason: "kitchenUndo" },
      { kind: "hold", reason: "kitchenUndo" },
    ]);
  });
  it("live sound no longer holds auto", () => {
    // MUTATION (p2i-guard/retired-keeps-sound): a retired KDS whose sound is on is never reloaded
    // by itself, and keeps dropping some taps; red.
    expect(autoBlock({ ...IDLE, ...R, holds: [SOUND()] })).toBeNull();
  });
  it("unsent work that IS stashed no longer refuses either", () => {
    // MUTATION (p2i-guard/retired-keeps-surviving): the lane's stashed picks hold a retired screen
    // that is dropping taps; red.
    expect(
      both({ ...R, holds: [hold({ kind: "unsent", reason: "pick", survives: true })] }),
    ).toEqual([null, null]);
    // …and a stashed pick still refuses a screen that is NOT retired.
    expect(
      manualBlock({ ...IDLE, holds: [hold({ kind: "unsent", reason: "pick", survives: true })] }),
    ).toEqual({
      kind: "hold",
      reason: "pick",
    });
  });
  it("the windows shorten — never vanish", () => {
    // MUTATION (p2i-guard/retired-quiet-unshortened · retired-answer-unshortened): the retired
    // screen waits the full windows while it drops taps; red.
    expect(autoBlock({ ...IDLE, ...R, msSinceInput: RETIRED_QUIET_MS - 1 })).toEqual({
      kind: "input",
    });
    expect(autoBlock({ ...IDLE, ...R, msSinceInput: RETIRED_QUIET_MS })).toBeNull();
    expect(
      autoBlock({
        ...IDLE,
        ...R,
        msSinceInput: QUIET_MS,
        msSinceWriteSettled: RETIRED_ANSWER_MS - 1,
      }),
    ).toEqual({ kind: "answer" });
    expect(
      autoBlock({ ...IDLE, ...R, msSinceInput: QUIET_MS, msSinceWriteSettled: RETIRED_ANSWER_MS }),
    ).toBeNull();
  });
});

describe("blockKey — the refusal sentence, named once", () => {
  it("every block a person can meet at a tap has its sentence; auto-only blocks have none", () => {
    // MUTATION (p2i-guard/key-crossed): two blocks share or swap a sentence; red.
    const visible: Array<[ApplyBlock, keyof typeof STAFF]> = [
      [{ kind: "offline" }, "shell.version.wait.offline"],
      [{ kind: "down" }, "shell.version.wait.down"],
      [{ kind: "check" }, "shell.version.wait.check"],
      [{ kind: "saving" }, "shell.version.wait.saving"],
      [{ kind: "hold", reason: "pick" }, "shell.version.wait.pick"],
      [{ kind: "hold", reason: "kitchenUndo" }, "shell.version.wait.undo"],
    ];
    for (const [b, k] of visible) expect(blockKey(b)).toBe(k);
    for (const b of [
      { kind: "waiting" },
      { kind: "screen" },
      { kind: "input" },
      { kind: "answer" },
      { kind: "hold", reason: "kdsSound" },
      { kind: "hold", reason: "kitchenRecall" },
    ] as ApplyBlock[])
      expect(blockKey(b)).toBeNull();
  });

  it("every block manualBlock can return has a sentence (no silent refusal at a tap)", () => {
    const inputs: Array<Partial<GuardInput>> = [
      { online: false },
      { holds: [PICK()] },
      { holds: [UNDO()] },
      { youngWrite: true },
    ];
    for (const i of inputs) {
      const b = manualBlock({ ...IDLE, ...i });
      expect(b).not.toBeNull();
      expect(blockKey(b!)).not.toBeNull();
    }
  });
});

describe("a hold's kind fixes its reason (S0 critic F6)", () => {
  it("the compiler refuses a kind/reason mismatch, so every unsent block has a sentence", () => {
    // Red-first by `tsc`: with an unpaired `Hold`, each directive below is UNUSED and the typecheck
    // fails. Never registered — the mismatched literals exist only to be refused.
    // @ts-expect-error — an unsent hold cannot carry an unread reason (blockKey could not say it)
    const a: HoldInput = { kind: "unsent", reason: "paneLine", subject: "", survives: false };
    // @ts-expect-error — a sound hold cannot carry a standing reason
    const b: HoldInput = { kind: "sound", reason: "reloadOffer", subject: "", survives: false };
    expect([a.kind, b.kind]).toEqual(["unsent", "sound"]);
    for (const reason of ["pick", "kitchenUndo"] as const) {
      const release = holdReload({ kind: "unsent", reason, subject: "k", survives: false });
      expect(blockKey(manualBlock({ ...IDLE, holds: reloadHolds() })!)).not.toBeNull();
      release();
    }
  });
});
