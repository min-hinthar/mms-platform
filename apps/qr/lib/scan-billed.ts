/**
 * M186 · G25 — what this session has CHARGED, as the camera's repeat rule reads it.
 *
 * `classifyScan` (lib/scan-gate.ts) refuses a camera sighting of a code the basket already pays for,
 * judged from the lines on screen, the offline queue, and this record. The record is the ONLY one of
 * the three left when a charge's own post-write read fails (`scanAdd` answering `lines: null`): the
 * list cannot show the line yet and the queue no longer holds it. So EVERY ok charge — the live add
 * and the offline queue's replay — lands here (G25: the replay did not, and its code was billed again
 * on the next sighting; `check:scan-repeat` proposition 8 parses the page for both).
 *
 * A record that outlives the line it stands for is the opposite failure: the camera refuses the
 * code forever ("Already added — your list is out of date") for an item the basket no longer
 * holds. Two ways it got there, both closed by `afterCharge`:
 *
 *   · A REMOVAL CROSSED THE WRITE (the blind pass on #344, CRITICAL). The shopper taps Remove on the
 *     item while its add is in flight; the server applies the add, then the removal; the add's
 *     response — its view read BEFORE the removal — lands last. So each charge carries the item's
 *     REMOVAL GENERATION from the moment it was dispatched (`chargeMark`), every removal bumps it
 *     (`afterRemoval`), and a charge that lands to a different generation is not recorded: nothing
 *     the client holds can order the two writes at the server. The page re-reads instead (`reread`),
 *     and the newest-ticket view settles it — `lines` is the primary source, so a line that survived
 *     is refused by the classifier through the list, and one that did not is a new item again.
 *   · THE VIEW SAYS IT IS NOT THERE (Codex P2 on #344). A replay of a scan whose earlier, lost-response
 *     attempt already committed is an idempotent ok that writes nothing (the scan-event ledger,
 *     20260813210000) — and if the shopper removed that line in between, its view (read after the
 *     write) does not hold the code. The view is the server's own word after this charge: absent
 *     means not charged, and any earlier record of the code goes too.
 *
 * ⚠️ Accepted residual, named rather than guessed around: a removal that crosses a write AND lands
 * with its reconcile read before the write commits at the server leaves the add's unit charged while
 * the list (the removal's view, the newest ticket) does not show it. The crossed charge is then not
 * recorded, so until the re-read this function asks for lands, a sighting of that jar charges again.
 * Ordering the two writes needs a server sequence the client does not have.
 *
 * Pure, so a value falsifies each rule (lib/scan-billed.test.ts, mutant-pinned).
 */

export type BilledLedger = {
  /** Barcodes this session charged, whose lines no removal has since taken. */
  readonly billed: ReadonlySet<string>;
  /** Per barcode, how many times the shopper has removed its line in this basket. */
  readonly removals: ReadonlyMap<string, number>;
};

/** A basket nothing has been charged to. */
export const NO_BILLED: BilledLedger = { billed: new Set(), removals: new Map() };

/** The item's removal generation — taken when a charge is DISPATCHED, before its write is awaited. */
export function chargeMark(ledger: BilledLedger, barcode: string): number {
  return ledger.removals.get(barcode) ?? 0;
}

export type ChargeLanded = {
  ledger: BilledLedger;
  /** The basket must be re-read: nothing this charge brought back can say whether its line stands
   *  (no view came back, or a removal crossed the write). */
  reread: boolean;
};

/** An ok charge of `barcode` landed. `mark` is its dispatch-time `chargeMark`; `lines` its own
 *  post-write view, or null when that read failed. */
export function afterCharge(
  ledger: BilledLedger,
  barcode: string,
  mark: number,
  lines: readonly { barcode: string }[] | null,
): ChargeLanded {
  // A removal crossed the write: unorderable here — never recorded; the view settles it.
  if (chargeMark(ledger, barcode) !== mark) return { ledger, reread: true };
  const billed = new Set(ledger.billed);
  // The charge's own view, read after its write, does not hold the code: it is not charged.
  if (lines !== null && !lines.some((l) => l.barcode === barcode)) {
    billed.delete(barcode);
    return { ledger: { billed, removals: ledger.removals }, reread: false };
  }
  billed.add(barcode);
  return { ledger: { billed, removals: ledger.removals }, reread: lines === null };
}

/** The shopper removed the item's line: it is a new item again, and any charge of it still in flight
 *  crossed this removal. */
export function afterRemoval(ledger: BilledLedger, barcode: string): BilledLedger {
  const billed = new Set(ledger.billed);
  billed.delete(barcode);
  const removals = new Map(ledger.removals);
  removals.set(barcode, chargeMark(ledger, barcode) + 1);
  return { billed, removals };
}
