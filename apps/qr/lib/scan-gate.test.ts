import { describe, expect, it } from "vitest";

import {
  classifyScan,
  freshScanGate,
  SCAN_QUIET_MS,
  type ScanBasket,
  sightBarcode,
} from "./scan-gate";

/**
 * The decode loop, as `BarcodeScanner` actually runs it: one barcode resting in frame produces a
 * sighting every frame. Returns how many of them reached the page.
 */
function dwell(code: string, ms: number, stepMs: number): number {
  let gate = freshScanGate();
  let emitted = 0;
  for (let t = 0; t <= ms; t += stepMs) {
    const r = sightBarcode(gate, code, t);
    if (r.emit) emitted += 1;
    gate = r.next; // stored on EVERY sighting, emitted or not — the throttle's contract
  }
  return emitted;
}

const basket = (over: Partial<ScanBasket> = {}): ScanBasket => ({
  lines: [],
  queued: [],
  billed: [],
  ...over,
});

const LINE = { lineId: "l1", barcode: "0111222333444", name: "Shwe Thanakha Balm", qty: 1 };

describe("M186 throttle — a barcode streaming in frame announces itself once", () => {
  it("announces once for a ten-second dwell at 60fps", () => {
    // The shipped bug's shape: the inline guard refreshed its stamp only when it EMITTED, so this
    // dwell re-opened the window every 1500ms. Measured, not remembered — that guard answers 7
    // here (the mutant that restores it is `m186/a-resting-barcode-bills-again`).
    expect(dwell("0111222333444", 10_000, 1000 / 60)).toBe(1);
  });

  it("announces once for a dwell that is an exact multiple of the quiet window", () => {
    // The boundary the old code was most wrong about: measured from the FIRST sighting, t=1500,
    // 3000 and 4500 all satisfy the gap test. Measured from the PREVIOUS FRAME none of them do.
    //
    // ⚠️ SAMPLED AT FRAME RATE, deliberately. An earlier draft stepped at exactly `SCAN_QUIET_MS`
    // and failed — correctly: a loop that sights a barcode only once every 1500ms cannot tell that
    // apart from the item leaving and being presented again. The bug is about a CONTINUOUS stream.
    expect(dwell("0111222333444", SCAN_QUIET_MS * 4, 1000 / 60)).toBe(1);
  });

  it("re-announces after a real gap in the stream", () => {
    let gate = freshScanGate();
    const first = sightBarcode(gate, "0111222333444", 0);
    expect(first.emit).toBe(true);
    gate = first.next;
    // …nothing decodes for the whole gap…
    expect(sightBarcode(gate, "0111222333444", SCAN_QUIET_MS).emit).toBe(true);
  });

  it("does not let a gap that is one millisecond short through", () => {
    const gate = sightBarcode(freshScanGate(), "0111222333444", 0).next;
    expect(sightBarcode(gate, "0111222333444", SCAN_QUIET_MS - 1).emit).toBe(false);
  });

  it("holds the quiet window at a second and a half, in literal milliseconds", () => {
    // ⚠️ THE ONLY LITERAL FIXTURE FOR THE CONSTANT, and it is here because every other assertion
    // reads `SCAN_QUIET_MS` symbolically — under which 100 and 60_000 are both green. 1400 must
    // stay silent (a dropped frame is not a re-present) and 1600 must speak.
    const gate = sightBarcode(freshScanGate(), "0111222333444", 0).next;
    expect(sightBarcode(gate, "0111222333444", 1400).emit).toBe(false);
    expect(sightBarcode(gate, "0111222333444", 1600).emit).toBe(true);
  });

  it("treats a different barcode as a new sighting immediately", () => {
    const gate = sightBarcode(freshScanGate(), "0111222333444", 0).next;
    expect(sightBarcode(gate, "9998887776665", 10).emit).toBe(true);
  });

  it("re-arms for the FIRST barcode once the second has displaced it", () => {
    let gate = freshScanGate();
    gate = sightBarcode(gate, "A", 0).next;
    gate = sightBarcode(gate, "B", 10).next;
    expect(sightBarcode(gate, "A", 20).emit).toBe(true);
  });

  it("emits on the very first sighting a fresh gate ever gets", () => {
    expect(sightBarcode(freshScanGate(), "0111222333444", 0).emit).toBe(true);
  });

  it("carries the sighting into `next` even when it does not emit", () => {
    const r = sightBarcode({ code: "0111222333444", seenAt: 0 }, "0111222333444", 900);
    expect(r.emit).toBe(false);
    expect(r.next).toEqual({ code: "0111222333444", seenAt: 900 });
  });

  it("stays silent while the first jar keeps streaming — which is why money is NOT decided here", () => {
    // The scenario that sank the clock-only design: jar A rests in frame (other hand, on the
    // counter) while the shopper presents jar B. Same barcode, unbroken stream, so the throttle
    // never speaks again — not for 1.5s, but for as long as A is decodable. If this were the
    // charge rule, jar B would be free and nothing on screen would say so. It is not: the chip
    // `classifyScan` drives is already on screen naming jar A, with Add another on it.
    let gate = freshScanGate();
    gate = sightBarcode(gate, "0111222333444", 0).next; // jar A announced
    for (let t = 16; t <= 4000; t += 16) gate = sightBarcode(gate, "0111222333444", t).next;
    expect(sightBarcode(gate, "0111222333444", 4016).emit).toBe(false);
  });
});

