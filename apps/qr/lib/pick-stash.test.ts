import { describe, expect, it } from "vitest";
import { PICKED_UNDO_MS } from "./expo-rules";
import {
  clearPickStash,
  mirrorPicks,
  mirrorStash,
  PICK_REMARK_KEY,
  PICK_REMARK_MS,
  PICK_RESUME_MS,
  PICK_STASH_KEY,
  readPickStash,
  readRemark,
  remarkLeft,
  remarkWithout,
  restorePicks,
  resumableUntil,
  writePickStash,
  writeRemark,
  type PickStash,
  type StashedPick,
} from "./pick-stash";
import type { TabStore } from "./settled-view";

/**
 * Phase 2i (P2bi · D3) — the lane's pick stash. Every rule a value can falsify lives here; the lane's
 * WIRING (mirror, first-read gate, hold) is pinned in `components/staff/ExpoBoard.test.tsx`.
 */
function memStore(): TabStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const throwing: TabStore = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("quota");
  },
  removeItem: () => {
    throw new Error("denied");
  },
};

const NOW = 1_800_000_000_000;
const PATH = "/staff/counter";
const pick = (orderId: string, ageMs: number, over: Partial<StashedPick> = {}): StashedPick => ({
  orderId,
  at: NOW - ageMs,
  subject: { kind: "bag", x: `#${orderId}` },
  committing: false,
  ...over,
});
/** A stash whose writer has UNLOADED (its `pagehide` stamp) — what a real reload leaves. */
const stash = (picks: StashedPick[], seq = 4, path = PATH): PickStash => ({
  v: 1,
  seq,
  path,
  picks,
  closed: true,
});
/** The load right after the stash's own document, at the same page. */
const NEXT = { seq: 5, initialPath: PATH };
const ready = (...ids: string[]) => new Set(ids);

describe("restorePicks — the immediately next load resumes", () => {
  it("reopens an open window with the time it had left, at its original moment", () => {
    const r = restorePicks(stash([pick("a", 2_000)]), NEXT, NOW, ready("a"));
    expect(r).toEqual({
      kind: "resume",
      reopen: [{ ...pick("a", 2_000), remainingMs: PICKED_UNDO_MS - 2_000 }],
      send: [],
    });
  });

  it("SENDS a committing entry even inside its window (its write was already on the wire)", () => {
    // MUTATION p2i-picks/open-sent-early is the reverse shape; this pins the committing half.
    const r = restorePicks(stash([pick("a", 1_000, { committing: true })]), NEXT, NOW, ready("a"));
    expect(r).toEqual({
      kind: "resume",
      reopen: [],
      send: [pick("a", 1_000, { committing: true })],
    });
  });

  it("an open window REOPENS — it is never sent before its time (p2i-picks/open-sent-early)", () => {
    const r = restorePicks(stash([pick("a", 0)]), NEXT, NOW, ready("a"));
    expect(r.kind).toBe("resume");
    if (r.kind !== "resume") return;
    expect(r.send).toEqual([]);
    expect(r.reopen.map((p) => p.orderId)).toEqual(["a"]);
  });

  it("an ELAPSED window sends — it never reopens with nothing left (p2i-picks/elapsed-reopened)", () => {
    const r = restorePicks(stash([pick("a", PICKED_UNDO_MS)]), NEXT, NOW, ready("a"));
    expect(r).toEqual({ kind: "resume", reopen: [], send: [pick("a", PICKED_UNDO_MS)] });
    const justOpen = restorePicks(stash([pick("b", PICKED_UNDO_MS - 1)]), NEXT, NOW, ready("b"));
    expect(justOpen.kind === "resume" && justOpen.reopen[0]?.remainingMs).toBe(1);
  });

  it("a clock that ran backwards reopens with the FULL window, rebased to now — never longer", () => {
    const r = restorePicks(stash([pick("a", -60_000)]), NEXT, NOW, ready("a"));
    expect(r.kind === "resume" && r.reopen[0]).toMatchObject({
      at: NOW,
      remainingMs: PICKED_UNDO_MS,
    });
  });

  it("splits a mixed stash: open windows reopen, the rest send", () => {
    const r = restorePicks(
      stash([pick("a", 1_000), pick("b", 30_000), pick("c", 500, { committing: true })]),
      NEXT,
      NOW,
      ready("a", "b", "c"),
    );
    expect(r.kind).toBe("resume");
    if (r.kind !== "resume") return;
    expect(r.reopen.map((p) => p.orderId)).toEqual(["a"]);
    expect(r.send.map((p) => p.orderId)).toEqual(["b", "c"]);
  });
});

