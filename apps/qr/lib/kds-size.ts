/**
 * P7 — the kitchen board's TEXT SIZE, a per-device dial picked once by the person reading it.
 *
 * P1 set the Burmese dish line at 30px by body-parity arithmetic from the font files, and said the
 * real number would be read from Mom's eyes at the pass (P4). This module is that dial: three steps,
 * remembered in this tablet's storage like the station filter, never in a profile row.
 *
 * Pure so the page-size rule is falsified by a VALUE: the board is a 2×N landscape envelope and the
 * CSS drops medium and large to three columns, so a page must hold SIX tickets there and EIGHT at
 * small — otherwise "one page" stops meaning "one screen" and the two hidden tickets on every page
 * are exactly the ones nobody bumps.
 */

export type KdsSize = "s" | "m" | "l";

export const KDS_SIZE_KEY = "mms.kds.size";
export const KDS_SIZE_DEFAULT: KdsSize = "s";

/** EXACT equality against the three values; anything else — an old build's value, a hand-edit — is
 *  the default, which is the size every ticket has always rendered at. */
export function parseKdsSize(value: string | null | undefined): KdsSize {
  return value === "m" || value === "l" ? value : KDS_SIZE_DEFAULT;
}

/** Tickets per page at each size: 4 columns × 2 rows at small; 3 × 2 at medium and large, matching
 *  `.kds-root[data-size] .kds-grid` in globals.css. */
export function kdsPageSize(size: KdsSize): 6 | 8 {
  return size === "s" ? 8 : 6;
}

export const KDS_SIZES: readonly KdsSize[] = ["s", "m", "l"];

/**
 * P7·3 — the Burmese item size at each dial position, in CSS pixels, as the Help sheet quotes it
 * ("Now: medium · 34 px"). The numbers LIVE in `globals.css` (`--kfs-item-my` on `.kds-root` and its
 * two `data-size` overrides); this table is what the sheet can read, and `kds-size.test.ts` parses
 * the stylesheet and asserts the two agree — a quoted size that the board does not render would be
 * the sheet promising a dial position that does not exist.
 */
export const KDS_SIZE_PX: Readonly<Record<KdsSize, number>> = { s: 30, m: 34, l: 38 };

/**
 * P7·3 — the viewport from which the board draws its FIXED envelope (four columns at small, three
 * at medium and large — `@media (min-width: …)` on `.kds-grid` in globals.css). Below it the grid is
 * auto-fill and the dial does not change the column count, so the Help sheet quotes "{n} across"
 * only from here up; `kds-size.test.ts` holds this number to the stylesheet.
 */
export const KDS_WIDE_MIN_PX = 1200;
