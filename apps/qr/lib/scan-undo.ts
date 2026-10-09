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
