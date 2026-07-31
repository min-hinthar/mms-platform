/**
 * W9c — whether a historical kitchen note may be carried into a reorder, in one place.
 *
 * `qr_order_items.notes` is snapshotted at fulfillment and can predate today's 160-char cap (Zod
 * `lineNotes.max(160)` + the `qr_cart_items.notes` column CHECK). Three rules, and the middle one is
 * the reason this is a module and not an inline ternary:
 *
 *  1. Empty / whitespace-only → nothing to carry.
 *  2. **Over the cap → DROP it, never truncate.** Cutting "no peanuts, no shellfish, no sesame" at 160
 *     yields a note that reads as complete and is not — a silently-shortened allergy list is worse
 *     than none, because the diner believes the kitchen was told. The caller discloses the drop.
 *  3. Within the cap → carry it verbatim (trimmed), exactly as the add path stores it.
 *
 * Pure, so `reorder-notes.test.ts` can prove each rule can fail.
 */

/** Mirrors `lineNotes` in `@mms/db/schemas` AND the `qr_cart_items.notes` column CHECK. */
export const NOTES_MAX = 160;

export type NoteCarry =
  /** Carry this note onto the new line. */
  | { carry: true; note: string }
  /** Nothing to carry, and nothing to say — the original line had no note. */
  | { carry: false; dropped: false }
  /** There WAS a note and it could not come back. The caller must tell the diner. */
  | { carry: false; dropped: true };

export function carryNote(raw: unknown): NoteCarry {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.length === 0) return { carry: false, dropped: false };
  if (s.length > NOTES_MAX) return { carry: false, dropped: true };
  return { carry: true, note: s };
}
