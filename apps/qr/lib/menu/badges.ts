// Honest item badges (R6a/R6b · upgraded J2). Shared by the menu row + the item sheet so the rule never
// drifts. Only REAL signals become badges — never fabricate. At most two so the row stays calm; sold-out
// is shown separately (text + dimming).
export type ItemBadge = { label: string; tone: "gold" | "jade" };

/**
 * `tableFavorite` (J2) is the DATA-BACKED signal — real paid-order counts (lib/menu/mostLoved.ts,
 * ≥2 distinct orders in 60 days), so "Table favorite" is a TRUE claim, which is this module's founding
 * rule. When real data crowns an item it SUPERSEDES the hand-set `popular` tag (one gold badge, the
 * truer one); the tag remains the honest fallback while order history is thin.
 */
export function itemBadges(tags: string[], tableFavorite = false): ItemBadge[] {
  const out: ItemBadge[] = [];
  if (tableFavorite) out.push({ label: "Table favorite", tone: "gold" });
  else if (tags.includes("popular")) out.push({ label: "Popular", tone: "gold" });
  if (tags.includes("vegan")) out.push({ label: "Vegan", tone: "jade" });
  else if (tags.includes("vegetarian")) out.push({ label: "Vegetarian", tone: "jade" });
  return out.slice(0, 2);
}
