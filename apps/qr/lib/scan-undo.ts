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
 * confirmed read lands, says "Removing…" while it is in flight and "Removed {name}" only after.
 */
export const ADD_UNDO_MS = 6000;

export type AddUndo = {
  lineId: string;
  barcode: string;
  name: string;
  /** When the add's ok landed (`performance.now()`). */
  openedAt: number;
};

/** Is the window still open at `now`, after `heldMs` of keyboard hold? */
export function undoOpen(u: AddUndo, now: number, heldMs = 0): boolean {
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

/** The qty the Undo writes: one fewer of that line, never below zero (zero removes the line). */
export function undoTargetQty(qty: number): number {
  return Math.max(0, qty - 1);
}
