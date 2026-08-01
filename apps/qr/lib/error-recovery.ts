"use client";

/**
 * Shared route-boundary recovery, extracted in W10b so a SEGMENT boundary can't silently drop it.
 *
 * A segment `error.tsx` SHADOWS the root one for everything below it — so when /staff got its own
 * staff-voiced boundary, every /staff route quietly lost the root boundary's stale-deploy chunk
 * reload and its explicit error capture (pre-merge review, HIGH). That is worst exactly where W10b
 * matters most: the KDS/expo tablets are the longest-lived tabs in the building, so they are the
 * likeliest to be holding chunk URLs a deploy has already replaced. Both boundaries now import
 * from here; a future segment boundary gets the behavior by construction.
 */

// A stale deploy leaves the running tab pointing at chunk URLs that no longer exist; the next lazy
// import throws a ChunkLoadError. `reset()` just re-requests the same dead URL, so the boundary
// would loop — a one-shot hard reload fetches the new build instead (the delivery repo's learning).
// Cooldown-guarded via sessionStorage so a non-chunk error that happens to match can't reload-loop.
const CHUNK_RE =
  /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch dynamically/i;
const RELOAD_KEY = "mms.chunkReloadAt";

export function tryChunkReload(error: Error): boolean {
  if (!CHUNK_RE.test(error.name) && !CHUNK_RE.test(error.message)) return false;
  // CHUNK_RE also matches "Failed to fetch dynamically imported module", which a plain NETWORK DROP
  // produces just as readily as a stale deploy. Reloading then is actively harmful: the fetch for
  // the document fails too, so an offline device trades a recoverable error screen for the browser's
  // own — and on the always-on kitchen tablets that means losing the very board W10b exists to keep
  // (pre-merge review, HIGH — wiring this into the /staff boundary is what widened the blast radius).
  // A genuine stale-deploy chunk miss happens while ONLINE, so `navigator.onLine === false` is a
  // sufficient, evidence-based veto; `onLine` true is not proof of reachability, which is fine — the
  // sessionStorage cooldown below still bounds a wrong guess to one reload.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 10_000) return false; // already reloaded once recently — show the UI instead
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // private mode / storage disabled — fall through to a single reload without the loop guard
  }
  window.location.reload();
  return true;
}

// W10a — escalation memory: each error-mount inside a short window bumps the count, so a boundary
// that keeps re-erroring stops promising "try again" and admits a sustained problem. sessionStorage
// (not module state) so it survives the remounts reset() causes.
const ERR_COUNT_KEY = "mms.errBoundary";
const ERR_WINDOW_MS = 90_000;

export function bumpErrorCount(): number {
  try {
    const raw = sessionStorage.getItem(ERR_COUNT_KEY);
    const rec = raw ? (JSON.parse(raw) as { n: number; at: number }) : null;
    const fresh = rec && Date.now() - rec.at < ERR_WINDOW_MS;
    const n = (fresh ? rec.n : 0) + 1;
    sessionStorage.setItem(ERR_COUNT_KEY, JSON.stringify({ n, at: Date.now() }));
    return n;
  } catch {
    return 1; // private mode — no escalation memory, first-attempt copy each time
  }
}
