import { removeHeld } from "@mms/ui";

/**
 * PD4 (critic's fixes B2 · B3, round 3 D3) — the add-Undo's window and the post-add chip's arm.
 *
 * After an add from the Name sheet the lens chip's action slot holds ONE Undo for six seconds (the
 * shared vocabulary: it sits in the slot of the act it reverses, on `--sf` with a dashed accent
 * edge, the seconds an aria-hidden leaf). Two rules live here, pure, so a value falsifies each:
 *
 *   · THE WINDOW. `ADD_UNDO_MS` is the whole of it; `heldMs` is the time a keyboard user has held
 *     it open by sitting on the control (lib/undo-hold.ts, WCAG 2.2.1) and simply slides the start.
 *   · THE ARM (Codex correction 15). On a fast server ok the sheet closes under the finger, and the
 *     second half of a double-tap would land on the chip that mounts in its place — a deliberate
 *     second charge on "Add another", or an instant reversal on "Undo". So whatever sits in the
 *     chip's action slot ignores taps for the same-gesture window after the sheet closed. ONE
 *     constant, read from `@mms/ui` (`SAME_GESTURE_MS` through `removeHeld`): a second number would
 *     drift from the Stepper's and /cart's.
 *
 * The Undo itself is NOT optimistic (B2): the page holds the line and both figures until `setQty`'s
 * confirmed read lands, says "Removing…" while it is in flight, and speaks a past tense only for
 * what that read confirms (`undoOutcome`, below).
 *
 * THE UNDO WRITES FROM THE ADD'S OWN CONFIRMED VIEW, AND SPEAKS FROM THE READ THAT FOLLOWS IT (blind
 * pass 2 on #329). `setQty` is an ABSOLUTE write, so its qty must be exactly the add's confirmed qty
 * minus one: the add's response carries the server's own post-write view (`scanAdd`'s `lines`), and
 * `undoFromAdd` keeps that qty on the record. The client view is never consulted — a read issued
 * after the add can apply first and leave it a unit short, and "one fewer" of THAT removed the unit
 * the basket held before the add. The words after the write are `undoOutcome` over the follow-up
 * read's own lines: "Removed" only when the line is absent there, "{name} × {qty}" only when it shows
 * exactly that qty, the checking sentence otherwise. `check:scan-repeat` proposition 6 parses the
 * page so its write and its words go through these rules.
 */
export const ADD_UNDO_MS = 6000;

export type AddUndo = {
  lineId: string;
  barcode: string;
  name: string;
  /** The line's qty in the add's OWN confirmed view — the qty the server reported right after the
   *  add's write. The Undo writes exactly one fewer than this, never a qty from the client view. */
  confirmedQty: number;
  /** When the add's ok landed (`performance.now()`). */
  openedAt: number;
};

/** A line as a confirmed server view carries it (the fields these rules read). */
type ViewLine = { lineId: string; barcode: string; name: string; qty: number };

/** The Undo for one add, built ONLY from that add's own confirmed view. `null` when the view did not
 *  come back (`lines: null`) or does not hold the line: an Undo whose target would be a guess is not
 *  offered at all. */
export function undoFromAdd(a: {
  barcode: string;
  lines: readonly ViewLine[] | null;
  openedAt: number;
}): AddUndo | null {
  const line = a.lines?.find((l) => l.barcode === a.barcode);
  if (!line) return null;
  return {
    lineId: line.lineId,
    barcode: a.barcode,
    name: line.name,
    confirmedQty: line.qty,
    openedAt: a.openedAt,
  };
}

/** The Undo after ANOTHER write of `barcode` — an add of it by any door (live, or queued for
 *  replay), an offline replay of it, a stepper on its line: RETIRED. The Undo's write is absolute
 *  (`setQty` to the add's confirmed qty minus one), so once a second write of the same item may have
 *  landed, that qty no longer reverses THE add — it would take the other unit with it (a Browse add
 *  inside the window, the hand-read of this round's own fix). A sheet add that lands mints its own
 *  record from its own response; an Undo for any other item is untouched. */
export function undoAfterWrite(u: AddUndo | null, barcode: string): AddUndo | null {
  return u !== null && u.barcode === barcode ? null : u;
}

