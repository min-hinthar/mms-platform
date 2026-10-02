import { tabStore, type TabStore } from "./settled-view";

/**
 * Phase 2i (P2bi) — which DOCUMENT load of this tab this is, so a stash written by one document is
 * resumed only by the IMMEDIATELY next load of the same page — never by a TTL alone.
 *
 * Why a generation and not a clock: what may resume (the lane's picks re-sending, say) must only run
 * on the reload that interrupted them. Same-page reloads count — our own `location.reload()`, Next's
 * revalidation reload, the stall ReloadButton, a chunk reload. A soft navigation and back minutes
 * later does not (it is the same document, and a stash is consumed once), and neither does a lock →
 * sign-in or any other page in between (another document, or another path).
 *
 * ⚠️ EVERY DOCUMENT CLAIMS, not only the ones that read it (S0 critic F5): the root layout mounts
 * `LoadClaim`, which calls `thisLoad()` at hydration. Claimed lazily by its consumers, a page in
 * between that never read it left the counter unmoved, and the next lane document read as
 * "immediately after" the one before the page in between.
 *
 * The counter lives in sessionStorage (per tab, survives a reload of the tab). Storage that throws
 * or is absent claims seq 0, which `isImmediatelyAfter` never matches — the safe direction: nothing
 * resumes, the caller shows its "mark these again" line instead.
 */
export const LOAD_SEQ_KEY = "mms.tab.loadSeq";
export type TabLoad = { seq: number; initialPath: string };

/** Read the previous seq (a non-negative integer, else 0), write prev+1, return it. Any storage
 *  failure → seq 0. */
export function claimLoad(store: TabStore | null, initialPath: string): TabLoad {
  if (store === null) return { seq: 0, initialPath };
  try {
    const raw = store.getItem(LOAD_SEQ_KEY);
    const n = raw === null ? 0 : Number(raw);
    const prev = Number.isSafeInteger(n) && n >= 0 ? n : 0;
    const seq = prev + 1;
    store.setItem(LOAD_SEQ_KEY, String(seq));
    return { seq, initialPath };
  } catch {
    return { seq: 0, initialPath };
  }
}

/** The path THIS document loaded at: the navigation entry's URL (a soft navigation since then
 *  does not change it), else `location.pathname`. */
function documentPath(): string {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav !== undefined && nav.name !== "") return new URL(nav.name).pathname;
  } catch {
    // Deliberate: no navigation timing (an old engine, a test) falls back to the location below.
  }
  return location.pathname;
}

let memo: TabLoad | null = null;

/**
 * This document's load, claimed ONCE per document (module instance) and memoized: every later call
 * — a remount, a second consumer — reads the same generation. On the server there is no tab: seq 0,
 * never memoized (module state there is shared across requests).
 */
export function thisLoad(): TabLoad {
  if (typeof window === "undefined") return { seq: 0, initialPath: "" };
  if (memo !== null) return memo;
  memo = claimLoad(tabStore(), documentPath());
  return memo;
}

/** `written` came from the IMMEDIATELY previous document of this tab, at the page this one loaded at. */
export function isImmediatelyAfter(written: { seq: number; path: string }, load: TabLoad): boolean {
  return load.seq > 1 && written.seq === load.seq - 1 && written.path === load.initialPath;
}

/** Test seam: forget this document's claimed load. */
export function resetLoadForTests(): void {
  memo = null;
}