describe("restorePicks — anything else is a remark, never a send", () => {
  it("a load that is not the immediately next one remarks (p2i-picks/next-load-ignored)", () => {
    for (const load of [
      { seq: 6, initialPath: PATH }, // a page in between
      { seq: 4, initialPath: PATH }, // the same document (a soft navigation back)
      { seq: 5, initialPath: "/staff/kitchen" }, // another page
      { seq: 0, initialPath: PATH }, // storage failed for the load counter
    ]) {
      const r = restorePicks(stash([pick("a", 1_000)]), load, NOW, ready("a"));
      expect(r).toEqual({ kind: "remark", bags: [pick("a", 1_000)] });
    }
  });

  it("the immediately next load past PICK_RESUME_MS remarks (p2i-picks/resume-ttl-ignored)", () => {
    expect(restorePicks(stash([pick("a", PICK_RESUME_MS)]), NEXT, NOW, ready("a"))).toEqual({
      kind: "remark",
      bags: [pick("a", PICK_RESUME_MS)],
    });
    expect(restorePicks(stash([pick("a", PICK_RESUME_MS - 1)]), NEXT, NOW, ready("a")).kind).toBe(
      "resume",
    );
  });

  it("the NEWEST pick decides resume — an old pick beside a young one still sends", () => {
    const r = restorePicks(
      stash([pick("old", PICK_RESUME_MS + 1), pick("young", 1_000)]),
      NEXT,
      NOW,
      ready("old", "young"),
    );
    expect(r.kind).toBe("resume");
    if (r.kind !== "resume") return;
    expect(r.send.map((p) => p.orderId)).toEqual(["old"]);
  });

  it("older than PICK_REMARK_MS is forgotten (p2i-picks/remark-ttl-ignored)", () => {
    const far = { seq: 9, initialPath: PATH };
    expect(restorePicks(stash([pick("a", PICK_REMARK_MS)]), far, NOW, ready("a"))).toEqual({
      kind: "none",
    });
    expect(restorePicks(stash([pick("a", PICK_REMARK_MS - 1)]), far, NOW, ready("a")).kind).toBe(
      "remark",
    );
    // …and on the immediately next load too, once past the resume window.
    expect(restorePicks(stash([pick("a", PICK_REMARK_MS)]), NEXT, NOW, ready("a"))).toEqual({
      kind: "none",
    });
  });

  it("a bag no longer ready is dropped — it landed or moved (p2i-picks/not-ready-kept)", () => {
    expect(restorePicks(stash([pick("a", 1_000)]), NEXT, NOW, ready("b"))).toEqual({
      kind: "none",
    });
    const r = restorePicks(stash([pick("a", 1_000), pick("b", 40_000)]), NEXT, NOW, ready("b"));
    expect(r).toEqual({ kind: "resume", reopen: [], send: [pick("b", 40_000)] });
    const far = restorePicks(
      stash([pick("a", 1_000)]),
      { seq: 9, initialPath: PATH },
      NOW,
      ready(),
    );
    expect(far).toEqual({ kind: "none" });
  });

  it("a duplicated order id is decided once", () => {
    const r = restorePicks(stash([pick("a", 40_000), pick("a", 40_000)]), NEXT, NOW, ready("a"));
    expect(r).toEqual({ kind: "resume", reopen: [], send: [pick("a", 40_000)] });
  });

  it("a stash whose writer is still OPEN remarks — a duplicated tab never resumes the original's picks (critic F5 · p2i-picks/open-writer-resumes)", () => {
    const { closed: _closed, ...open } = stash([pick("a", 1_000)]);
    expect(restorePicks(open, NEXT, NOW, ready("a"))).toEqual({
      kind: "remark",
      bags: [pick("a", 1_000)],
    });
    expect(restorePicks(stash([pick("a", 1_000)]), NEXT, NOW, ready("a")).kind).toBe("resume");
  });

  it("no stash → none", () => {
    expect(restorePicks(null, NEXT, NOW, ready("a"))).toEqual({ kind: "none" });
  });
});

