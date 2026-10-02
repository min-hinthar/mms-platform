import { describe, expect, it } from "vitest";
import { PICKED_UNDO_MS } from "./expo-rules";
import {
  clearPickStash,
  mirrorPicks,
  PICK_REMARK_MS,
  PICK_RESUME_MS,
  PICK_STASH_KEY,
  readPickStash,
  remarkStands,
  restorePicks,
  writePickStash,
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
const stash = (picks: StashedPick[], seq = 4, path = PATH): PickStash => ({
  v: 1,
  seq,
  path,
  picks,
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
    ]) {
      const store = memStore();
      store.setItem(PICK_STASH_KEY, raw);
      expect(readPickStash(store), raw).toBeNull();
    }
  });
});

describe("mirrorPicks · remarkStands", () => {
  it("keeps an undecided stash's picks beside the live ones; a live pick of the same bag wins", () => {
    const live = [pick("a", 0, { committing: true }), pick("c", 0)];
    expect(mirrorPicks([pick("a", 9_000), pick("b", 9_000)], live)).toEqual([
      pick("b", 9_000),
      ...live,
    ]);
    expect(mirrorPicks(null, live)).toEqual(live);
  });

  it("the remark stands while ANY named bag is still ready", () => {
    expect(remarkStands(["a", "b"], ready("b"))).toBe(true);
    expect(remarkStands(["a", "b"], ready("c"))).toBe(false);
    expect(remarkStands([], ready("c"))).toBe(false);
  });
});
