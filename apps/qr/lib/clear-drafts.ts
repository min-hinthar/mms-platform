import { clearIsLoss, type ClearPreview } from "./clear-table";

/**
 * The lifecycle audit (2026-10-13) — a FREE clear (nothing sent, so no loss slip) over a table whose
 * guests are still building a round. The pane went straight into the six-second window, "Clearing
 * Table 5", which commits itself — and never said that the guests' unsent dishes go with the table
 * (`droppedUnits`, on the cancelled cart). A wrong table, or a "they left" that was wrong, cost a party
 * its whole order with no word to the server and none to the phones.
 *
 * So when drafts would be dropped, the clear ASKS first — naming them — and only a tap opens the
 * window (which names them too). A table with nothing on it at all clears as before.
 */
export function clearAsksFirst(p: ClearPreview): boolean {
  return !clearIsLoss(p) && p.droppedUnits > 0;
}