describe("the stash in the tab — strict, and honest about the write", () => {
  it("round-trips", () => {
    const store = memStore();
    const s = stash([
      pick("a", 1_000),
      pick("t", 2_000, { subject: { kind: "table", id: 7 }, committing: true }),
      pick("v", 0, { subject: { kind: "verify", x: "Maya · #A1" } }),
    ]);
    expect(writePickStash(store, s)).toBe(true);
    expect(readPickStash(store)).toEqual(s);
    clearPickStash(store);
    expect(store.data.has(PICK_STASH_KEY)).toBe(false);
    expect(readPickStash(store)).toBeNull();
  });

  it("a write that throws answers false (p2i-picks/write-ok-lies)", () => {
    expect(writePickStash(throwing, stash([pick("a", 0)]))).toBe(false);
    expect(writePickStash(null, stash([pick("a", 0)]))).toBe(false);
  });

  it("round-trips an OPEN writer's stash without a stamp", () => {
    const store = memStore();
    const { closed: _closed, ...open } = stash([pick("a", 1_000)]);
    writePickStash(store, open);
    expect(readPickStash(store)).toEqual(open);
    expect(readPickStash(store)).not.toHaveProperty("closed");
  });

  it("a store that cannot REMOVE is overwritten with a stash nothing resumes or remarks (critic F7 · p2i-picks/clear-leaves-stash)", () => {
    const store = memStore();
    writePickStash(store, stash([pick("a", 1_000)], NEXT.seq - 1));
    store.removeItem = () => {
      throw new Error("denied");
    };
    clearPickStash(store);
    const left = readPickStash(store);
    expect(left?.picks).toEqual([]);
    expect(restorePicks(left, NEXT, NOW, ready("a"))).toEqual({ kind: "none" });
  });

  it("never throws on a store that does", () => {
    expect(readPickStash(throwing)).toBeNull();
    expect(() => clearPickStash(throwing)).not.toThrow();
    expect(readPickStash(null)).toBeNull();
  });

  it("refuses the WHOLE stash for one malformed entry (p2i-picks/parse-trusts)", () => {
    const good = pick("a", 0);
    const bad: unknown[] = [
      { ...good, orderId: "" },
      { ...good, orderId: 5 },
      { ...good, orderId: "x".repeat(101) },
      { ...good, at: "now" },
      { ...good, at: Number.POSITIVE_INFINITY },
      { ...good, committing: "no" },
      { ...good, subject: { kind: "table", id: 0 } },
      { ...good, subject: { kind: "table", id: 1.5 } },
      { ...good, subject: { kind: "bag", x: "" } },
      { ...good, subject: { kind: "bag", x: "x".repeat(201) } },
      { ...good, subject: { kind: "bag" } },
      { ...good, subject: { kind: "other", x: "a" } },
      { ...good, subject: null },
      null,
      "a",
    ];
    for (const entry of bad) {
      const store = memStore();
      store.setItem(
        PICK_STASH_KEY,
        JSON.stringify({ v: 1, seq: 4, path: PATH, picks: [good, entry] }),
      );
      expect(readPickStash(store), JSON.stringify(entry)).toBeNull();
    }
  });

  it("refuses a malformed envelope", () => {
    for (const raw of [
      "<html>",
      "null",
      "[]",
      JSON.stringify({ v: 2, seq: 4, path: PATH, picks: [] }),
      JSON.stringify({ v: 1, seq: -1, path: PATH, picks: [] }),
      JSON.stringify({ v: 1, seq: 1.5, path: PATH, picks: [] }),
      JSON.stringify({ v: 1, seq: 4, path: 3, picks: [] }),
      JSON.stringify({ v: 1, seq: 4, path: PATH, picks: {} }),
      JSON.stringify({ v: 1, seq: 4, path: PATH, picks: [], closed: false }),
      JSON.stringify({ v: 1, seq: 4, path: PATH, picks: [], closed: "yes" }),
    ]) {
      const store = memStore();
      store.setItem(PICK_STASH_KEY, raw);
      expect(readPickStash(store), raw).toBeNull();
    }
  });
});

