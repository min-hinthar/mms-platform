// "Goes well with" pairings (R6b). A small curated, code-only rules map (decision 3 — no schema change, no
// pairing table). Keyed by a substring of the current item's category so it's robust to the exact category
// names; falls back to real `popular` items, then any other-category item, so a sparse catalog never shows a
// fabricated pairing. Returns REAL items only (never invents) and skips sold-out + the current item.

export type UpsellItem = { id: string; category: string; tags: string[]; is_sold_out: boolean };

// First matching rule wins (most-specific substrings first where they'd overlap).
const PAIRINGS: { match: string; suggest: string[] }[] = [
  { match: "curr", suggest: ["rice", "noodle", "bread", "parata", "roti", "side", "salad"] },
  { match: "rice", suggest: ["curr", "side", "salad"] },
  { match: "noodle", suggest: ["side", "salad", "drink"] },
  { match: "salad", suggest: ["curr", "rice", "noodle"] },
  { match: "side", suggest: ["curr", "rice", "noodle"] },
  { match: "appet", suggest: ["curr", "rice", "noodle"] },
  { match: "starter", suggest: ["curr", "rice", "noodle"] },
  { match: "soup", suggest: ["rice", "side", "salad"] },
  { match: "drink", suggest: ["dessert", "appet", "side"] },
  { match: "bever", suggest: ["dessert", "appet", "side"] },
  { match: "dessert", suggest: ["drink", "bever", "tea"] },
  { match: "tea", suggest: ["dessert", "side"] },
];

/** Up to `limit` real items that pair with `current` — category rules first, then popular, then any other
 *  category. Excludes the current item and sold-out items. Empty when nothing genuine fits (no fabrication). */
export function goesWellWith<T extends UpsellItem>(current: T, all: T[], limit = 3): T[] {
  const cat = current.category.toLowerCase();
  const rule = PAIRINGS.find((p) => cat.includes(p.match));
  const pool = all.filter((i) => i.id !== current.id && !i.is_sold_out);
  const picks: T[] = [];
  const seen = new Set<string>([current.id]);

  const take = (pred: (i: T) => boolean) => {
    for (const i of pool) {
      if (picks.length >= limit) break;
      if (seen.has(i.id) || !pred(i)) continue;
      picks.push(i);
      seen.add(i.id);
    }
  };

  if (rule) for (const target of rule.suggest) take((i) => i.category.toLowerCase().includes(target));
  // Top up with REAL popular items from other categories (honest — only the actual `popular` tag).
  take((i) => i.category !== current.category && i.tags.includes("popular"));
  // Last resort so the row isn't empty on a sparse catalog: any other-category item.
  take((i) => i.category !== current.category);

  return picks;
}
