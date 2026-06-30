// Honest item badges (R6a/R6b). Shared by the menu row + the item sheet so the rule never drifts. Only REAL
// catalog tags become badges — there is NO `signature`/`most-loved` tag, so never fabricate one. At most two
// so the row stays calm; sold-out is shown separately (text + dimming).
export type ItemBadge = { label: string; tone: "gold" | "jade" };

export function itemBadges(tags: string[]): ItemBadge[] {
  const out: ItemBadge[] = [];
  if (tags.includes("popular")) out.push({ label: "Popular", tone: "gold" });
  if (tags.includes("vegan")) out.push({ label: "Vegan", tone: "jade" });
  else if (tags.includes("vegetarian")) out.push({ label: "Vegetarian", tone: "jade" });
  return out.slice(0, 2);
}
