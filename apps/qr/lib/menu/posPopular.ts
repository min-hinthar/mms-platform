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
 * ⚠️ IT IS UNITS, SO SIDES AND DRINKS RANK HIGH. Plain Rice (2052) and Burmese Milk Tea (1791) sat
 * ahead of Mohinga (1068) because they ride along with other orders. The DATA is still unfiltered —
 * this file reads the till verbatim — but M136 asked the owner what to promote rather than deciding
 * it here, and they answered (2026-08-29): not Rice. `NOT_PROMOTED_SLUGS` below carries that one
 * decision by name; Milk Tea and Faluda stay, because a diner orders those on purpose. The category
 * round-robin in `startHereRows` still keeps one dish per category on top of it.
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
 * Dishes the till sells in volume that this app must NOT promote as most-ordered (M136 — owner,
 * 2026-08-29: "don't have Rice as top seller").
 *
 * The units are real and the file that carries them stays untouched: `pos-popularity.json` is the
 * restaurant's own order and it is not this app's place to edit it. What IS this app's decision is
 * what it holds up as a recommendation, and plain **Rice** at 2052 outsold every real dish because
 * it rides along with them — a bowl of it lands beside the curry someone actually chose. Leading
 * "Start here" with it, and stamping it "Most ordered", answers "what should I eat?" with "rice".
 *
 * ⚠️ A NAMED LIST, never a category rule. `Sides` also holds Coconut Rice (434) and `Drinks` holds
 * Burmese Milk Tea (1791) and Faluda (451) — all things a diner orders deliberately and might well
 * want recommended. A `category === "Sides"` heuristic would silently drop those too and keep
 * dropping whatever lands in the category next, which is exactly how a presentation rule turns into
 * an invisible policy nobody chose. One slug is here because the owner named one slug; adding
 * another is a one-line decision they can make out loud.
 *
 * Excluded from the ORDER itself, not just the badge — the ask was about being the top seller, and
 * the same list drives the badge, row A, the category round-robin and the surprise draw. Rice is
 * still on the menu, still searchable, still orderable in its own section; it is simply not held up
 * as an answer to "what do people order here?".
 */
export const NOT_PROMOTED_SLUGS: readonly string[] = ["rice"];

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
  const notPromoted = new Set(NOT_PROMOTED_SLUGS);
  return POS_POPULARITY.filter((p) => !notPromoted.has(p.slug))
    .map((p) => idBySlug.get(p.slug))
    .filter((id): id is string => !!id);
}
