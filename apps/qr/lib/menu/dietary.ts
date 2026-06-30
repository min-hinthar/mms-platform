// Dietary filters (R6a). Pure logic over the seeded `menu_items.tags` + `menu_items.allergens` arrays,
// shared by the filter chips and (later) the item sheet. No DB calls — operates on the already-fetched rows.
//
// FAIL-SAFE is the load-bearing rule for the free-from chips (gluten/nuts/shellfish): a dish is hidden if it
// DECLARES the allergen — AND also if its allergens are UNKNOWN (no declared allergens) UNLESS it carries the
// `allergen-reviewed` tag (an audited "genuinely none"). Never assert a free-from claim from absent data; the
// UI shows a "confirm with us" disclaimer whenever a free-from chip is active.

export type Diet = "vegetarian" | "vegan" | "gluten_free" | "no_nuts" | "no_shellfish";

export const DIETS: { id: Diet; label: string; emoji: string; freeFrom: boolean }[] = [
  { id: "vegetarian", label: "Vegetarian", emoji: "🌱", freeFrom: false },
  { id: "vegan", label: "Vegan", emoji: "🌿", freeFrom: false },
  { id: "gluten_free", label: "Gluten-free", emoji: "🌾", freeFrom: true },
  { id: "no_nuts", label: "No nuts", emoji: "🥜", freeFrom: true },
  { id: "no_shellfish", label: "No shellfish", emoji: "🦐", freeFrom: true },
];

// Which declared allergen codes (menu_items.allergens) each free-from chip rules out.
const FREE_FROM_ALLERGENS: Partial<Record<Diet, readonly string[]>> = {
  gluten_free: ["gluten_wheat"],
  no_nuts: ["peanuts", "tree_nuts"],
  no_shellfish: ["shellfish"],
};

type DietInput = { tags: readonly string[]; allergens: readonly string[] };

/** True if `item` satisfies EVERY active diet. Empty `diets` ⇒ everything passes. */
export function passesDiets(item: DietInput, diets: readonly Diet[]): boolean {
  return diets.every((d) => {
    // Both chips deliberately EXCLUDE vegan-optional in R6a (fail-safe). "Vegan on request" only means a
    // vegan VARIANT can be made — the DEFAULT prep is not guaranteed vegetarian/vegan (e.g. Everything Salad
    // ships with shrimp/egg). R6a only has the quick Add (item id, no modifier), so there is no way to
    // request the vegan variant yet — letting vegan-optional through would one-tap-add the NON-vegan default.
    // R6b (item sheet + "make it vegan" capture) re-introduces vegan-optional to the vegan chip then.
    if (d === "vegetarian") return item.tags.includes("vegetarian") || item.tags.includes("vegan");
    if (d === "vegan") return item.tags.includes("vegan");
    // Free-from, FAIL-SAFE: excluded if it declares the allergen, OR if its allergens are unknown and it
    // was never reviewed (unknown ≠ safe).
    const ruled = FREE_FROM_ALLERGENS[d] ?? [];
    if (ruled.some((a) => item.allergens.includes(a))) return false;
    if (item.allergens.length === 0 && !item.tags.includes("allergen-reviewed")) return false;
    return true;
  });
}

/** Any active free-from chip ⇒ show the "based on declared ingredients" disclaimer. */
export function hasFreeFrom(diets: readonly Diet[]): boolean {
  return diets.some((d) => DIETS.find((x) => x.id === d)?.freeFrom);
}
