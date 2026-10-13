import { STAFF_DOOR_TARGET } from "./staff-door";
import { tableDisplay, type ClosedVerdict } from "./floor-types";

/**
 * The lifecycle audit (2026-10-13, kitchen ↔ floor ↔ board) — a server on a table's page (or its
 * order pad) when a colleague clears or merges that table, or the idle sweep closes it, was sent to
 * the floor with no word: `router.replace` to the counter, and the table they were standing at was
 * simply gone from the list. A phone in a server's hand mid-order cannot tell "someone cleared it"
 * from "the app threw me out".
 *
 * The bounce now carries the table's own name (`?closed=6`), and the floor says it in its ONE region
 * ("Table 6 closed — cleared, merged or timed out. You're back on the floor."), then drops the param
 * so a reload never says it again. The words name every way a table closes and claim nobody did it:
 * this device's own clear can race its own poll (the clear navigates; a read already queued answers
 * `closed`), so "on another screen" could be false.
 *
 * Only a TABLE carries the note. A counter order's verdict always carries the `handoff` key (null or
 * not — a table's never does) and is named by its session label (`reg-…`), which no floor reads as a
 * table; it keeps the plain floor target, as before. A verdict with no row (a malformed id, a vanished
 * session) has no name to say: the plain target too.
 *
 * Pure: no React, no `window`. The detail and the pad build the href; the server page parses the
 * param; the floor strips it from the address it is handed.
 */

export const CLOSED_PARAM = "closed";

/** A table name the floor will say: what `tableDisplay` makes (a number, or a short label), bounded —
 *  the param is in an address anyone can type, so anything else is no note at all. */
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} #'’.-]{0,23}$/u;

/** Where a live detail goes on a `closed` verdict nothing on this device holds: the floor by name,
 *  carrying the table's name when the verdict is a TABLE's and names it. */
export function closedFloorHref(v: ClosedVerdict): string {
  if (v.handoff !== undefined || v.label === undefined) return STAFF_DOOR_TARGET.counter;
  const name = tableDisplay({ tableNumber: v.tableNumber ?? null, label: v.label }).text;
  if (!NAME.test(name)) return STAFF_DOOR_TARGET.counter;
  return `${STAFF_DOOR_TARGET.counter}&${CLOSED_PARAM}=${encodeURIComponent(name)}`;
}

/** The server page's read of the param: the table's name, or null for anything it would not say. */
export function closedNoteOf(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && NAME.test(raw) ? raw : null;
}

/** The address with the note's param dropped (every other param and the hash kept), so a reload of
 *  the floor never says a closed table twice. */
export function withoutClosedParam(href: string): string {
  const u = new URL(href);
  u.searchParams.delete(CLOSED_PARAM);
  return `${u.pathname}${u.search}${u.hash}`;
}
