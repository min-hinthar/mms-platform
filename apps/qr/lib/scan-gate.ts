/**
 * When a decoded barcode may become a SCAN — the one rule behind scan-and-go's "one bill per item".
 *
 * ⚠️ THE OLD INLINE VERSION WAS A RATE LIMITER WEARING A DEBOUNCE'S NAME (M186), and the difference
 * is a double charge. `BarcodeScanner`'s rAF decode loop calls this on EVERY decoded frame, so one
 * barcode resting in front of the camera produces a continuous stream of identical codes. The old
 * guard refreshed its timestamp only when it EMITTED — a suppressed frame returned early and left
 * the stamp where it was — so the window expired on a schedule and re-opened under a barcode that
 * had never left. Each re-fire mints a fresh `scanId`, and the server treats a fresh id as a
 * deliberate re-scan (`grocery.ts`: "A repeat barcode (fresh id) deliberately counts"), so it bills
 * again. Natural dwell is ≥1.5s, because the only confirmation a diner gets is a round trip plus an
 * 1800ms toast — they are LOOKING at the screen, holding the item still, while it charges them
 * twice.
 *
 * The fix is one line of intent: a sighting refreshes the clock whether or not it emits. The window
 * then measures what it always claimed to — how long the barcode has been AWAY — so holding an item
 * in frame is one scan, and deliberately re-presenting it after a quiet gap is two.
 */
export type ScanGate = {
  /** The last barcode SEEN — not the last emitted; a suppressed sighting still lands here. */
  code: string | null;
  /** When it was last seen, refreshed on every sighting. Epoch ms. */
  seenAt: number;
};

/** A gate that has seen nothing — every code is new to it. */
export const freshScanGate = (): ScanGate => ({ code: null, seenAt: 0 });

/**
 * How long a barcode must be OUT of frame before presenting it again counts as a second scan.
 *
 * ⚠️ IT IS THE QUIET GAP, NOT A COOLDOWN. Under the old reading this was "at most one scan per
 * 1500ms", which is exactly the behaviour that bills a resting item repeatedly.
 */
export const SCAN_QUIET_MS = 1500;

/**
 * Decide whether this sighting is a scan, and hand back the gate to store.
 *
 * ⚠️ THE CALLER MUST STORE `next` ON EVERY SIGHTING, emitted or not — that storage IS the fix. A
 * caller that writes it only when `emit` is true has rebuilt the rate limiter.
 */
export function sightBarcode(
  gate: ScanGate,
  code: string,
  now: number,
  quietMs: number = SCAN_QUIET_MS,
): { emit: boolean; next: ScanGate } {
  const next: ScanGate = { code, seenAt: now };
  // A different barcode is always a new scan: the diner moved on to another item.
  if (gate.code !== code) return { emit: true, next };
  // The same barcode, after a real gap — it left the frame and came back, which is the only way a
  // diner can say "yes, two of these" with the camera.
  if (now - gate.seenAt >= quietMs) return { emit: true, next };
  // Still resting in frame. Silent, and the clock moves anyway.
  return { emit: false, next };
}
