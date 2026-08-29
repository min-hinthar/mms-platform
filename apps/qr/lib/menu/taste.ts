/**
 * W21 → M137 — the taste band's rules, pure.
 *
 * W21 built this as a CRAVING PICKER: eight chips (🍜 noodles, 🌶 heat, 🧁 sweet …), each mapping to
 * a real category keyword or a tag the menu already declares, plus a surprise draw beside them. The
 * owner has since made surprise the section's only feature ("make surprise your taste buds the one
 * and only main feature … so let's reimagine it"), so `CRAVINGS`, `recommendByTaste` and their
 * types are DELETED rather than left exported for nobody — the same call M135 made on `mostLoved`.
 * The matching rules are in git if the picker ever comes back.
 *
 * HONEST by construction, and that survives the narrowing intact: nothing here invents an affinity,
 * a rating or a "people like you" claim. The draw PREFERS the dishes the restaurant actually sells
 * most (M135's POS units) and says nothing about it — the cards read "How about this?", which is
 * the whole claim.
 */

/**
 * M133 → M135 (owner: "at least 4 and at most 7", then "at most 8 menu items and displayed as one
 * row"). ONE pair of bounds the whole band reads, so the surprise draw and the refill can never
 * disagree about how long a row is — the "name it ONCE" rule applied to a count.
 *
 * The MAX is a hard slice. The MIN is a TARGET, not a promise the data can always keep: a menu with
 * three eligible dishes left has three, and inventing a fourth is the exact fabrication this file
 * exists to prevent. `refillSurprise` reaches the floor the only honest way — from dishes that are
 * genuinely eligible, and never by padding a row that came back EMPTY, because an empty answer is
 * itself information the diner needs.
 */
export const TASTE_ROW_MIN = 4;
export const TASTE_ROW_MAX = 8;

/**
 * A popularity ranking as a LOOKUP — most-ordered first, so position 0 is the most ordered dish.
 * Anything unranked sorts last rather than being excluded: a preference, never a filter.
 *
 * M131 (owner: "menu item suggestions should mostly be selected from the top 50 of popular,
 * customer most ordered items"). The list is the owner's PayPal/Zettle POS order (M135),
 * which is deliberately NOT the bound that backs the visible "Most ordered" badge — see the note
 * on those two constants. Nothing here reaches the diner as a claim; it only decides which honest
 * match gets offered first, so it can prefer a broader ranking than a badge is allowed to.
 */
function rankLookup(popularIds: readonly string[]) {
  const m = new Map(popularIds.map((id, i) => [id, i]));
  return (id: string) => m.get(id) ?? Number.MAX_SAFE_INTEGER;
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
 * line instead, which is also why this can prefer the FULL sales order rather than the badge's
 * top twelve: preferring a
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
