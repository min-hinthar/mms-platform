import type { SetItemSoldOutResult } from "./menu-availability";

/**
 * P2au — the flag a `setItemSoldOut` answer LANDED, or null when nothing was written.
 *
 * `ok` is not that question. The ledger insert runs AFTER the compare-and-swap has flipped the
 * dish, and its failure answers `ok: false` (code `unlogged`) so the "wasn't logged — tell the owner
 * it was you" sentence is never swallowed into a clean success. But the flag DID land: the board's
 * refresh shows the dish sold out, and a caller that reads `ok` as "did it change" then treated a
 * real 86 as a refusal — no confirmed override, and no 6-second Undo for a dish that is off the menu.
 *
 * So the two facts are asked apart: this answers "what is the dish now, by our write", and the
 * refusal's sentence is still said beside it. Every other refusal (`sentence` · `invalid` · `gone` ·
 * `stale`) changed nothing and answers null.
 *
 * Its own module because `menu-availability.ts` is a `"use server"` file, whose exports must all be
 * async Server Actions — a pure predicate cannot live there.
 */
export function landedSoldOut(res: SetItemSoldOutResult): boolean | null {
  if (res.ok) return res.soldOut;
  return res.code === "unlogged" ? res.soldOut : null;
}
