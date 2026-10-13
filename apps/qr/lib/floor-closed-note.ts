import { STAFF_DOOR_TARGET } from "./staff-door";
import type { ClosedVerdict } from "./floor-types";

/**
 * The lifecycle audit (2026-10-13, kitchen ↔ floor ↔ board) — a server on a table's page (or its
 * order pad) when a colleague clears or merges that table, or the idle sweep closes it, was sent to
 * the floor with no word: `router.replace` to the counter, and the table they were standing at was
 * simply gone from the list. A phone in a server's hand mid-order cannot tell "someone cleared it"
 * from "the app threw me out".
 *
 * The bounce now carries WHICH table (`?closed=6`), and the floor says it in its ONE region ("Table 6
 * closed — cleared, merged or timed out. You're back on the floor."), then drops the param so a
 * reload never says it again. The words name every way a table closes and claim nobody did it: this
 * device's own clear can race its own poll, so "on another screen" could be false.
 *
 * ⚠️ THE PARAM CANNOT CARRY A SENTENCE (#360, security). It sits in an address anyone can type, and
 * the floor reads it into a staff screen's live region, so it carries only a registered table NUMBER
 * (`1`–`999`) or the fixed token `table` (an unregistered sticker — "A table you had open closed …");
 * never a label, never text. Anything else is no note at all.
 *
 * Only a TABLE carries the note. A counter order's verdict always carries the `handoff` key (null or
 * not — a table's never does) and keeps the plain floor target, as before. A verdict with no row (a
 * malformed id, a vanished session) has nothing to say: the plain target too.
 *
 * Pure: no React, no `window`. The detail and the pad build the href; the server page parses the
 * param; the floor strips it from the address it is handed.
 */

export const CLOSED_PARAM = "closed";
/** The token an unregistered table's bounce carries — the one word the param may hold. */
export const CLOSED_UNNAMED = "table";

/** What the floor says: a table NUMBER, or `"unnamed"` (an unregistered sticker); null = nothing. */
export type ClosedNote = number | "unnamed";

const NUMBER = /^[1-9][0-9]{0,2}$/;

/** Where a live detail goes on a `closed` verdict nothing on this device holds: the floor by name,
 *  carrying the table's number (or the unnamed token) when the verdict is a TABLE's. */
export function closedFloorHref(v: ClosedVerdict): string {
  if (v.handoff !== undefined || v.label === undefined) return STAFF_DOOR_TARGET.counter;
  const n = v.tableNumber;
  const value = typeof n === "number" && NUMBER.test(String(n)) ? String(n) : CLOSED_UNNAMED;
  return `${STAFF_DOOR_TARGET.counter}&${CLOSED_PARAM}=${value}`;
}

/** The server page's read of the param: a table number, the unnamed token, or null for anything
 *  else — the param never puts its own words on a staff screen. */
export function closedNoteOf(raw: string | string[] | undefined): ClosedNote | null {
  if (typeof raw !== "string") return null;
  if (NUMBER.test(raw)) return Number(raw);
  return raw === CLOSED_UNNAMED ? "unnamed" : null;
}

/** The address with the note's param dropped (every other param and the hash kept), so a reload of
 *  the floor never says a closed table twice. */
export function withoutClosedParam(href: string): string {
  const u = new URL(href);
  u.searchParams.delete(CLOSED_PARAM);
  return `${u.pathname}${u.search}${u.hash}`;
}
