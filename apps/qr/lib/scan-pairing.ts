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
 * ⚠️ A PAIRING MAY ONLY EVER PRODUCE A REPEAT VERDICT. The critic's blocking finding: `classifyScan`
 * answers `add` the moment the paired item leaves the basket by ANY path (the basket sheet's
 * stepper, a Browse row, the add-Undo), and a page that then charged the PAIRED barcode would charge
 * an item the shopper never pointed at, from a sighting of a jar whose code is not in the app. So:
 *   · `judgedBarcode` only chooses what the basket is ASKED about; the charge always takes the
 *     sighted code itself (`check:scan-repeat` proposition 4 pins that in page.tsx);
 *   · `pairingAfterVerdict` SPENDS the pairing when the judged item classifies `add` — the sighting
 *     falls through to the unknown tag, and the next sheet add pairs afresh;
 *   · `pairingWithout` drops it the moment the paired item's line is removed (the Undo path).
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
