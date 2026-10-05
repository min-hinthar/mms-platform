import { BIND_COPY } from "./bind-copy";
import type { BindTableResult } from "./bind-table";
import { currentDoor } from "./doors";

/**
 * Phase 3c-i (D18) — the table grid as a SECTION of the DoorSheet, and the dine-in menu href named
 * ONCE. Pure: every rule here is a value a test can falsify, and the components (`TableGrid`,
 * `TableSection`, `DoorSheet`, `TableBindSheet`, `HomeSessionCard`, `JoinTable`) only wire these
 * answers to the DOM. Phase 3c-ii (D27 · D28) adds the SEND's question — `sendNeedsTable`, the
 * per-host escape label and the bind's refusal sentences — below the K2 rules.
 *
 * WHY THE GRID IS OFFERED ONLY OFF THE DINE-IN MENU (`tableGridOffered`). The rule reads the MENU's
 * mode — the door this sheet is open on — not the phone's sessions. A `?table=N` claim deliberately
 * does NOT reuse the persisted dine-in code — `useTableSession.ts` sends the table number and skips
 * `resolveQrCode` ("on a fresh picker CLAIM (`?table=N`) … DON'T reuse a stale persisted token") —
 * and so MINTS a new session. A grid inside the sheet ON the dine-in menu, numbered or numberless,
 * would therefore offer every chip as a way to orphan this phone's drafts on the table it is
 * sitting at. "Wrong table?" FROM a table is 3c-ii's `bindTable`, not a second claim. What the rule
 * does NOT do (OPEN-ITEMS J33): a phone with a live dine-in session browsing the TO-GO menu is
 * offered the grid and may claim another table — exactly the two taps `/dine-in` already allows it;
 * closing that needs the session, which is 3c-ii's. The rule lives here, with a mutant, because a
 * docblock cannot guard it.
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
 * The seated-table join form's words, named once (TablePicker.tsx:136-176 at 48bc5da, verbatim —
 * the picker's Sheet retired with /dine-in in 3c-ii; the INLINE form `TableSection` hosts for the
 * DoorSheet and the Send sheet reads them from here). The placeholder is a SYNTHETIC example, never
 * a seeded token: a real token in a "use client" bundle is a live join credential shipped to every
 * browser and to git.
 */
export const JOIN_COPY = {
  title: (n: number | null) => (n != null ? `Join Table ${n}` : "Join a table"),
  body: (n: number | null) =>
    `Someone is already sitting at Table ${n}. Enter the table code they share (or scan the table’s sticker) to order together.`,
  label: "Table code",
  placeholder: "e.g. WXYZ1234",
  button: "Join",
  /** The empty submit's refusal — on the FIELD (`aria-invalid` + the note), never silent (blind pass
   *  on 3c-i · a11y: an `aria-disabled` Join still submits on Enter, and said nothing). */
  missing: "Enter the table code to join.",
} as const;

/** Where a grid is hosted: the retired /dine-in page's grammar (`page`), the DoorSheet's section
 *  (`sheet`), or the Send sheet (`send`) — on the `table_picked` capture and the escape's verb. */
export type TableGridSource = "page" | "sheet" | "send";

/**
 * Phase 3c-ii (D27) — the Send's ONE question, asked only when it has answers. The gate inside
 * `send()` after the frozen refusal: a dine-in session with no number yet AND a registry with at
 * least one table. An EMPTY (or failed — `getDineInTables` degrades to `[]`) registry never asks a
 * question with no answers; the send proceeds UNBOUND exactly as before 3c-ii, and the KDS labels
 * the ticket by its code (`TableGrid`'s own "never dead-end the dine-in door" rule). Who never
 * reaches this gate at all: a sticker scan, a `?table` claim, a staff-started table, a kiosk claim
 * — each stamps the number at mint — and an invite joiner, who never sends (`cart.ts`'s host rule).
 */
export function sendNeedsTable({
  isDineIn,
  tableNumber,
  tables,
}: {
  isDineIn: boolean;
  tableNumber: number | null;
  tables: readonly unknown[];
}): boolean {
  return isDineIn && tableNumber === null && tables.length > 0;
}

/**
 * The escape under the grid, per host. On /dine-in and in the DoorSheet it NAVIGATES (a bare
 * host-start — the shipped "Start anyway"); in the Send sheet it SENDS the order unbound (D28's
 * "Send anyway", `BIND_COPY`): a label that promised the other verb would be the one dishonest
 * word on a sheet whose whole job is to say what the next tap does.
 */
export function tablePlainLabel(source: TableGridSource): string {
  return source === "send" ? BIND_COPY.sendAnyway : "Not at a numbered table? Start anyway";
}

/** The send's refusal sentences a bind shares (`reasonCopy`, components/useUndoGrace.ts), by key. */
export type SendReasonCopy = Record<
  "not_host" | "locked" | "settling" | "rate_limited" | "error",
  string
>;

/**
 * Phase 3c-ii (D28) — a bind refusal names its recovery. The bind's OWN three sentences are
 * `BIND_COPY`'s (the mint's `seated` / `unavailable` byte-identical to /api/session's, and
 * `already_bound`'s new line); the five it shares with the send are the send's own `reasonCopy`,
 * handed in by the caller — a bind that fails is a send that did not happen, so each of those
 * sentences is true here too. `session_expired` takes the send's `error` sentence: it is the state
 * the shipped send already answers with (`assertCartMember` throws → SendToKitchenButton's catch
 * arm), and a sentence promising a retry is as honest as that one. Passed, never imported: the
 * record lives in a `"use client"` module that reaches `@/lib/cart` → `server-only`, which no pure
 * module may pull into every importer's suite.
 */
export function bindRefusalCopy(
  result: Extract<BindTableResult, { ok: false }>,
  send: SendReasonCopy,
): string {
  switch (result.reason) {
    case "seated":
      return BIND_COPY.seated;
    case "unavailable":
      return BIND_COPY.unavailable;
    case "already_bound":
      return BIND_COPY.alreadyBound(result.tableNumber);
    case "not_host":
    case "locked":
    case "settling":
    case "rate_limited":
    case "error":
      return send[result.reason];
    case "session_expired":
    case "not_dinein":
      // Neither is reachable from the sheet (`sendNeedsTable` is dine-in only; an expired session
      // has no cart to send) — the send's own sentence for a write that did not land.
      return send.error;
  }
}