describe("M186 charge rule — the basket says what has been paid for, not the clock", () => {
  it("charges a barcode this basket has never seen", () => {
    expect(classifyScan(basket(), "0111222333444")).toEqual({ kind: "add" });
  });

  it("refuses a second charge for a barcode already on a line, and hands back the line to step", () => {
    // C1's jar B, and C3's tab round-trip, and C2's 1.5s autofocus stall — one answer for all
    // three, because none of them can change what the basket already holds.
    expect(classifyScan(basket({ lines: [LINE] }), "0111222333444")).toEqual({
      kind: "repeat",
      where: "basket",
      lineId: "l1",
      name: "Shwe Thanakha Balm",
      qty: 1,
    });
  });

  it("refuses a second charge for a scan still waiting in the offline queue", () => {
    // No line exists yet and replay may still refuse it, so there is nothing to step — but
    // charging it twice offline would survive all the way to the receipt.
    expect(classifyScan(basket({ queued: ["0111222333444"] }), "0111222333444")).toEqual({
      kind: "repeat",
      where: "queued",
    });
  });

  it("refuses a second charge when the write landed but the read that would prove it failed", () => {
    // `scanAdd` answers `lines: null` when the post-write read fails. Without `billed`, the basket
    // looks empty of an item it is already being charged for, and the next sighting bills again.
    expect(classifyScan(basket({ billed: ["0111222333444"] }), "0111222333444")).toEqual({
      kind: "repeat",
      where: "unconfirmed",
    });
  });

  it("prefers the line's answer when the same barcode is in every source", () => {
    // The line is the only source carrying a qty and a lineId — the richest true answer wins.
    expect(
      classifyScan(
        basket({ lines: [LINE], queued: ["0111222333444"], billed: ["0111222333444"] }),
        "0111222333444",
      ),
    ).toEqual({
      kind: "repeat",
      where: "basket",
      lineId: "l1",
      name: "Shwe Thanakha Balm",
      qty: 1,
    });
  });

  it("charges again once the shopper has removed the line", () => {
    // Removing a line is the shopper saying they don't want it. Re-scanning is then a new item,
    // not a repeat — so the page drops the barcode from `billed` when a line goes to zero.
    expect(
      classifyScan(basket({ lines: [{ ...LINE, barcode: "9998887776665" }] }), "0111222333444"),
    ).toEqual({ kind: "add" });
  });

  it("charges a genuinely different item while the first one is still in the basket", () => {
    expect(
      classifyScan(basket({ lines: [LINE], billed: ["0111222333444"] }), "9998887776665"),
    ).toEqual({ kind: "add" });
  });
});
