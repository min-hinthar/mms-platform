import { servedSettled } from "./kitchen-track";
import { KDS_UNDO_MS } from "./kds-undo";

/**
 * The lifecycle audit (2026-10-13, kitchen ↔ floor ↔ board) — a bump means "done" on a STAFF board
 * only once it has left Mom's undo window, the same six seconds the wall, the guest's pass and the
 * pay door already wait out (`lib/kitchen-track.ts`, `servedSettled`).
 *
 * Before this module the takeaway lane (`kitchenStateOf`), the counter bell's finished-food key
 * (`kitchenDoneAt`) and the floor card's "ready to serve" (`foldFloorKitchen`) each read a raw
 * `state = served`: a mis-tapped All done read "Kitchen done" within the 400 ms realtime debounce,
 * rang the bell, lifted the bag above the cooking ones and cued a server to the pass — for food
 * still on the wok — and the Undo Mom tapped three seconds later could not take any of it back.
 *
 * Pure: no React, no I/O. The clock is the DB clock the reader read the lines with (`mms_now`).
 */

/** The raw columns a bump reads off `qr_cart_items`. */
export type BumpRow = { state: string; bumped_at?: string | null };

/**
 * A line the kitchen has FINISHED, on the ONE track: served, with a bump stamp at least
 * `KDS_UNDO_MS` old on the DB clock (`servedSettled` — never re-derived here). A served line inside
 * the window is still cooking: Mom can take it back with one tap. A served line with no stamp has
 * nothing to settle (every serve path stamps `bumped_at`; a null is a legacy row), so it is not done.
 */
export function bumpSettled(l: BumpRow, nowIso: string): boolean {
  return l.state === "served" && servedSettled(l.bumped_at ?? null, nowIso);
}

/**
 * How long until the EARLIEST served line among `lines` leaves Mom's undo window — a DURATION on the
 * DB clock (`bumped_at + KDS_UNDO_MS − now`), so the board can schedule ONE re-read for the moment a
 * bump turns into "done" (nothing else changes in the database when the window closes, so no realtime
 * event will arrive for it). Null when no served line is inside the window, or the clock is unknown.
 * The caller adds the shared re-read margin (`GRACE_REREAD_MARGIN_MS`, lib/live-pass) so the read
 * lands after the instant, never on it — the live pass's own pattern (`settleRereadDelayMs`).
 */
export function settleLeftMs(lines: readonly BumpRow[], nowIso: string): number | null {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return null;
  let soonest: number | null = null;
  for (const l of lines) {
    if (l.state !== "served" || !l.bumped_at) continue;
    const bumped = Date.parse(l.bumped_at);
    if (!Number.isFinite(bumped)) continue;
    const left = bumped + KDS_UNDO_MS - now;
    if (left > 0 && (soonest === null || left < soonest)) soonest = left;
  }
  return soonest;
}

/** The earlier of two optional durations (either may be null). */
export function soonerMs(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}
