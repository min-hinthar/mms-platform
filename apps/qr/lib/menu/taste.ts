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
 * M133 (owner: "all explore your burmese taste buds suggestions (including surprise your taste
 * buds) should offer at least 4 and at most 7 menu items"). ONE pair of bounds every row in the
 * band reads, so the craving rail, the surprise draw and the top-up can never disagree about how
 * long a row is — the "name it ONCE" rule applied to a count.
 *
 * The MAX is a hard slice. The MIN is a TARGET, not a promise the data can always keep: a craving
 * with two matching dishes on the whole menu has two matching dishes, and inventing a third match
 * is the exact fabrication this file exists to prevent. `TasteBand` reaches the floor the only
 * honest way — by topping up with dishes that carry a DIFFERENT, weaker line ("Something else to
 * try"), never a craving match they didn't earn.
 */
export const TASTE_ROW_MIN = 4;
export const TASTE_ROW_MAX = 7;

/**
 * A popularity ranking as a LOOKUP — most-ordered first, so position 0 is the most ordered dish.
 * Anything unranked sorts last rather than being excluded: a preference, never a filter.
 *
 * M131 (owner: "menu item suggestions should mostly be selected from the top 50 of popular,
 * customer most ordered items"). The list comes from `mostLoved`'s wider `LOVED_POOL_MAX` pool,
 * which is deliberately NOT the bound that backs the visible "Table favorite" badge — see the note
 * on those two constants. Nothing here reaches the diner as a claim; it only decides which honest
 * match gets offered first, so it can prefer a broader ranking than a badge is allowed to.
 */
function rankLookup(popularIds: readonly string[]) {
  const m = new Map(popularIds.map((id, i) => [id, i]));
  return (id: string) => m.get(id) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Rank the catalog against the diner's picked cravings. An item scores one per matched craving;
 * only matches are recommended (never a filler the picks don't back), ties break toward what tables
 * actually order (M131), then the hand-set `popular` tag, then menu order. Capped at 8 — a
 * recommendation row, not a second menu. Returns the matched cravings per item so the card can SAY
 * why it's here.
 *
 * ⚠️ The craving match stays the PRIMARY key and popularity only breaks its ties. Sorting by
 * popularity first would put a well-ordered one-craving dish above a dish that matched all three
 * of the diner's picks, and the card's "why" line would then be reading out a weaker reason than
 * the one that earned a stronger card its place — the row would be ordered by something other than
 * what it says it is ordered by.
 */
export function recommendByTaste<T extends TasteItem & { id: string }>(
  items: readonly T[],
  picks: readonly CravingId[],
  popularIds: readonly string[] = [],
): { item: T; matched: Craving[] }[] {
  if (picks.length === 0) return [];
  const active = CRAVINGS.filter((c) => picks.includes(c.id));
  const rank = rankLookup(popularIds);
  return items
    .map((item) => ({ item, matched: active.filter((c) => c.matches(item)) }))
    .filter((e) => e.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        rank(a.item.id) - rank(b.item.id) ||
        Number(b.item.tags.includes("popular")) - Number(a.item.tags.includes("popular")),
    )
    .slice(0, TASTE_ROW_MAX);
}

/**
 * "Surprise your taste buds" — up to `count` picks the diner has NOT hearted, drawn RANDOMLY but
 * from the most-ordered dishes FIRST (M131), topping up from the rest of the menu only when the
 * ranked pool cannot fill the row.
 *
 * Two-tier rather than one shuffle, and the difference matters: a single shuffle over everything
 * offers a dish nobody has ordered exactly as often as the house favourite, which is a worse guess
 * dressed as the same one. Two tiers keep the surprise genuinely random — the ranked tier is
 * shuffled, so it is never the same three dishes twice — while making the draw come from what
 * tables actually order. It stays a SUGGESTION either way: the caller frames these as "how about…",
 * never as a data-backed match, so preferring the ranked tier changes what is offered and not what
 * is claimed.
 *
 * `popularIds` empty (the default) collapses to exactly the pre-M131 behaviour: one uniform shuffle
 * over the whole eligible pool. That is also the shape a thin history or a failed aggregate gets.
 */
export function surpriseMe<T extends { id: string }>(
  items: readonly T[],
  excludeIds: ReadonlySet<string>,
  count = 3,
  /** Production argument, so it sits ahead of the test-only rng. */
  popularIds: readonly string[] = [],
  rng: () => number = Math.random,
): T[] {
  const eligible = items.filter((i) => !excludeIds.has(i.id));
  const ranked = new Set(popularIds);
  // Partition, not filter: the rest is a fallback tier, never discarded. Order within each tier is
  // irrelevant — both get shuffled — so a plain partition is enough.
  const tierA = eligible.filter((i) => ranked.has(i.id));
  const tierB = eligible.filter((i) => !ranked.has(i.id));

  // Partial Fisher–Yates: only the first `take` positions need settling.
  const draw = (from: readonly T[], take: number): T[] => {
    const a = [...from];
    const n = Math.min(take, a.length);
    for (let k = 0; k < n; k++) {
      // Clamped: the injectable-rng contract doesn't promise a half-open [0,1) — rng()===1 would
      // index one past the end and plant an undefined (review LOW).
      const j = Math.min(k + Math.floor(rng() * (a.length - k)), a.length - 1);
      const tmp = a[k]!;
      a[k] = a[j]!;
      a[j] = tmp;
    }
    return a.slice(0, n);
  };

  const picked = draw(tierA, count);
  return picked.length >= count ? picked : [...picked, ...draw(tierB, count - picked.length)];
}

/**
 * M133 — the honest way to reach `TASTE_ROW_MIN`. Returns the dishes to ADD to a short row, drawn
 * from the most-ordered ranking first and then menu order, skipping anything the row already holds.
 *
 * It returns the ADDITIONS rather than a merged row on purpose: the caller has to label these
 * differently, because they are NOT what the row's own rule found. A craving row that matched two
 * dishes matched two dishes — padding it to four with cards that wear the same "🌶 Bring the heat"
 * line would put a matched-the-craving claim on dishes that didn't. They carry a plainly weaker
 * line instead, which is also why this can prefer the wider `LOVED_POOL_MAX` ranking: preferring a
 * dish tables order is a better guess, and the card never states it as a fact.
 *
 * Deterministic, unlike `surpriseMe` — a row that reshuffles its own tail on every render reads as
 * a glitch, and there is no surprise being offered here.
 */
export function topUpToFloor<T extends { id: string }>(
  row: readonly T[],
  candidates: readonly T[],
  popularIds: readonly string[] = [],
  floor: number = TASTE_ROW_MIN,
): T[] {
  const need = floor - row.length;
  if (need <= 0) return [];
  const taken = new Set(row.map((i) => i.id));
  const eligible = candidates.filter((i) => !taken.has(i.id));
  const rank = rankLookup(popularIds);
  // Stable sort: unranked dishes keep the server's menu order among themselves.
  return [...eligible].sort((a, b) => rank(a.id) - rank(b.id)).slice(0, need);
}

/**
 * M133 / Codex round 2 P2 — the surprise row after the live pool has filtered it.
 *
 * `surpriseMe` draws once; the caller then re-derives that snapshot by id against the current pool
 * every render, because a diet toggled after the tap (or a dish going sold-out) must drop picks
 * that no longer qualify. That re-derivation could leave the row BELOW the advertised floor: draw
 * seven, switch a filter on, render three.
 *
 * A PARTIAL row and an EMPTY one are different facts and get different answers:
 *   · partial → top up from the current pool, so the row keeps the bound it advertises;
 *   · empty   → return empty, untouched. An empty surprise is INFORMATION ("nothing new to
 *               surprise you with — your favorites already cover everything that fits"), and the
 *               caller's empty states say which case it is. Padding that would replace an honest
 *               answer with a filler one.
 *
 * The top-up is DETERMINISTIC rather than a fresh random draw, for two reasons that are easy to get
 * wrong: the caller runs this inside a `useMemo`, so an `Math.random()` here would reshuffle the
 * row's tail on every render; and re-drawing the whole row would throw away the cards the diner is
 * already looking at because a filter moved. `excludeIds` carries `surpriseMe`'s own contract
 * forward — a top-up may never offer a dish they have already hearted.
 */
export function refillSurprise<T extends { id: string }>(
  alive: readonly T[],
  pool: readonly T[],
  excludeIds: ReadonlySet<string>,
  popularIds: readonly string[] = [],
): T[] {
  if (alive.length === 0) return [];
  const candidates = pool.filter((i) => !excludeIds.has(i.id));
  return [...alive, ...topUpToFloor(alive, candidates, popularIds)];
}
