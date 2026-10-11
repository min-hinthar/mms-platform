import type { ScanVerdict } from "./scan-gate";

/**
 * PD4 (m4 graft 3, critic's fix B1) — the PAIRING between a shelf code that missed and the item the
 * shopper then added by name from the sheet that miss opened.
 *
 * The shelf's real code is almost never in the catalog (every catalog code is a store-internal
 * 299-prefix EAN-13; C6), so a shopper who rescues a jar by name and then points the camera at it
 * again would see a SECOND miss for an item already in their basket. The pairing lets that re-read
 * resolve to the added item's barcode BEFORE `classifyScan`, so it gets M186's shipped repeat
 * verdict — the disc chip, never a second tag.
 *
 * The pairing is a note of the shopper's OWN act — "you added this item for that code" — never a
 * claim that the jar IS the item: ANY item added from a miss-opened sheet pairs, related to the jar
 * or not (decided under delegation, m4 §H.4). The re-read is announced as that act, never as the
 * jar's identity (`repeatSentence`, lib/scan-chip.ts).
 *
 * ⚠️ A PAIRING MAY ONLY EVER PRODUCE A REPEAT VERDICT — AND NO CHARGE. The critic's blocking finding:
 * `classifyScan` answers `add` the moment the paired item leaves the basket by ANY path (the basket
 * sheet's stepper, a Browse row, the add-Undo), and a page that then charged the PAIRED barcode would
 * charge an item the shopper never pointed at, from a sighting of a jar whose code is not in the app.
 * The blind pass 2 on #329 found the second door to the same charge: the chip a paired re-read draws
 * offered "Add another", which charges the chip's code — the judged one. So:
 *   · `judgedBarcode` only chooses what the basket is ASKED about. No charge takes a judged code:
 *     the camera's charge takes the sighted code itself, and a chip reached through a pairing draws
 *     no "Add another" (`chipAction`) — `check:scan-repeat` proposition 4 pins both in page.tsx;
 *   · `pairingAfterVerdict` SPENDS the pairing when the judged item classifies `add` — the sighting
 *     falls through to the unknown tag, and the next sheet add pairs afresh;
 *   · `pairingWithout` drops it the moment the paired item's line is removed; `pairingAfterUndo`
 *     takes back the pairing an undone add made, whatever qty its Undo wrote.
 * The pairing lives in a page ref for the page's life only. It is never stored or sent.
 */
export type ScanPairing = { missed: string; item: string };

/** The first ok add from a miss-opened sheet pairs the missed code to the added item. */
export function pairMiss(missed: string, item: string): ScanPairing {
  return { missed, item };
}

/** The barcode the basket is asked about for this sighting: the paired item's for the missed code,
 *  the sighted code otherwise. NEVER the barcode to charge. */
export function judgedBarcode(pairing: ScanPairing | null, sighted: string): string {
  return pairing !== null && sighted === pairing.missed ? pairing.item : sighted;
}

/** The pairing after the basket answered for `judged`: spent when the paired item is no longer in
 *  the basket (`add`), kept when it still repeats. A verdict about any other barcode changes nothing. */
export function pairingAfterVerdict(
  pairing: ScanPairing | null,
  judged: string,
  verdict: ScanVerdict,
): ScanPairing | null {
  if (pairing === null || judged !== pairing.item) return pairing;
  return verdict.kind === "add" ? null : pairing;
}

/** The pairing once `barcode`'s line has left the basket (Undo, a stepper to 0): dropped when it
 *  was the paired item, untouched otherwise. */
export function pairingWithout(pairing: ScanPairing | null, barcode: string): ScanPairing | null {
  return pairing !== null && pairing.item === barcode ? null : pairing;
}

/** The pairing after a REMOVAL write of `barcode`'s line (a stepper to 0), settled once the write
 *  AND its reconcile are done; `atStart` is the pairing as the removal found it. Spent only when the
 *  write LANDED. A refused write (offline, a lock) rolls the line back into the basket, so the jar it
 *  rescued is still in it and must still repeat — never re-read as unknown over an item the shopper
 *  can see in the list (Codex round 2 on #329, 4226434713).
 *
 *  And a refused write RESTORES a pairing to `barcode` that was spent while it was out (Codex round 4
 *  on #329, 4240341727): the stepper drops the line from the view at once, so a re-read of the
 *  rescued jar in that window is judged against a basket without it, `classifyScan` answers `add`,
 *  and `pairingAfterVerdict` spends the pairing before the rollback brings the line back. A pairing
 *  standing now is the newer act and is kept; a spent pairing to ANOTHER item stays spent — this
 *  rollback says nothing about it. */
export function pairingAfterRemoval(
  pairing: ScanPairing | null,
  barcode: string,
  landed: boolean,
  atStart: ScanPairing | null,
): ScanPairing | null {
  if (landed) return pairingWithout(pairing, barcode);
  return pairing ?? (atStart !== null && atStart.item === barcode ? atStart : null);
}

/** The pairing after a LANDED add-Undo of the sheet add whose item is `undone.barcode` and whose
 *  sheet a miss of `undone.miss` opened (null: a camera panel or the chip opened it, nothing paired).
 *  The Undo reverses that add, so the pairing it MADE goes with it whatever qty the Undo wrote: an add
 *  that stepped a line the basket already held (×1 → ×2) and was undone to ×1 must not leave "you
 *  added {item} for this code" standing (Codex round 4 on #329, 4240341730). A pairing an EARLIER add
 *  made stays while its item does — that add was not undone. An Undo that emptied the line spends
 *  ANY pairing to the item (`pairingWithout`): it is no longer in the basket. */
export function pairingAfterUndo(
  pairing: ScanPairing | null,
  undone: { barcode: string; miss: string | null },
  lineGone: boolean,
): ScanPairing | null {
  if (lineGone) return pairingWithout(pairing, undone.barcode);
  const made =
    pairing !== null && pairing.missed === undone.miss && pairing.item === undone.barcode;
  return made ? null : pairing;
}
