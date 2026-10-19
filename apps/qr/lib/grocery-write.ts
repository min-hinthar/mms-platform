import { isServerRefusal, type ServerRefusal } from "./cart-freeze";

/**
 * #362 (blind pass 4) — what a /grocery `setQty` answer ESTABLISHED. `setQty` resolves a refusal it
 * names (`{ refused, at }`, the M230 shape — a thrown message is redacted in production) where it
 * used to throw, and the page's two writers (the stepper, the add-Undo) read ANY resolve as a
 * landing: the optimistic "Removed {name}" stood over a line the server kept, and the Undo spent the
 * charge record and the pairing for a write that never landed. Staff void has no grocery exclusion,
 * so a grocery line can leave draft under the shopper. A view — or `null`, written but unreadable —
 * is a landing; a named refusal is a failed write, rolled back like a throw, with its own words.
 */
export type GroceryWriteOutcome =
  | { landed: true }
  | { landed: false; refused: ServerRefusal["refused"] };

export function groceryWriteOutcome(answer: unknown): GroceryWriteOutcome {
  return isServerRefusal(answer) ? { landed: false, refused: answer.refused } : { landed: true };
}

/** The basket's own words for a refusal the server named. */
export function groceryRefusalSentence(refused: ServerRefusal["refused"], name: string): string {
  switch (refused) {
    case "voided":
      return `Our staff already took ${name} off your basket.`;
    case "not_draft":
      return `${name} can’t be changed now — ask our staff.`;
    default:
      // `sold_out` / `gone` gate a menu dish's growth; a barcode is never gated (`dishAvailability`
      // answers null for it), so this is the honest catch-all if one ever arrives here.
      return `${name} can’t be added right now.`;
  }
}
