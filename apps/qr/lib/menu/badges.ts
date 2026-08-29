// Honest item badges (R6a/R6b · upgraded J2). Shared by the menu row + the item sheet so the rule never
// drifts. Only REAL signals become badges — never fabricate. At most two so the row stays calm; sold-out
// is shown separately (text + dimming).
export type ItemBadge = { label: string; tone: "gold" | "jade" };

/**
 * `mostOrdered` is the DATA-BACKED signal, and M135 changed both where it comes from and what it
 * may SAY. It used to be this app's own paid-order aggregate, and the badge read "Table favorite" —
 * a claim about diners at this app's tables. It is now the owner's PayPal/Zettle till export
 * (`lib/menu/posPopular.ts`): units rung at the restaurant across Jan–Jul 2026, top `POS_BADGE_MAX`
 * only. That data cannot support "table favorite" — it knows nothing about tables, or about this
 * app — so the label is **"Most ordered"**, which is exactly what the number counts. Renaming the
 * badge was not cosmetic; leaving the old words on the new data would have been the fabrication
 * this module exists to prevent.
 *
 * When it fires it SUPERSEDES the hand-set `popular` tag (one gold badge, the truer one); the tag
 * remains the honest fallback for a dish the export never saw.
 */
export function itemBadges(tags: string[], mostOrdered = false): ItemBadge[] {
  const out: ItemBadge[] = [];
  if (mostOrdered) out.push({ label: "Most ordered", tone: "gold" });
  else if (tags.includes("popular")) out.push({ label: "Popular", tone: "gold" });
  if (tags.includes("vegan")) out.push({ label: "Vegan", tone: "jade" });
  else if (tags.includes("vegetarian")) out.push({ label: "Vegetarian", tone: "jade" });
  return out.slice(0, 2);
}