/**
 * THE WRITE LEDGER — may a sheet add MINT its Undo at all? (Codex on #329's head `ff29547`.)
 *
 * Retiring at a write's START misses a write that started EARLIER and lands LATER. The order that
 * defeats it: a replay of the item starts → the sheet add starts → the sheet's write lands (×1) →
 * the replay's write lands (×2) → the replay's response arrives (no Undo yet, nothing to retire) →
 * the sheet's response arrives, its post-write read taken before the replay landed, and mints an
 * Undo of `confirmedQty` 1 → the Undo writes 0 and BOTH units go. Retiring again when the replay
 * lands does not help: in that order the Undo does not exist yet.
 *
 * So every write of an item — live adds, replays, the stepper, and the minting add itself — is
 * tallied per barcode: `events` counts starts and landings, `inFlight` the writes not yet answered.
 * An add takes its `mark` right after its OWN start; when its response has landed it may mint only
 * if its own landing is the ONE event since (`events === mark + 1`) and nothing is still in flight.
 * Anything else means another write of the item started or landed inside its window, so its view
 * may not be the server's — and an absolute "one fewer" from a view that may be short is exactly
 * the defect. No Undo is offered then; the stepper still is. Pure, so a value falsifies it;
 * `check:scan-repeat` proposition 6 pins that the page routes every write through it.
 */
export type WriteTally = { events: number; inFlight: number };
export type WriteLedger = ReadonlyMap<string, WriteTally>;
export const NO_WRITES: WriteLedger = new Map();

const tallyOf = (l: WriteLedger, barcode: string): WriteTally =>
  l.get(barcode) ?? { events: 0, inFlight: 0 };

/** A write of `barcode` has started. */
export function writeStarted(l: WriteLedger, barcode: string): WriteLedger {
  const t = tallyOf(l, barcode);
  return new Map(l).set(barcode, { events: t.events + 1, inFlight: t.inFlight + 1 });
}

/** A write of `barcode` has been answered (landed, refused or thrown — it is no longer in flight). */
export function writeLanded(l: WriteLedger, barcode: string): WriteLedger {
  const t = tallyOf(l, barcode);
  return new Map(l).set(barcode, {
    events: t.events + 1,
    inFlight: Math.max(0, t.inFlight - 1),
  });
}

/** The mark an add takes right after its OWN start. */
export function writeMark(l: WriteLedger, barcode: string): number {
  return tallyOf(l, barcode).events;
}

/** May the add whose own write started at `mark` — and has since landed — mint its Undo? */
export function undoMayMint(l: WriteLedger, barcode: string, mark: number): boolean {
  const t = tallyOf(l, barcode);
  return t.events === mark + 1 && t.inFlight === 0;
}

/** Is the window still open at `now`, after `heldMs` of keyboard hold? A window whose write is IN
 *  FLIGHT never expires under it: the pill keeps saying "Removing…" until the write answers. */
export function undoOpen(u: AddUndo, now: number, heldMs = 0, removing = false): boolean {
  if (removing) return true;
  return now - heldMs - u.openedAt < ADD_UNDO_MS;
}

/** The aria-hidden leaf's number: whole seconds left, never below 0. */
export function undoSecondsLeft(u: AddUndo, now: number, heldMs = 0): number {
  return Math.max(0, Math.ceil((ADD_UNDO_MS - (now - heldMs - u.openedAt)) / 1000));
}

/** May the chip's action take a tap at `now`? `null` = no sheet closed this stay — always armed. */
export function chipArmed(sheetClosedAt: number | null, now: number): boolean {
  return !removeHeld(sheetClosedAt, now);
}

/** The qty the Undo writes: exactly one fewer than the add's own confirmed qty, never below zero
 *  (zero removes the line). */
export function undoTargetQty(u: AddUndo): number {
  return Math.max(0, u.confirmedQty - 1);
}

/** What the read that FOLLOWS the Undo's write confirms. */
export type UndoOutcome =
  | { kind: "removed" }
  | { kind: "stepped"; qty: number }
  | { kind: "unconfirmed" };

/** `read` is that read's own lines, or `null` when it failed or was refused. */
export function undoOutcome(
  u: AddUndo,
  read: readonly { lineId: string; qty: number }[] | null,
): UndoOutcome {
  if (read === null) return { kind: "unconfirmed" };
  const line = read.find((l) => l.lineId === u.lineId);
  if (!line) return { kind: "removed" };
  const target = undoTargetQty(u);
  return line.qty === target ? { kind: "stepped", qty: target } : { kind: "unconfirmed" };
}

/** The words for an outcome: past tense only for what the read confirmed (stepQty's words). */
export function undoSentence(o: UndoOutcome, name: string): string {
  if (o.kind === "removed") return `Removed ${name}`;
  if (o.kind === "stepped") return `${name} × ${o.qty}`;
  return "Undo saved — checking your basket…";
}
