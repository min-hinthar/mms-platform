import { describe, expect, it } from "vitest";
import {
  DINEIN_FACTOR,
  TOGO_FACTOR,
  modePriceCents,
  rescaleModePriceCents,
  round25,
} from "./mode-price";

/**
 * W16a — the mode-price rule, pinned. Every expectation below was COMPUTED IN NODE (the runtime —
 * python's banker's rounding diverges on quarter ties, and IEEE floats decide tie-adjacent rows:
 * 750×1.15 = 862.4999999999999 → rounds DOWN to $8.50, while 250×1.15 = 287.5 exactly → up to
 * $3.00). Never transcribe a row — re-run `node -e "Math.round(c/25)*25"` when touching one.
 *
 * verify:slice mutants: mode-price/dinein-factor-drift · mode-price/togo-factor-drift ·
 * mode-price/rounding-deleted.
 */

describe("modePriceCents — the W16a owner pricing rule", () => {
  it("pins the factors themselves (a drifted constant is a silent price change)", () => {
    expect(DINEIN_FACTOR).toBe(1.15);
    expect(TOGO_FACTOR).toBe(1.05);
  });

  // Computed table (node): base → dine-in / to-go, both rounded to the nearest 25¢.
  const TABLE: [base: number, dinein: number, togo: number][] = [
    [200, 225, 200], // Rice: to-go stays $2.00 (210 rounds down)
    [250, 300, 275], // 287.5 is an EXACT .5 quarter tie → half-up to $3.00
    [350, 400, 375],
    [500, 575, 525],
    [750, 850, 800], // 862.4999999999999 (IEEE) → DOWN to $8.50, not $8.75
    [900, 1025, 950], // Faluda
    [1200, 1375, 1250],
    [1300, 1500, 1375], // Shan Noodles / Nan-Gyi
    [1387, 1600, 1450], // non-round base (base + modifier deltas)
    [1400, 1600, 1475], // Mohinga
    [1500, 1725, 1575], // Pork Skewers
    [1700, 1950, 1775],
    [1750, 2000, 1850], // 2012.4999999999998 (IEEE) → down
    [2000, 2300, 2100], // Kyay-O: $23.00 / $21.00
    [3000, 3450, 3150], // Crab Masala: $34.50 / $31.50
  ];
  it.each(TABLE)("base %i¢ → dinein %i¢ · togo %i¢", (base, dinein, togo) => {
    expect(modePriceCents(base, "dinein")).toBe(dinein);
    expect(modePriceCents(base, "togo")).toBe(togo);
  });

  it("grocery is EXEMPT — the shelf price is the price", () => {
    expect(modePriceCents(1387, "grocery")).toBe(1387);
    expect(modePriceCents(200, "grocery")).toBe(200);
  });

  it("every mode price lands on a quarter boundary (except grocery, which is untouched)", () => {
    for (let base = 25; base <= 5000; base += 137) {
      expect(modePriceCents(base, "dinein") % 25).toBe(0);
      expect(modePriceCents(base, "togo") % 25).toBe(0);
    }
  });

  it("round25 is half-up on exact quarter ties", () => {
    expect(round25(287.5)).toBe(300);
    expect(round25(262.5)).toBe(275);
    expect(round25(287.49)).toBe(275);
  });
});

describe("rescaleModePriceCents — the toggle's fallback re-price (Node-computed rows)", () => {
  it("rescales by the factor ratio, rounded to the quarter", () => {
    expect(rescaleModePriceCents(2300, "dinein", "togo")).toBe(2100); // Kyay-O both ways…
    expect(rescaleModePriceCents(2100, "togo", "dinein")).toBe(2300); // …round-trips exactly
    expect(rescaleModePriceCents(1600, "dinein", "togo")).toBe(1450);
    expect(rescaleModePriceCents(1475, "togo", "dinein")).toBe(1625);
    expect(rescaleModePriceCents(350, "togo", "dinein")).toBe(375);
    expect(rescaleModePriceCents(400, "dinein", "togo")).toBe(375);
  });
});
