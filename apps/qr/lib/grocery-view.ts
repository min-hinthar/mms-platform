import { aisleSlugFromHash } from "@/lib/grocery-landing";

/**
 * Phase 1c — Browse's aisle view lives in HISTORY, so the browser's Back button walks it: the market
 * home is `/grocery`, an aisle is `/grocery#aisle-<slug>`.
 *
 * A HASH entry, never a bare same-path push — the rule `lib/checkout-history.ts` documents:
 * next-view-transitions resolves a popstate's pending transition in an effect keyed on
 * `[hash, pathname]`, so a same-path, same-hash entry hangs the next Back ~4s. Every write passes
 * `window.history.state` through (Next's `__NA` survives, so its patched history bails, the
 * AccountUpgrade/Checkout precedent) and carries an `mmsAisle` marker on the entries WE pushed. The
 * marker survives a reload, which is how leaving a reloaded aisle knows whether `history.back()`
 * lands on the market home or would leave /grocery altogether.
 *
 * This module is the DECISION — pure, so every arm is watched failing without a browser.
 */

/** A stocked aisle's slug from a location hash, or null. Only `#aisle-*` hashes are ours. */
export function aisleFromHash(raw: string, stocked: readonly string[]): string | null {
  const slug = aisleSlugFromHash(raw);
  return slug !== null && stocked.includes(slug) ? slug : null;
}

export function hashForAisle(slug: string | null): "" | `#aisle-${string}` {
  return slug === null ? "" : `#aisle-${slug}`;
}

export type AisleHistoryOp = "push" | "replace" | "back" | "none";

/**
 *   · same → none;
 *   · home → aisle → PUSH (Back returns to the market home);
 *   · aisle → aisle → REPLACE, so Back always lands on the market home, never on the previous aisle;
 *   · aisle → home → `history.back()` when WE pushed the aisle entry (the home entry is right under
 *     it), else REPLACE — a deep-linked aisle has no home entry beneath it, and Back would leave.
 */
export function aisleHistoryOp(i: {
  from: string | null;
  to: string | null;
  pushedByUs: boolean;
}): AisleHistoryOp {
  if (i.from === i.to) return "none";
  if (i.from === null) return "push";
  if (i.to === null) return i.pushedByUs ? "back" : "replace";
  return "replace";
}

/**
 * A popped aisle entry while the Scan door shows switches the page to Browse: the entry IS a Browse
 * entry, so Back must never land somewhere invisible. (The switch is not persisted as a tap.)
 */
export function popShowsBrowse(i: {
  tab: "scan" | "browse";
  before: string | null;
  after: string | null;
}): boolean {
  return i.tab === "scan" && i.before !== i.after;
}
