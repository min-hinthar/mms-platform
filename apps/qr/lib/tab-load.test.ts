import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOAD_SEQ_KEY,
  claimLoad,
  isImmediatelyAfter,
  resetLoadForTests,
  thisLoad,
  type TabLoad,
} from "./tab-load";
import type { TabStore } from "./settled-view";

/**
 * Phase 2i (P2bi) — the load generation that binds every "resume after a reload" to the
 * IMMEDIATELY next load of the same page. A wrong `true` here re-sends work on a page nobody
 * reloaded (a stash minutes old, another page's picks); a wrong `false` only shows the "mark these
 * again" line — so every doubt answers false.
 */
function memStore(seed: Record<string, string> = {}): TabStore & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

afterEach(() => {
  resetLoadForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("claimLoad — one generation per document", () => {
  it("counts up from nothing, writing each claim", () => {
    // MUTATION (p2i-load/claim-not-written): the claim is never stored — every load is seq 1, and
    // a stash from two loads ago reads as the previous one; red.
    const s = memStore();
    expect(claimLoad(s, "/staff/expo")).toEqual({ seq: 1, initialPath: "/staff/expo" });
    expect(claimLoad(s, "/staff/expo")).toEqual({ seq: 2, initialPath: "/staff/expo" });
    expect(s.data[LOAD_SEQ_KEY]).toBe("2");
  });

  it("a junk or negative stored value restarts at 1, never NaN", () => {
    // MUTATION (p2i-load/claim-trusts-junk): a junk value becomes NaN and no load ever matches —
    // or a negative one makes a far-older stash look adjacent; red.
    expect(claimLoad(memStore({ [LOAD_SEQ_KEY]: "abc" }), "/p").seq).toBe(1);
    expect(claimLoad(memStore({ [LOAD_SEQ_KEY]: "-4" }), "/p").seq).toBe(1);
    expect(claimLoad(memStore({ [LOAD_SEQ_KEY]: "2.5" }), "/p").seq).toBe(1);
  });

  it("storage that throws, or none, claims seq 0", () => {
    const broken: TabStore = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(claimLoad(broken, "/p")).toEqual({ seq: 0, initialPath: "/p" });
    expect(claimLoad(null, "/p")).toEqual({ seq: 0, initialPath: "/p" });
  });
});

describe("isImmediatelyAfter — the next load of the same page, and nothing else", () => {
  const load: TabLoad = { seq: 5, initialPath: "/staff/expo" };

  it("the previous document at the same page: true", () => {
    expect(isImmediatelyAfter({ seq: 4, path: "/staff/expo" }, load)).toBe(true);
  });

  it("an older document (another page in between): false", () => {
    // MUTATION (p2i-load/any-prior-load): any earlier load matches — a lock → sign-in → lane path
    // re-sends picks a cashier already redid by hand; red.
    expect(isImmediatelyAfter({ seq: 3, path: "/staff/expo" }, load)).toBe(false);
  });

  it("the previous document at ANOTHER page: false", () => {
    // MUTATION (p2i-load/path-ignored): another page's stash resumes here; red.
    expect(isImmediatelyAfter({ seq: 4, path: "/staff/kds" }, load)).toBe(false);
  });

  it("a load whose claim failed (seq 0), or the first claimed load (seq 1), never matches", () => {
    // MUTATION (p2i-load/storage-failure-is-next): a stash written by a document whose own claim
    // failed reads as adjacent to the first claimed load — with no proof of which load came between; red.
    expect(isImmediatelyAfter({ seq: 0, path: "/p" }, { seq: 1, initialPath: "/p" })).toBe(false);
    expect(isImmediatelyAfter({ seq: -1, path: "/p" }, { seq: 0, initialPath: "/p" })).toBe(false);
  });
});

describe("thisLoad — claimed once per document, at the URL the document loaded", () => {
  function stubBrowser(store: TabStore, navName: string | null, pathname: string) {
    vi.stubGlobal("window", { sessionStorage: store });
    vi.stubGlobal("location", { pathname });
    vi.spyOn(performance, "getEntriesByType").mockReturnValue(
      navName === null ? [] : ([{ name: navName }] as unknown as PerformanceEntryList),
    );
  }

  it("is memoized — a second consumer reads the same generation", () => {
    // MUTATION (p2i-load/claimed-per-call): every call claims a new seq — the lane's own mirror
    // writes a seq its next load can never match; red.
    const s = memStore({ [LOAD_SEQ_KEY]: "6" });
    stubBrowser(s, "https://x.test/staff/expo?a=1", "/staff/expo");
    const a = thisLoad();
    const b = thisLoad();
    expect(a).toBe(b);
    expect(a.seq).toBe(7);
    expect(s.data[LOAD_SEQ_KEY]).toBe("7");
  });

  it("reads the path the DOCUMENT loaded at, not where a soft navigation has since moved", () => {
    // MUTATION (p2i-load/path-from-location): the current location is read — a lane reached by a
    // soft navigation claims the lane's path for a document that loaded elsewhere; red.
    stubBrowser(memStore(), "https://x.test/staff/floor", "/staff/expo");
    expect(thisLoad().initialPath).toBe("/staff/floor");
  });

  it("falls back to the location when there is no navigation entry", () => {
    stubBrowser(memStore(), null, "/staff/expo");
    expect(thisLoad().initialPath).toBe("/staff/expo");
  });

  it("on the server: seq 0 and nothing remembered", () => {
    expect(thisLoad()).toEqual({ seq: 0, initialPath: "" });
  });
});
