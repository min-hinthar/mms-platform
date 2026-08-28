/**
 * W22 (owner: "start here should world class UI/UX feature two independent moving and
 * micro-interactions rows each 10 items") — the twin-row curation, pure.
 *
 * Row A is the most-ordered dishes, in sales order — M135 replaced the app's own paid-order
 * aggregate with the owner's PayPal/Zettle till export (`lib/menu/posPopular.ts`) and removed the
 * rank seals with it: the owner asked for the sales data "instead of ranking them or numbering", so
 * no card here carries a numeral or makes an ordinal claim. The hand-set `popular` tag is still the
 * fallback when the export matches nothing on today's menu. Row B is a DIFFERENT, weaker claim and
 * says so: "a little of everything" — a round-robin across categories over the in-stock items row A
 * didn't take. That is a curation rule, not a ranking, and it never borrows row A's framing.
 *
 * Both rows keep the ≥3 floor (a 1–2 card "row" reads as broken); row B missing simply renders
 * row A alone.
 *
 * M131 → M133 (owner, twice: "a little bit of everything … should mostly be selected from the top
 * 50 of popular, customer most ordered items"). M131 only ORDERED each category bucket by that
 * ranking, which was too small a change — a category with a ranked dish and a category without one
 * contributed equally on lap 1, so the row could be mostly unranked while claiming to prefer what
 * tables order. Row B now SELECTS in three rounds:
 *
 *   Round 1 — one dish per category, its best-ranked (the buckets are rank-sorted). COVERAGE.
 *   Round 2 — the remaining slots, most-ordered dishes only, always to the least-served category.
 *   Round 3 — anything still eligible, so a thin ranking never returns a short row.
 *
 * Coverage is bought FIRST and popularity spends what is left. An earlier draft ran the ranked
 * round unbounded and Codex caught what that costs: "least-served" balances only the buckets that
 * HAVE an eligible dish, so a category with nothing ranked is skipped rather than waited for, and
 * ten ranked dishes in one category would take the whole cap — a row captioned "a little of
 * everything" showing exactly one.
 *
 * ⚠️ Round 3 is not a nicety, and it is why this is not a FILTER. "A little of everything" is a
 * claim about COVERAGE. Restricting the row to ranked dishes would silently drop every category the
 * export does not reach — 76 of our 97 dishes carry POS units (M135), so 21 do not, and they are
 * not evenly spread across the menu. Round 3 keeps the promise the caption makes; rounds 1–2 make
 * the dishes that fill it the ones the restaurant actually sells.
 */

export type StartHereRowItem = {
  id: string;
  is_sold_out: boolean;
  tags: readonly string[];
  category: string;
};

export const START_HERE_ROW_CAP = 10;
const ROW_MIN = 3;

