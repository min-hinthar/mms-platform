import posPopularity from "./pos-popularity.json";

/**
 * M135 (owner: "you can refer to the actual paypal pos data insights for the menu items for most
 * ordered items, instead of ranking them or numbering") — the restaurant's REAL sales order.
 *
 * The source is the owner's own PayPal/Zettle export, `docs/data/pos_2026_prices.json` (Jan–Jul
 * 2026), joined to our catalog on the Burmese dish name by `scripts/gen-menu-reference.mjs` and
 * emitted as `pos-popularity.json`. `pnpm check:docs` regenerates and compares both outputs, so a
 * changed export that nobody re-ran fails the gate rather than silently serving a stale order.
 *
 * WHY THIS REPLACED THE QR AGGREGATE. `mostLoved` counted paid orders placed through THIS app: over
 * the 60-day window it saw 77 line rows and 17 dishes clearing its ≥2-distinct-orders floor, which
 * is why the rank seals came out 1, 2, 2, 4, 5, 5, 5, 8, 8, 8, 8, 8 — the app has not been open long
 * enough to rank anything. The POS export is the whole restaurant's till: 76 of our 97 dishes carry
 * a real units count, from 2052 down to 1. It is a better answer to "what do people order here" by
 * two orders of magnitude, and it needs no service-role read on the menu's hottest path.
 *
 * WHAT IT DOES AND DOES NOT CLAIM. It is a COUNT OF UNITS RUNG at the restaurant across Jan–Jul
 * 2026 — not "table favorites" (the old wording, which claimed something about diners at this app's
 * tables), not a live signal, and not a ranking anyone reads as an ordinal. The seals are gone: the
 * owner asked for the data "instead of ranking them or numbering", and a numeral was the one thing
 * this data was never going to support gracefully anyway.
 *
 * ⚠️ IT IS UNITS, SO SIDES AND DRINKS WIN. Plain Rice (2052) and Burmese Milk Tea (1791) top the
 * list ahead of Mohinga (1068), because they ride along with other orders. That is the honest
 * reading of the data and it is deliberately NOT filtered here — inventing a "real dish" rule would
 * be this app deciding what the owner's sales mean. The category round-robin in `startHereRows`
 * already keeps one dish per category, so a side cannot take over a row.
 */
export type PosPopular = { slug: string; qty: number };

/** Most-sold first. Frozen: this is a shared module-level constant, not a per-request value. */
export const POS_POPULARITY: readonly PosPopular[] = Object.freeze(
  (posPopularity as PosPopular[]).map((p) => Object.freeze({ ...p })),
);

/**
 * How many dishes may wear the VISIBLE "Most ordered" badge. The same honesty bound the old
 * `LOVED_BADGE_MAX` carried, and for the same reason: a badge worn by 76 of 97 dishes is not a
 * badge, it is a decoration that says "most of the menu". The full 76-long order is still consulted
 * as a SELECTION preference — that is never shown to anyone as a claim.
 */
export const POS_BADGE_MAX = 12;

/**
 * Map the POS order onto the ids of the menu actually being rendered, dropping anything this menu
 * does not carry. Order is preserved, so index 0 is the most-sold dish present.
 *
 * Slug is the join key on purpose: prod and the catalog snapshot agree on 97/97 distinct slugs
 * (measured), while ids change whenever an item is recreated. An item with no slug, or a slug the
 * export never saw, simply does not appear — it is unranked, which every consumer treats as a
 * neutral "no preference", never as an exclusion.
 */
export function posPopularIds(items: readonly { id: string; slug?: string | null }[]): string[] {
  const idBySlug = new Map<string, string>();
  for (const i of items) if (i.slug) idBySlug.set(i.slug, i.id);
  return POS_POPULARITY.map((p) => idBySlug.get(p.slug)).filter((id): id is string => !!id);
}
