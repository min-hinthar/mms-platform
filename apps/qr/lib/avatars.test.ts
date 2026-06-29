import { describe, expect, it } from "vitest";
import { PCOL, seatColor, seatInitial } from "@/lib/avatars";

/**
 * Seat-avatar unit tests (M5·P5.5). Includes the WCAG-AA check for the white initial on the seat
 * hues — the combo flagged for the contrast audit in P5.4b-1. (That review cited two hues "just
 * under AA"; this asserts the real `seatColor` output, and all reachable hues in fact clear 4.5:1.)
 */

// ── WCAG sRGB contrast (seat hues are solid → no alpha) ──
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("seat avatar contrast", () => {
  // Assert EVERY palette hue directly (not via hash sampling) so "all hues clear AA" is load-bearing.
  it.each(PCOL)("seat hue %s clears AA (4.5:1) behind the white initial", (hue) => {
    expect(contrastRatio("#ffffff", hue)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("seatColor", () => {
  it("is deterministic for a given seat", () => {
    expect(seatColor("table-3-seat-2")).toBe(seatColor("table-3-seat-2"));
  });
  it("only ever returns a palette hue", () => {
    for (let i = 0; i < 50; i++) expect(PCOL).toContain(seatColor(`seat-${i}`));
  });
});

describe("seatInitial", () => {
  it("uppercases the first letter", () => {
    expect(seatInitial("anna")).toBe("A");
  });
  it("trims leading whitespace before taking the initial", () => {
    expect(seatInitial("  bob")).toBe("B");
  });
  it("falls back to G when the name is empty", () => {
    expect(seatInitial("")).toBe("G");
    expect(seatInitial("   ")).toBe("G");
  });
});
