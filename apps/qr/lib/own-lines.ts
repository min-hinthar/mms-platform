import type { CartItem } from "@mms/db";

/**
 * The lines the /menu quick-stepper OWNS for one dish — moved out of `AddButton.tsx` (lifecycle
 * audit, edit-notes 0) so the rule carries a `verify:slice` mutant.
 *
 * It must mirror the SERVER's merge key exactly (`insertOrIncLine`, `lib/order-lines.ts`): the "+"
 * is `add(menuItemId, [], undefined)`, which merges only into the viewer's own draft, plain,
 * un-comped sibling at the session's default fulfillment — and the "−" trims a line THIS function
 * picked. Any line the server would never merge into is a line this stepper must not count.
 *
 * ⚠️ THE NOTE TERM IS THE ALLERGY RULE. `insertOrIncLine` never merges a NOTED line in either
 * direction (W3b: "folding 'no peanuts' into a plain sibling … would silently apply/erase an
 * allergy instruction"). Without `!i.notes` here a diner's "No peanuts — allergy" line read on the
 * menu as the same dish as plain units: "+" added an UN-noted unit while the screen reader said
 * "quantity 2", and "−" picked the first line at qty 1 in created order — the noted one — and
 * deleted the allergy note's line. A noted line is managed on /cart, where it reads apart.
 *
 * Requires a known seat: a staff line has `bySeat` undefined and session recovery blanks the seat, so
 * an unguarded `=== mySeat` would false-match a staff line (a real diner line always carries one).
 */
export function matchOwnLines(
  items: ReadonlyArray<CartItem>,
  menuItemId: string,
  fulfillment: string,
  mySeat: string | undefined,
): CartItem[] {
  if (!mySeat) return [];
  return items.filter(
    (i) =>
      i.menuItemId === menuItemId &&
      i.modifiers.length === 0 &&
      !i.notes &&
      i.fulfillment === fulfillment &&
      i.lineState === "draft" &&
      !i.comped &&
      i.bySeat === mySeat,
  );
}
