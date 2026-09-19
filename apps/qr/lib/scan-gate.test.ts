import { describe, expect, it } from "vitest";

import { freshScanGate, SCAN_QUIET_MS, sightBarcode } from "./scan-gate";

/**
 * The decode loop, as `BarcodeScanner` actually runs it: one barcode resting in frame produces a
 * sighting every frame. Returns how many of them became scans — which is how many times the diner
 * is billed.
 */
function dwell(code: string, ms: number, stepMs: number, quietMs = SCAN_QUIET_MS): number {
  let gate = freshScanGate();
  let emitted = 0;
  for (let t = 0; t <= ms; t += stepMs) {
    const r = sightBarcode(gate, code, t, quietMs);
    if (r.emit) emitted += 1;
    gate = r.next; // ⚠️ stored on EVERY sighting — that storage is the rule under test
  }
  return emitted;
}

describe("M186 — a barcode resting in frame is ONE scan, however long it rests", () => {
  it("bills once for a ten-second dwell at 60fps", () => {
    // The shape that shipped: the old guard refreshed its stamp only on emit, so this dwell
    // re-opened the window every 1500ms and minted a fresh scanId each time — six charges for one
    // balm. The diner is holding the item still, watching the screen, while it happens.
    expect(dwell("0111222333444", 10_000, 1000 / 60)).toBe(1);
  });

  it("bills once for a dwell that is an exact multiple of the quiet window", () => {
    // The boundary the old code was most wrong about: measured from the FIRST sighting, t=1500,
    // 3000 and 4500 all satisfy `now - t >= quietMs`, so a rate limiter fires four times. Measured
    // from the PREVIOUS FRAME it never does.
    //
    // ⚠️ SAMPLED AT FRAME RATE, deliberately. An earlier draft stepped at exactly `SCAN_QUIET_MS`
    // and failed — correctly: a loop that sights a barcode only once every 1500ms cannot tell that
    // apart from the item leaving and being presented again, and answering "one scan" there would
    // be the gate inventing a dwell it never observed. The bug is about a CONTINUOUS stream.
    expect(dwell("0111222333444", SCAN_QUIET_MS * 4, 1000 / 60)).toBe(1);
  });

  it("counts a deliberate re-present after a quiet gap as a second scan", () => {
    // The behaviour the window exists FOR: two of the same item, added by showing it twice.
    let gate = freshScanGate();
    const first = sightBarcode(gate, "0111222333444", 0);
    expect(first.emit).toBe(true);
    gate = first.next;
    // …the barcode leaves the frame entirely, so nothing sights it for the whole gap…
    const second = sightBarcode(gate, "0111222333444", SCAN_QUIET_MS);
    expect(second.emit).toBe(true);
  });

  it("does not let a gap that is one millisecond short through", () => {
    let gate = freshScanGate();
    gate = sightBarcode(gate, "0111222333444", 0).next;
    expect(sightBarcode(gate, "0111222333444", SCAN_QUIET_MS - 1).emit).toBe(false);
  });

  it("treats a different barcode as a new scan immediately", () => {
    // Two different items in quick succession is the normal shopping motion — it must never wait.
    let gate = freshScanGate();
    gate = sightBarcode(gate, "0111222333444", 0).next;
    expect(sightBarcode(gate, "9998887776665", 10).emit).toBe(true);
  });

  it("re-arms for the FIRST barcode once the second has displaced it", () => {
    // Displacement is not a free pass back: after B, an A sighting is a new scan because the gate
    // now holds B. This is correct — A did leave the frame for B to be seen.
    let gate = freshScanGate();
    gate = sightBarcode(gate, "A", 0).next;
    gate = sightBarcode(gate, "B", 10).next;
    expect(sightBarcode(gate, "A", 20).emit).toBe(true);
  });

  it("emits on the very first sighting a fresh gate ever gets", () => {
    expect(sightBarcode(freshScanGate(), "0111222333444", 0).emit).toBe(true);
  });

  it("carries the sighting into `next` even when it does not emit", () => {
    // The caller stores this unconditionally; if a suppressed sighting handed back the OLD stamp,
    // the rate limiter is back. Pinned as a value, because it is the whole fix.
    const gate = { code: "0111222333444", seenAt: 0 };
    const r = sightBarcode(gate, "0111222333444", 900);
    expect(r.emit).toBe(false);
    expect(r.next).toEqual({ code: "0111222333444", seenAt: 900 });
  });
});
