import { describe, expect, it } from "vitest";
import {
  fromCamera,
  looksLikeBarcode,
  offlineClaim,
  offlineSavedToast,
  queuedChipName,
  scanHint,
  scanNoticeFor,
  slotAfter,
  type ScanSlot,
} from "./scan-notice";

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

  it("the SAME jar re-read while its tag shows keeps its key — no re-rise, no second announcement (PD4)", () => {
    // MUTATION: re-key every camera miss → the tag rises again and the Toast re-speaks on every
    // 1.5 s gap in the decode stream while the jar rests in frame; red.
    expect(
      slotAfter(miss, { outcome: "unknown_barcode", via: "scan", barcode: "299001", key: 7 }),
    ).toBe(miss);
    // A DIFFERENT jar, or the same jar with a different verdict, is a new outcome: re-keyed.
    expect(
      slotAfter(miss, { outcome: "unknown_barcode", via: "scan", barcode: "299009", key: 8 }),
    ).toEqual({ kind: "notice", notice: { kind: "unknown", barcode: "299009" }, key: 8 });
    expect(
      slotAfter(miss, { outcome: "weighed_item", via: "scan", barcode: "299001", key: 9 }),
    ).toEqual({ kind: "notice", notice: { kind: "weighed", barcode: "299001" }, key: 9 });
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

describe("PD4 — what an OFFLINE sighting may claim (the cache omits weighed + unavailable items)", () => {
  const cached = { barcode: "2990000000017", name: "Tea Leaves -400g", priceCents: 644 };

  it("a cached code is KNOWN, with its display-only estimate", () => {
    expect(offlineClaim(cached)).toEqual({
      kind: "known",
      name: "Tea Leaves -400g",
      priceCents: 644,
    });
  });

  it("a code absent from the cache is UNKNOWN — never 'not in the app'", () => {
    expect(offlineClaim(null)).toEqual({ kind: "unknown" });
  });

  it("the queued chip is named by the cache, or 'A saved scan' — never by its digits", () => {
    expect(queuedChipName("2990000000017", cached)).toEqual({ name: "Tea Leaves -400g", my: null });
    // MUTATION: fall back to the barcode → a 13-digit "name" under the in-basket disc, which is
    // the shipped defect brief-m4 Today #7 names; red.
    const unknown = queuedChipName("0123456789012", null);
    expect(unknown.name).toBe("A saved scan");
    expect(unknown.name).not.toMatch(/\d/);
    expect(unknown.my).toBe("သိမ်းထားတဲ့ စကင်");
  });

  it("the saved toast promises the CHECK, and the unknown arm never claims the code is not in the app", () => {
    expect(offlineSavedToast(cached).text).toBe(
      "Saved Tea Leaves -400g ≈$6.44 — we’ll check it when you’re back online.",
    );
    const unknown = offlineSavedToast(null);
    // MUTATION: say the tag's headline here → "isn't in the app" about a code the cache cannot
    // judge (a weighed jar, an item out today); red.
    expect(unknown.text).toBe("Saved — we’ll check this code when you’re back online.");
    expect(unknown.text).not.toMatch(/in the app/);
    expect(unknown.text).not.toMatch(/\badds?\b/);
    expect(unknown.my).toContain("စစ်ပေးပါမယ်");
  });

  it("8–14 digits in the name field is a code being typed, not a name", () => {
    expect(looksLikeBarcode("01234567")).toBe(true);
    expect(looksLikeBarcode(" 2990000000017 ")).toBe(true);
    expect(looksLikeBarcode("1234567")).toBe(false);
    expect(looksLikeBarcode("123456789012345")).toBe(false);
    expect(looksLikeBarcode("laphet")).toBe(false);
    expect(looksLikeBarcode("400g")).toBe(false);
  });
});

describe("fromCamera — one rule for 'this miss came from a shelf'", () => {
  it("only the camera and its Add another are camera attempts (Codex round 1)", () => {
    // RED if Browse / Search count: `grocery_scan_miss` harvests the SHELF codes shoppers try and
    // decides when scan-first may switch on (G22) — a stale Browse card counted as a camera miss
    // corrupts that measurement and burns the per-barcode dedupe before a real scan.
    expect(fromCamera("scan")).toBe(true);
    expect(fromCamera("rescan")).toBe(true);
    expect(fromCamera("browse")).toBe(false);
    expect(fromCamera("search")).toBe(false);
  });
});
