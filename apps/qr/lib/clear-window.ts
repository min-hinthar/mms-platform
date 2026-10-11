/**
 * PD7 (m7 screen 1 · §22 undo over confirm) — the CLEARING WINDOW's pure rules. Nothing is written
 * while it runs: `mms_clear_table` is sent only when it closes (or at "Seat next party"), so every
 * way out of the window is the safe direction — Undo, a stale table, an unmount.
 *
 *  - the window is the lane's own six seconds (`PICKED_UNDO_MS`) and its controls arm after the
 *    lane's 400 ms (`PICKED_UNDO_ARM_MS`): the second half of a double tap can neither undo nor seat;
 *  - a `:focus-visible` Undo or Seat next HOLDS it (`lib/undo-hold.ts`, the `slot` source), capped,
 *    and the window's start slides by the time held — a touch never holds;
 *  - a table that MOVED under the window drops it on the spot: a new member (someone just sat down),
 *    a changed order (a dish added, removed or re-counted — `tillSlipDiverged`, the one rule), or a
 *    payment starting. The server refuses the same cases on its own (`p_seen_at`, the set compare,
 *    the money mutex); this only says it sooner, with nothing sent.
 */
import { PICKED_UNDO_ARM_MS, PICKED_UNDO_MS } from "./expo-rules";
import { heldFor, type Hold } from "./undo-hold";
import { tillSlipDiverged } from "./till";

export const CLEAR_UNDO_MS = PICKED_UNDO_MS;
export const CLEAR_ARM_MS = PICKED_UNDO_ARM_MS;

/** What the window watches on the table, from the detail the pane already reads. */
export type ClearWatch = {
  members: readonly string[];
  lines: readonly { id: string; qty: number }[];
  paying: boolean;
};

/** Why an open window was dropped, or null when the table is as it was when the window opened. */
export function clearWindowStale(
  atOpen: ClearWatch,
  now: ClearWatch,
): "paying" | "joined" | "changed" | null {
  if (now.paying && !atOpen.paying) return "paying";
  if (now.members.some((m) => !atOpen.members.includes(m))) return "joined";
  if (tillSlipDiverged(atOpen.lines, now.lines)) return "changed";
  return null;
}

/** Milliseconds left in the window at `now`; the start slides by the time a focus held it. */
export function clearWindowLeftMs(startedAt: number, hold: Hold, now: number): number {
  return CLEAR_UNDO_MS - (now - startedAt - heldFor(hold, now));
}