describe("mirrorPicks · mirrorStash · resumableUntil", () => {
  it("keeps an undecided stash's picks beside the live ones; a live pick of the same bag wins", () => {
    const live = [pick("a", 0, { committing: true }), pick("c", 0)];
    expect(mirrorPicks([pick("a", 9_000), pick("b", 9_000)], live)).toEqual([
      pick("b", 9_000),
      ...live,
    ]);
    expect(mirrorPicks(null, live)).toEqual(live);
  });

  const HERE = { seq: 7, path: PATH };

  it("writes this document's load when nothing is undecided, and the `pagehide` stamp only when asked", () => {
    expect(mirrorStash(null, [pick("a", 0)], HERE)).toEqual({
      v: 1,
      seq: 7,
      path: PATH,
      picks: [pick("a", 0)],
    });
    expect(mirrorStash(null, [pick("a", 0)], HERE, true)).toEqual({
      v: 1,
      seq: 7,
      path: PATH,
      picks: [pick("a", 0)],
      closed: true,
    });
    expect(mirrorStash(null, [], HERE)).toBeNull();
  });

  it("an UNDECIDED stash keeps its OWN load and page — never this document's (critic F1 · p2i-picks/mirror-takes-this-load)", () => {
    const found = stash([pick("x", 9_000)], 3, "/staff");
    const s = mirrorStash(found, [pick("a", 0)], HERE);
    expect(s).toEqual({ v: 1, seq: 3, path: "/staff", picks: [pick("x", 9_000), pick("a", 0)] });
    // …so the load after this document's NEXT one can never read it as "immediately after".
    const next = { seq: HERE.seq + 1, initialPath: PATH };
    expect(restorePicks({ ...s!, closed: true }, next, NOW, ready("x", "a")).kind).toBe("remark");
  });

  it("resumableUntil: the oldest pick's moment + PICK_RESUME_MS, when the next load at this page would take it up", () => {
    const s = mirrorStash(null, [pick("a", 1_000), pick("b", 60_000)], HERE)!;
    // MUTATION (p2i-picks/resumable-newest): the NEWEST pick's bound — a reload after the oldest
    // turned PICK_RESUME_MS old, with only it still ready, would remark it; red.
    expect(resumableUntil(s, HERE)).toBe(NOW - 60_000 + PICK_RESUME_MS);
    // The very gates restorePicks applies, at either side of the bound — every subset still ready.
    const next = { seq: HERE.seq + 1, initialPath: PATH };
    const until = resumableUntil(s, HERE)!;
    for (const ids of [["a"], ["b"], ["a", "b"]]) {
      expect(restorePicks({ ...s, closed: true }, next, until - 1, new Set(ids)).kind).toBe(
        "resume",
      );
    }
    expect(restorePicks({ ...s, closed: true }, next, until, ready("b")).kind).not.toBe("resume");
  });

  it("resumableUntil: null when the next load would not resume at all (critic F4 · p2i-picks/resumable-any-load)", () => {
    // An undecided stranger's stash, on its own older load.
    const s = mirrorStash(stash([pick("x", 0)], 3), [pick("a", 0)], HERE);
    expect(resumableUntil(s, HERE)).toBeNull();
    // Another page wrote it, or the load counter failed (seq 0 → the next would be 1).
    expect(
      resumableUntil({ ...stash([pick("a", 0)], 7), path: "/staff/kitchen" }, HERE),
    ).toBeNull();
    expect(resumableUntil(stash([pick("a", 0)], 0), { seq: 0, path: PATH })).toBeNull();
    expect(resumableUntil(null, HERE)).toBeNull();
    expect(resumableUntil(stash([], 7), HERE)).toBeNull();
  });
});

describe("the 'mark these again' line — kept in the tab, and each bag leaves it alone (critic F2 · F3)", () => {
  it("round-trips; an empty line removes the key", () => {
    const store = memStore();
    const bags = [pick("a", 1_000), pick("t", 2_000, { subject: { kind: "table", id: 7 } })];
    writeRemark(store, bags);
    expect(readRemark(store)).toEqual(bags);
    writeRemark(store, []);
    expect(store.data.has(PICK_REMARK_KEY)).toBe(false);
    expect(readRemark(store)).toEqual([]);
  });

  it("is read strictly and never throws", () => {
    for (const raw of [
      "<html>",
      JSON.stringify({ v: 2, bags: [pick("a", 0)] }),
      JSON.stringify({ v: 1, bags: {} }),
      JSON.stringify({ v: 1, bags: [pick("a", 0), { ...pick("b", 0), orderId: "" }] }),
    ]) {
      const store = memStore();
      store.setItem(PICK_REMARK_KEY, raw);
      expect(readRemark(store), raw).toEqual([]);
    }
    expect(readRemark(throwing)).toEqual([]);
    expect(() => writeRemark(throwing, [pick("a", 0)])).not.toThrow();
    expect(readRemark(null)).toEqual([]);
  });

  it("remarkLeft keeps each bag still ready and younger than PICK_REMARK_MS — once (p2i-picks/remark-keeps-gone · remark-ttl-in-line)", () => {
    const bags = [pick("a", 1_000), pick("b", 1_000), pick("old", PICK_REMARK_MS), pick("a", 0)];
    expect(remarkLeft(bags, ready("b", "old", "a"), NOW)).toEqual([
      pick("a", 1_000),
      pick("b", 1_000),
    ]);
    expect(remarkLeft(bags, ready("b"), NOW)).toEqual([pick("b", 1_000)]);
    expect(remarkLeft(bags, ready(), NOW)).toEqual([]);
    expect(remarkLeft([pick("x", PICK_REMARK_MS - 1)], ready("x"), NOW)).toHaveLength(1);
  });

  it("remarkWithout takes ONE bag off the line (p2i-picks/remark-without-all)", () => {
    expect(remarkWithout([pick("a", 0), pick("b", 0)], "a")).toEqual([pick("b", 0)]);
    expect(remarkWithout([pick("a", 0)], "z")).toEqual([pick("a", 0)]);
  });
});
