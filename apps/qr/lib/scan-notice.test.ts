import { describe, expect, it } from "vitest";
import { scanHint, scanNoticeFor, slotAfter, type ScanSlot } from "./scan-notice";

/** Phase 1c — the Scan door's result bar. Each MUTATION was induced and watched go red. */

describe("scanNoticeFor — only the three catalog misses", () => {
  it("names each catalog miss", () => {
    expect(scanNoticeFor("unknown_barcode", "0123")).toEqual({ kind: "unknown", barcode: "0123" });
    expect(scanNoticeFor("weighed_item", "0123")).toEqual({ kind: "weighed", barcode: "0123" });
    expect(scanNoticeFor("unavailable", "0123")).toEqual({ kind: "unavailable", barcode: "0123" });
  });

  it("a basket reason is never a barcode notice", () => {
    // MUTATION: a default branch returning an `unknown` notice; red.
    for (const r of [
      "locked",
      "settling",
      "paid",
      "cancelled",
      "session_expired",
      "unreadable",
    ] as const)
      expect(scanNoticeFor(r, "0123")).toBeNull();
  });
});

describe("slotAfter — the bar follows every outcome", () => {
  const miss = slotAfter(null, {
    outcome: "unknown_barcode",
    via: "scan",
    barcode: "299001",
    key: 1,
  });

  it("a camera miss plants a notice", () => {
    expect(miss).toEqual({
      kind: "notice",
      notice: { kind: "unknown", barcode: "299001" },
      key: 1,
    });
  });

  it("a repeat after a notice brings the chip back (Add another is where the eye is)", () => {
    // MUTATION: `repeat` leaves the slot as it was → the notice stays; red.
    expect(slotAfter(miss, { outcome: "repeat", via: "scan", barcode: "299002", key: 2 })).toEqual({
      kind: "chip",
      key: 2,
    });
    expect(slotAfter(miss, { outcome: "queued", via: "scan", barcode: "299002", key: 3 })).toEqual({
      kind: "chip",
      key: 3,
    });
    expect(slotAfter(miss, { outcome: "ok", via: "browse", barcode: "299002", key: 4 })).toEqual({
      kind: "chip",
      key: 4,
    });
  });

  it("a Browse or search miss never plants a notice on the hidden Scan door", () => {
    const chip: ScanSlot = { kind: "chip", key: 9 };
    // MUTATION: a notice for any `via` → the chip is replaced; red.
    expect(
      slotAfter(chip, { outcome: "unavailable", via: "browse", barcode: "299003", key: 10 }),
    ).toBe(chip);
    expect(
      slotAfter(chip, { outcome: "unavailable", via: "search", barcode: "299003", key: 11 }),
    ).toBe(chip);
  });

  it("the chip's own rescan is a camera path — its miss IS shown", () => {
    const chip: ScanSlot = { kind: "chip", key: 9 };
    expect(
      slotAfter(chip, { outcome: "unavailable", via: "rescan", barcode: "299003", key: 12 }),
    ).toEqual({ kind: "notice", notice: { kind: "unavailable", barcode: "299003" }, key: 12 });
  });

  it("a transport failure or a basket reason leaves the slot alone", () => {
    expect(slotAfter(miss, { outcome: "transport", via: "scan", barcode: "299004", key: 5 })).toBe(
      miss,
    );
    expect(slotAfter(miss, { outcome: "locked", via: "scan", barcode: "299004", key: 6 })).toBe(
      miss,
    );
  });
});

describe("scanHint — one line of guidance", () => {
  it("no basket outranks the radio: an offline scan only queues when a basket exists", () => {
    // MUTATION: test `online` first → offline-saved, promising a queue that cannot exist; red.
    expect(scanHint({ cartReady: false, online: false, storage: true })).toBe("basket-starting");
  });

  it("offline says whether the scan can be saved", () => {
    expect(scanHint({ cartReady: true, online: false, storage: true })).toBe("offline-saved");
    // MUTATION: ignore `storage` → offline-saved on a device that cannot hold a queue; red.
    expect(scanHint({ cartReady: true, online: false, storage: false })).toBe("offline-blocked");
  });

  it("all good → aim", () => {
    expect(scanHint({ cartReady: true, online: true, storage: true })).toBe("aim");
    expect(scanHint({ cartReady: true, online: true, storage: false })).toBe("aim");
  });
});
