/**
 * When a decoded barcode becomes a CHARGE — scan-and-go's "one bill per item" rule.
 *
 * ⚠️ A CAMERA CANNOT TELL A RESTING ITEM FROM A SECOND IDENTICAL ONE, and M186's first fix tried
 * to. `BarcodeScanner`'s decode loop calls in on EVERY decoded frame, so one barcode held in front
 * of the lens is a continuous stream of identical codes — and two jars of the same balm are the
 * same stream. Every purely temporal rule therefore gets one direction wrong:
 *
 *   - Time since the last SCAN (the inline guard this replaced) re-opens on a schedule under a
 *     barcode that never left, mints a fresh `scanId`, and the server counts each one — "a repeat
 *     barcode (fresh id) deliberately counts" (`grocery.ts`). Ten seconds of dwell at 60fps is
 *     SEVEN charges. That was the reported bug.
 *   - Time since the barcode was last SEEN (M186's first attempt) inverts it: while any copy of
 *     that code stays decodable the window never opens, so presenting the SECOND jar is refused —
 *     not for 1.5s, but for as long as the first one is in frame, with no feedback at all. And it
 *     still double-bills whenever the decode stream itself gaps for 1.5s (autofocus hunting, a
 *     shadow, the main thread stalling on the add round trip) over an item that never moved.
 *
 * Both are wrong numbers; the second is the worse kind, because it is silent. So the charge rule
 * stopped guessing: **a barcode this basket has already been billed for is never auto-billed again
 * by the camera.** `classifyScan` answers that from the BASKET — the lines, the offline queue, and
 * what this session has successfully added — not from a clock. A shopper who genuinely wants two
 * taps "Add another" on the chip the Scan tab shows, which is one tap, always visible, and can
 * never be off by one. The server's "a repeat deliberately counts" is unchanged; it is now reached
 * deliberately.
 *
 * What is left of the clock (`sightBarcode`) is a PRESENTATION THROTTLE, not a money rule: it
 * keeps a 60fps dwell from firing sixty toasts a second. Its worst failure is an extra toast.
 */

// ─────────────────────────────── 1. the presentation throttle ───────────────────────────────

export type ScanGate = {
  /** The last barcode SEEN — not the last charged; a suppressed sighting still lands here. */
  code: string | null;
  /** When it was last seen, refreshed on every sighting. A monotonic reading (`performance.now`). */
  seenAt: number;
};

/** A gate that has seen nothing — every code is new to it. */
export const freshScanGate = (): ScanGate => ({ code: null, seenAt: 0 });

/**
 * How long a barcode must be out of the decode stream before presenting it again is announced
 * again. A THROTTLE bound, not a money bound — `classifyScan` decides what gets charged.
 */
export const SCAN_QUIET_MS = 1500;

/**
 * Decide whether this sighting is worth telling the page about, and hand back the gate to store.
 *
 * The caller stores `next` on every sighting, emitted or not. Getting that wrong now costs a
 * duplicate toast rather than a duplicate charge — but it is still the contract.
 */
export function sightBarcode(
  gate: ScanGate,
  code: string,
  now: number,
): { emit: boolean; next: ScanGate } {
  const next: ScanGate = { code, seenAt: now };
  // A different barcode always announces: the shopper moved on to another item.
  if (gate.code !== code) return { emit: true, next };
  // The same barcode after a real gap in the stream — worth re-announcing, because the page's
  // answer may have changed (the line was removed, the queue drained).
  if (now - gate.seenAt >= SCAN_QUIET_MS) return { emit: true, next };
  // Still streaming. Silent, and the clock moves anyway.
  return { emit: false, next };
}

// ───────────────────────────────── 2. the charge rule ─────────────────────────────────

/**
 * Everything this basket knows about what it has already been charged for.
 *
 * Three sources, because no one of them is complete: `lines` is the server's own view and the only
 * one carrying a qty to step; `queued` is the offline queue, whose scans are not lines yet and may
 * still be refused at replay; `billed` is what THIS session successfully added, which is the only
 * record left when the post-write read fails (`scanAdd` answers `lines: null` — a failed read is
 * never an empty basket, and without this a second sighting would bill again).
 */
export type ScanBasket = {
  lines: readonly { lineId: string; barcode: string; name: string; qty: number }[];
  /** Barcodes waiting for a connection. */
  queued: readonly string[];
  /** Barcodes this session charged for, whether or not a line came back to prove it. */
  billed: readonly string[];
};

export type ScanVerdict =
  /** New to this basket — charge it. */
  | { kind: "add" }
  /** Already charged, and we can see the line: offer the stepper's job as one tap. */
  | { kind: "repeat"; where: "basket"; lineId: string; name: string; qty: number }
  /** Already queued offline — no line exists yet, and replay may still refuse it. */
  | { kind: "repeat"; where: "queued" }
  /** Charged, but the read that would prove it failed — say so rather than charge twice. */
  | { kind: "repeat"; where: "unconfirmed" };

/**
 * Is this scanned barcode a new item, or one the basket is already paying for?
 *
 * ⚠️ FOR CAMERA SCANS ONLY. A tapped Add in Browse or search is a deliberate act and must go
 * straight through — the whole point is that a second copy is CHOSEN, not inferred.
 */
export function classifyScan(basket: ScanBasket, barcode: string): ScanVerdict {
  const line = basket.lines.find((l) => l.barcode === barcode);
  if (line)
    return { kind: "repeat", where: "basket", lineId: line.lineId, name: line.name, qty: line.qty };
  if (basket.queued.includes(barcode)) return { kind: "repeat", where: "queued" };
  if (basket.billed.includes(barcode)) return { kind: "repeat", where: "unconfirmed" };
  return { kind: "add" };
}
