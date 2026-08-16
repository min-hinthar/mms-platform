/**
 * W21 (owner: "a personalizble/customizable recommendations section for first time customers or
 * wants something new for anyone") — the taste picker's matching rules, pure.
 *
 * HONEST by construction: every craving chip maps to REAL item data — the category the kitchen
 * filed the dish under, or a tag the menu already declares (the same tags the dietary filters
 * trust). Nothing here invents an affinity, a rating, or a "people like you" claim; the "why"
 * a card shows is the literal rule it matched. Category matching is by KEYWORD (not the exact
 * DB string) so a category rename doesn't silently kill a chip.
 */

export type CravingId =
  | "noodles"
  | "curry"
  | "seafood"
  | "fresh"
  | "spicy"
  | "plant"
  | "breakfast"
  | "sweet";

export type TasteItem = {
  category: string;
  tags: string[];
};

export type Craving = {
  id: CravingId;
  /** Chip label — EN + the Padauk accent (W16b: always bilingual). */
  en: string;
  my: string;
  emoji: string;
  matches: (item: TasteItem) => boolean;
};

const cat = (item: TasteItem, re: RegExp) => re.test(item.category);
const tag = (item: TasteItem, ...ts: string[]) => ts.some((t) => item.tags.includes(t));

export const CRAVINGS: readonly Craving[] = [
  {
    id: "noodles",
    // Named for the RULE it runs (review LOW: "Noodles & soups" put its chip on a pure rice dish).
    en: "Noodles, rice & soups",
    my: "ခေါက်ဆွဲ၊ ထမင်းနဲ့ ဟင်းချို",
    emoji: "🍜",
    matches: (i) => cat(i, /noodle|soup|rice/i),
  },
  {
    id: "curry",
    en: "Rich curries",
    my: "ဟင်းရည်စုံ",
    emoji: "🍛",
    matches: (i) => cat(i, /curr/i),
  },
  {
    id: "seafood",
    en: "Seafood",
    my: "ပင်လယ်စာ",
    emoji: "🦐",
    matches: (i) => cat(i, /seafood/i),
  },
  {
    id: "fresh",
    // Named for the RULE it runs (review LOW: "Fresh & light" claimed lightness for a whole
    // category that includes fritters — the category name is the honest claim).
    en: "Salads & veggies",
    my: "အသုပ်နဲ့ ဟင်းသီးဟင်းရွက်",
    emoji: "🥗",
    matches: (i) => cat(i, /salad|appetizer|vegetable/i),
  },
  {
    id: "spicy",
    en: "Bring the heat",
    my: "စပ်စပ်လေး",
    emoji: "🌶",
    // `spicy_optional` counts — the kitchen will turn the heat up on request.
    matches: (i) => tag(i, "spicy", "spicy_optional"),
  },
  {
    id: "plant",
    en: "Plant-based",
    my: "သက်သတ်လွတ်",
    emoji: "🌱",
    // The dietary predicate's own FAIL-SAFE rule (lib/menu/dietary.ts, mirrored — Codex P1):
    // `vegan-optional` means a vegan VARIANT can be made; the DEFAULT prep is NOT plant-based
    // (Everything Salad ships with shrimp powder), and a 🌱 card would steer a diner into animal
    // products under a plant-based claim. Only declared vegan/vegetarian defaults qualify.
    matches: (i) => tag(i, "vegan", "vegetarian"),
  },
  {
    id: "breakfast",
    en: "Breakfast all day",
    my: "မနက်စာ",
    emoji: "🍳",
    matches: (i) => cat(i, /breakfast/i),
  },
  {
    id: "sweet",
    en: "Something sweet",
    my: "ချိုချိုလေး",
    emoji: "🧁",
    matches: (i) => cat(i, /dessert/i),
  },
] as const;

/**
 * Rank the catalog against the diner's picked cravings. An item scores one per matched craving;
 * only matches are recommended (never a filler the picks don't back), ties break toward the
 * hand-set `popular` tag then stay in menu order. Capped at 8 — a recommendation row, not a
 * second menu. Returns the matched cravings per item so the card can SAY why it's here.
 */
export function recommendByTaste<T extends TasteItem>(
  items: readonly T[],
  picks: readonly CravingId[],
): { item: T; matched: Craving[] }[] {
  if (picks.length === 0) return [];
  const active = CRAVINGS.filter((c) => picks.includes(c.id));
  return items
    .map((item) => ({ item, matched: active.filter((c) => c.matches(item)) }))
    .filter((e) => e.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        Number(b.item.tags.includes("popular")) - Number(a.item.tags.includes("popular")),
    )
    .slice(0, 8);
}

/**
 * "Surprise me" — up to `count` picks the diner has NOT hearted, uniformly random via the injected
 * rng (a parameter so tests stay deterministic; callers pass nothing). Honest framing is the
 * caller's job: these are offered as "how about…", never as a data-backed match.
 */
export function surpriseMe<T extends { id: string }>(
  items: readonly T[],
  excludeIds: ReadonlySet<string>,
  count = 3,
  rng: () => number = Math.random,
): T[] {
  const pool = items.filter((i) => !excludeIds.has(i.id));
  // Partial Fisher–Yates: only the first `count` positions need settling.
  const a = [...pool];
  const n = Math.min(count, a.length);
  for (let k = 0; k < n; k++) {
    // Clamped: the injectable-rng contract doesn't promise a half-open [0,1) — rng()===1 would
    // index one past the end and plant an undefined (review LOW).
    const j = Math.min(k + Math.floor(rng() * (a.length - k)), a.length - 1);
    const tmp = a[k]!;
    a[k] = a[j]!;
    a[j] = tmp;
  }
  return a.slice(0, n);
}
