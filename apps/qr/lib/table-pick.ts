import { currentDoor } from "./doors";

/**
 * Phase 3c-i (D18) — the table grid as a SECTION of the DoorSheet, and the dine-in menu href named
 * ONCE. Pure: every rule here is a value a test can falsify, and the components (`TableGrid`,
 * `DoorSheet`, `TablePicker`, `HomeSessionCard`, `JoinTable`) only wire these answers to the DOM.
 *
 * WHY THE GRID IS OFFERED ONLY OFF A DINE-IN SESSION (`tableGridOffered`). A `?table=N` claim
 * deliberately does NOT reuse the persisted dine-in code — `useTableSession.ts` sends the table
 * number and skips `resolveQrCode` ("on a fresh picker CLAIM (`?table=N`) … DON'T reuse a stale
 * persisted token") — and so MINTS a new session. A grid inside the sheet at a live dine-in
 * session, numbered or numberless, would therefore offer every chip as a way to orphan this phone's
 * drafts on the table it is sitting at. "Wrong table?" FROM a table is 3c-ii's `bindTable`, not a
 * second claim. The rule lives here, with a mutant, because a docblock cannot guard it.
 *
 * `doors.ts` stays verify:slice-exempt (a static table, no branch): the branch is HERE.
 */
export function tableGridOffered(mode: string): boolean {
  return currentDoor(mode).mode !== "dinein";
}

/** What tapping a chip does: resume MY live table · join a stranger's seated one · claim an open one. */
export type TableChipAction = "resume" | "join" | "claim";

/**
 * MINE WINS OVER OCCUPIED. A swipe-back diner re-entering the picker used to see their own table as
 * a dead "Seated" chip, and the claim 409'd (W5a — the code-wall bug). The peek marks it theirs;
 * occupancy is only consulted for a table that is not.
 */
export function tableChipAction(mine: boolean, occupied: boolean): TableChipAction {
  if (mine) return "resume";
  if (occupied) return "join";
  return "claim";
}

/** The chip's one word per state (TablePicker.tsx:111, verbatim). */
export function tableChipWord(action: TableChipAction): "Your table" | "Seated" | "Open" {
  switch (action) {
    case "resume":
      return "Your table";
    case "join":
      return "Seated";
    case "claim":
      return "Open";
  }
}

/** The full sentence that names each chip button (TablePicker.tsx:93-96, verbatim). */
export function tableChipLabel(n: number, action: TableChipAction): string {
  switch (action) {
    case "resume":
      return `Table ${n}, your table — pick up where you left off`;
    case "join":
      return `Table ${n}, someone is sitting here — join with the table code`;
    case "claim":
      return `Table ${n}, open — sit here`;
  }
}

/**
 * The ONE builder for `/menu?mode=dinein&door=dinein…` — byte-for-byte the four strings the
 * components used to hand-build (TablePicker.tsx:38 · :49 · :74/:123, JoinTable.tsx:28,
 * HomeSessionCard.tsx:47). `door=dinein` is the K0 tag the mint records on `session_created`; a
 * resume carries `&resume=1` and THEN `&table=N` when the number is known — the order the home's card
 * shipped. `join` is the party's code, URL-encoded (`?j=` is join-only: a wrong code must not mint a
 * phantom table — menu/page.tsx).
 */
export function dineInMenuHref({
  table,
  join,
  resume = false,
}: {
  table?: number;
  join?: string;
  resume?: boolean;
}): string {
  let href = "/menu?mode=dinein&door=dinein";
  if (resume) href += "&resume=1";
  if (table != null) href += `&table=${table}`;
  if (join != null) href += `&j=${encodeURIComponent(join)}`;
  return href;
}

/**
 * The seated-table join form's words, named once (TablePicker.tsx:136-176 verbatim — the picker's
 * own Sheet keeps them byte-identical; the DoorSheet's INLINE form reads them from here). The
 * placeholder is a SYNTHETIC example, never a seeded token: a real token in a "use client" bundle is
 * a live join credential shipped to every browser and to git.
 */
export const JOIN_COPY = {
  title: (n: number | null) => (n != null ? `Join Table ${n}` : "Join a table"),
  body: (n: number | null) =>
    `Someone is already sitting at Table ${n}. Enter the table code they share (or scan the table’s sticker) to order together.`,
  label: "Table code",
  placeholder: "e.g. WXYZ1234",
  button: "Join",
} as const;
