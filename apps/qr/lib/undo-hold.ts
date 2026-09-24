/**
 * Phase 2b · feedback — the HOLD on a deferred write's undo window (WCAG 2.2.1).
 *
 * The expo lane's "Picked up" waits six seconds before it writes (`PICKED_UNDO_MS`, lib/expo-rules)
 * so the counter can take it back. A keyboard or screen-reader user who has reached an Undo must
 * not have the window close under them: while one sits on it, the window stops running. Two
 * controls can hold it — the pill's Undo (`toast`) and the card's in-slot Undo (`slot`) — and both
 * can be focused inside one window, blurring in either order. So a hold is a SET of sources over
 * ONE clock: the window runs again only when the LAST source lets go.
 *
 * Only `:focus-visible` focus holds (the caller asks `matchesFocusVisible`): a touch tap never
 * stalls the write it was about, and Android's focus-on-tap never does either. A release of a
 * source that is not held is a no-op — the blur of a tap-focused Undo, which never held, must not
 * count time. The total is CAPPED: a focus left parked on Undo (a tablet walked away from) cannot
 * hold a bag on the guest's tracker and the wall forever. Pure, so a value falsifies every rule.
 *
 * The lane's tick reads `pickedUndoOpen(at + heldFor(hold, now), now)` — the window's own rule is
 * untouched, only its start slides by the time held.
 */
export type HoldSource = "toast" | "slot";

export type Hold = {
  /** The controls holding the window now. */
  sources: ReadonlySet<HoldSource>;
  /** When the current unbroken hold began (any source); null while nothing holds. */
  since: number | null;
  /** Time held in earlier, finished holds. */
  heldMs: number;
};

export const NO_HOLD: Hold = { sources: new Set(), since: null, heldMs: 0 };

/** The most a window can be held in total — one minute on top of its own six seconds. */
export const PICKED_HOLD_CAP_MS = 60_000;

/** How long before the cap the lane WARNS that the pick is about to go through (blind review,
 *  2026-09-24): a hold that simply ran out would commit a pick under a keyboard user with no word
 *  first. Five seconds of warning while still held, then the release, then the window's own rest. */
export const PICKED_HOLD_WARN_MS = 5_000;

/** `source` starts (`held`) or stops holding at `now`. A hold that has reached its cap is spent: a
 *  new focus never re-holds it (the drain would pause again over a window that is really running). */
export function setHeld(
  h: Hold,
  source: HoldSource,
  held: boolean,
  now: number,
  capMs = PICKED_HOLD_CAP_MS,
): Hold {
  if (held) {
    if (h.sources.has(source)) return h;
    if (h.heldMs >= capMs) return h;
    return { sources: new Set(h.sources).add(source), since: h.since ?? now, heldMs: h.heldMs };
  }
  if (!h.sources.has(source)) return h;
  const sources = new Set(h.sources);
  sources.delete(source);
  if (sources.size > 0) return { sources, since: h.since, heldMs: h.heldMs };
  return { sources, since: null, heldMs: h.heldMs + (now - (h.since ?? now)) };
}

/** How long the window has been held at `now`, capped. */
export function heldFor(h: Hold, now: number, capMs = PICKED_HOLD_CAP_MS): number {
  return Math.min(capMs, h.heldMs + (h.since === null ? 0 : now - h.since));
}

/**
 * Where a live hold stands against its cap at `now`:
 *   - `release` — the cap is reached: the lane lets go (`capRelease`), the drain visibly resumes,
 *     and the window runs out its own remaining time;
 *   - `warn` — within `PICKED_HOLD_WARN_MS` of the cap: say, once, that the pick goes through soon;
 *   - `none` — nothing holds, or the cap is still far off.
 */
export function holdCapPhase(
  h: Hold,
  now: number,
  capMs = PICKED_HOLD_CAP_MS,
  warnMs = PICKED_HOLD_WARN_MS,
): "none" | "warn" | "release" {
  if (h.sources.size === 0) return "none";
  const held = heldFor(h, now, capMs);
  if (held >= capMs) return "release";
  if (held >= capMs - warnMs) return "warn";
  return "none";
}

/** The hold, let go at the cap: no source holds, and the time held is spent in full. */
export function capRelease(h: Hold, now: number, capMs = PICKED_HOLD_CAP_MS): Hold {
  return { sources: new Set(), since: null, heldMs: heldFor(h, now, capMs) };
}

/** Drop every entry whose order has left the lane — DELETED, not reset to `NO_HOLD`, so a lane
 *  that runs all shift does not keep one dead entry per bag it ever picked. Returns the ids dropped. */
export function pruneToLive<V>(m: Map<string, V>, live: ReadonlySet<string>): string[] {
  const gone = [...m.keys()].filter((id) => !live.has(id));
  for (const id of gone) m.delete(id);
  return gone;
}
