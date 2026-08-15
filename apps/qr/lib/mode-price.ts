import type { LineFulfillment } from "@mms/db";

/**
 * W16a — MODE-DERIVED prices (owner directive, 2026-08-15): the 5% service charge is gone;
 * instead the menu's base price scales by HOW the diner takes the food, rounded to the nearest
 * quarter:
 *   dine-in  = round25(base × 1.15)
 *   take-out = round25(base × 1.05)
 *   grocery  = base (shelf price is the price — retail never carried service)
 *
 * The factor applies to the SUM (base + modifier deltas) at the one seam unit prices are minted
 * (priceItem → every add path), so the stored line price, the kitchen ticket, the client preview,
 * and the totals engine all agree. `base_price_cents` stays the single menu anchor (the
 * POS-verified W15 prices). Mirrored in SQL by mms_set_line_fulfillment's re-price (the
 * dinein↔togo toggle) — keep both halves in sync like the tax engine.
 *
 * Pinned by lib/mode-price.test.ts + verify:slice mutants (factor drift + rounding deletion).
 */

export const DINEIN_FACTOR = 1.15;
export const TOGO_FACTOR = 1.05;

/** Round to the nearest 25¢ (half-up via Math.round on the quarter count). */
export const round25 = (cents: number): number => Math.round(cents / 25) * 25;

/** The charged unit price for a line, from the menu-anchor sum (base + modifier deltas). */
export function modePriceCents(sumCents: number, fulfillment: LineFulfillment): number {
  switch (fulfillment) {
    case "dinein":
      return round25(sumCents * DINEIN_FACTOR);
    case "togo":
      return round25(sumCents * TOGO_FACTOR);
    case "grocery":
      return sumCents;
  }
}

/**
 * The dinein↔togo TOGGLE's fallback re-price for a line whose menu-anchor sum can't be re-derived
 * exactly (a legacy label-only line, or an id line with a vanished option — dropping a PAID
 * modifier from the price would be worse than a ≤25¢ rounding drift). Rescales the stored price by
 * the factor ratio: round25(stored × F(to) / F(from)). The exact path (re-derive via priceItem)
 * is preferred whenever every stored option id still resolves.
 */
export function rescaleModePriceCents(
  storedCents: number,
  from: "dinein" | "togo",
  to: "dinein" | "togo",
): number {
  const factor = (m: "dinein" | "togo") => (m === "dinein" ? DINEIN_FACTOR : TOGO_FACTOR);
  return round25((storedCents * factor(to)) / factor(from));
}