export function buildStartHereRows<T extends StartHereRowItem>(
  items: readonly T[],
  /** The most-ordered dishes, most-sold first — `POS_BADGE_MAX` of them (M135, from the owner's
   *  PayPal/Zettle export). No rank travels with them any more: the owner asked for the sales data
   *  "instead of ranking them or numbering", so row A is a SET of most-ordered dishes in sales
   *  order, and no card makes an ordinal claim. Empty when the export matches nothing on this menu. */
  favorites: readonly { id: string }[],
  /**
   * M131 — the FULL most-ordered order (M135: every dish the POS export matched), most-sold
   * first. A selection
   * preference, never a displayed claim: it decides which dish represents its category in row B,
   * and nothing about it reaches the diner as words. Empty (the default) restores the pre-M131
   * behaviour exactly — menu order inside every bucket — so a thin history or a failed aggregate
   * degrades to the row that shipped before, not to an empty one.
   */
  popularIds: readonly string[] = [],
): { rowA: T[]; rowB: T[]; dataBacked: boolean } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const loved = favorites
    .map(({ id }) => byId.get(id))
    .filter((i): i is T => !!i && !i.is_sold_out);
  const dataBacked = loved.length >= ROW_MIN;
  const poolA = dataBacked
    ? loved
    : items.filter((i) => !i.is_sold_out && i.tags.includes("popular"));
  const rowA = poolA.slice(0, START_HERE_ROW_CAP);
  if (rowA.length < ROW_MIN) return { rowA: [], rowB: [], dataBacked };

  // Row B — round-robin the categories (first-appearance order = the server's sort_order) over
  // what's left: lap 1 takes each category's first remaining dish, lap 2 its second, until the cap.
  const taken = new Set(rowA.map((i) => i.id));
  const byCat = new Map<string, T[]>();
  for (const i of items) {
    if (i.is_sold_out || taken.has(i.id)) continue;
    const bucket = byCat.get(i.category);
    if (bucket) bucket.push(i);
    else byCat.set(i.category, [i]);
  }
  // Order INSIDE each bucket by the popularity ranking, menu order for anything unranked. A stable
  // sort keeps the server's sort_order among equals, so an empty `popularIds` is a no-op.
  const popRank = new Map(popularIds.map((id, i) => [id, i]));
  const rankOf = (i: T) => popRank.get(i.id) ?? Number.MAX_SAFE_INTEGER;
  const buckets = [...byCat.values()].map((b) => [...b].sort((x, y) => rankOf(x) - rankOf(y)));
  const rowB: T[] = [];
  const picked = new Set<string>();
  // How many dishes each category has contributed SO FAR (`taken` above is row A's id set).
  // Each step serves the LEAST-served category that still has an eligible dish, so the two phases
  // share one balance and no category can take a second dish while another has none.
  //
  // ⚠️ Deliberately a least-served SEARCH and not a lap counter, which is what the first draft used
  // and what a reader will be tempted to simplify this back into. A lap index has to start
  // somewhere, and phase 2 starting its own at 0 found every bucket already above 0, saw no
  // progress and returned on its first pass — row B came back with two dishes, fell under the
  // ROW_MIN floor, and the whole row silently disappeared. There is no lap number here to get
  // wrong: the invariant ("serve whoever has the least") is stated directly.
  const served = new Map<readonly T[], number>();
  const laps = (eligible: (i: T) => boolean, maxPerCategory = START_HERE_ROW_CAP) => {
    while (rowB.length < START_HERE_ROW_CAP) {
      let bucket: readonly T[] | null = null;
      let pick: T | null = null;
      for (const b of buckets) {
        if ((served.get(b) ?? 0) >= maxPerCategory) continue;
        const candidate = b.find((i) => !picked.has(i.id) && eligible(i));
        if (!candidate) continue;
        // Strictly `<` so ties keep the buckets' own order, which is the server's sort_order.
        if (bucket === null || (served.get(b) ?? 0) < (served.get(bucket) ?? 0)) {
          bucket = b;
          pick = candidate;
        }
      }
      if (!bucket || !pick) return; // nothing eligible anywhere — this round is done
      rowB.push(pick);
      picked.add(pick.id);
      served.set(bucket, (served.get(bucket) ?? 0) + 1);
    }
  };

  // ROUND 1 — COVERAGE, and it goes first (Codex round 2, P2 on #239, and the finding was right).
  // "Least-served" only balances buckets that HAVE an eligible candidate: a bucket with no ranked
  // dish is skipped entirely, not waited for. So a ranked-first round running unbounded could take
  // the whole ten-card cap out of one popular category — Codex's example, ten ranked Curries —
  // leaving the coverage round nothing to do and "a little of everything" showing one category.
  // One dish per category first, ranked-first INSIDE each (the buckets are already rank-sorted),
  // so the caption's promise is paid for before popularity gets the remaining slots.
  laps(() => true, 1);
  // ROUND 2 — the ranking, on what's left. This is the owner's ask: beyond the one-per-category
  // floor, the dishes that fill the row are the ones tables actually order.
  laps((i) => popRank.has(i.id));
  // ROUND 3 — anything still eligible, so a thin ranking never returns a short row.
  laps(() => true);
  return { rowA, rowB: rowB.length >= ROW_MIN ? rowB : [], dataBacked };
}
