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
 *
 * ⚠️ THE COUNTER CANNOT SEE ANOTHER ORIGIN (Codex r2 on #311). A document of another site in between
 * (the operator left for a payment page and came back), or a closed tab restored with its storage,
 * never claims here — so on the counter alone the lane's next document reads as "immediately after"
 * and sends picks minutes old. So a load also has to PROVE it continues the last one by its own
 * navigation (`loadContinues`): a reload, or a navigation whose referrer is this origin. Next's
 * stale-build hard navigation (`app-router.js`: `location.assign`/`location.replace` on
 * `pushRef.mpaNavigation`) is a same-origin navigation, so it qualifies; a back/forward, a typed
 * URL, a bookmark or anything from another site does not — those remark.
 */
export const LOAD_SEQ_KEY = "mms.tab.loadSeq";
export type TabLoad = {
  seq: number;
  initialPath: string;
  /** This document's own navigation continues the tab's last load (`loadContinues`). */
  continues: boolean;
};

/**
 * Does a navigation of `type` (the navigation entry's — `reload` · `navigate` · `back_forward` ·
 * `prerender`; null when there is none) arriving from `referrer` prove this document is the NEXT
 * load of the page before it? Only a reload, or a navigation whose referrer is a page of `origin`.
 * Everything else — back/forward, no referrer, another origin's, a malformed one — answers false,
 * the safe direction (a remark, never a send).
 */
export function loadContinues(type: string | null, referrer: string, origin: string): boolean {
  if (type === "reload") return true;
  if (type !== "navigate" || referrer === "") return false;
  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
}

/** Read the previous seq (a non-negative integer, else 0), write prev+1, return it. Any storage
 *  failure → seq 0. */
export function claimLoad(store: TabStore | null, initialPath: string): Omit<TabLoad, "continues"> {
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

/** This document's navigation entry, or null (an old engine, a test). */
function navigationEntry(): PerformanceNavigationTiming | null {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    return nav === undefined ? null : (nav as PerformanceNavigationTiming);
  } catch {
    // Deliberate: no navigation timing — the callers fall back (the path to the location, and
    // `continues` to false: the safe direction).
    return null;
  }
}

/** The path THIS document loaded at: the navigation entry's URL (a soft navigation since then
 *  does not change it), else `location.pathname`. */
function documentPath(nav: PerformanceNavigationTiming | null): string {
  try {
    if (nav !== null && nav.name !== "") return new URL(nav.name).pathname;
  } catch {
    // Deliberate: an unparsable entry name falls back to the location below.
  }
  return location.pathname;
}

/** `document.referrer`, or "" where there is none to read (the safe direction: no continue). */
function documentReferrer(): string {
  try {
    return document.referrer ?? "";
  } catch {
    // Deliberate: no document (a worker, a test) — no referrer.
    return "";
  }
}

let memo: TabLoad | null = null;

/**
 * This document's load, claimed ONCE per document (module instance) and memoized: every later call
 * — a remount, a second consumer — reads the same generation. On the server there is no tab: seq 0,
 * never memoized (module state there is shared across requests).
 */
export function thisLoad(): TabLoad {
  if (typeof window === "undefined") return { seq: 0, initialPath: "", continues: false };
  if (memo !== null) return memo;
  const nav = navigationEntry();
  memo = {
    ...claimLoad(tabStore(), documentPath(nav)),
    continues: loadContinues(nav?.type ?? null, documentReferrer(), location.origin ?? ""),
  };
  return memo;
}

/** `written` came from the IMMEDIATELY previous document of this tab, at the page this one loaded
 *  at — and this document's own navigation proves nothing came between (`continues`). */
export function isImmediatelyAfter(written: { seq: number; path: string }, load: TabLoad): boolean {
  return (
    load.continues &&
    load.seq > 1 &&
    written.seq === load.seq - 1 &&
    written.path === load.initialPath
  );
}

/** Test seam: forget this document's claimed load. */
export function resetLoadForTests(): void {
  memo = null;
}
