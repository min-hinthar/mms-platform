/**
 * W22 (owner: "start here should world class UI/UX feature two independent moving and
 * micro-interactions rows each 10 items") — the twin-row curation, pure.
 *
 * Row A is the EXISTING honest curation, unchanged in substance: real paid-order ranking first
 * (rank seals, tie-aware numerals carried in from the caller), hand-set `popular` fallback while
 * history is thin (no seals — nothing to claim). Row B is a DIFFERENT, weaker claim and says so:
 * "a little of everything" — a round-robin across categories (one dish from each in menu order,
 * then a second lap) over the in-stock items row A didn't take. That is a real curation rule, not
 * a ranking, so row B never wears a seal and never borrows row A's "what tables love" framing.
 *
 * Both rows keep the ≥3 floor (a 1–2 card "row" reads as broken); row B missing simply renders
 * row A alone — exactly the pre-W22 band.
 *
 * M131 → M133 (owner, twice: "a little bit of everything … should mostly be selected from the top
 * 50 of popular, customer most ordered items"). M131 only ORDERED each category bucket by that
 * ranking, which was too small a change — a category with a ranked dish and a category without one
 * contributed equally on lap 1, so the row could be mostly unranked while claiming to prefer what
 * tables order. Row B now SELECTS in two phases:
 *
 *   Phase 1 — serve only TOP-50 dishes, always to the least-served category.
 *   Phase 2 — if the cap is not met, serve everything else the same way.
 *
 * So every ranked dish is offered before any unranked one, and it is still one dish per category
 * per turn rather than a run of dishes from whichever category happens to be popular.
 *
 * ⚠️ Phase 2 is not a nicety, and it is why this is not a FILTER. "A little of everything" is a
 * claim about COVERAGE. Filtering to the top 50 would silently drop every category with nothing in
 * it — on the live menu today only 17 dishes clear the ranking's own ≥2-distinct-orders floor, and
 * row A takes ten of them, so a filtered row B would collapse to a handful of dishes from three or
 * four categories while the caption still said "a little of everything". Phase 2 keeps the promise
 * the caption makes; phase 1 makes the dishes that fill it the ones tables actually order.
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
  /** Paid-order ranking (competitionRanks order) — empty while history is thin. `rank` is null for
   *  a numeral SHARED with another dish: the row still holds it, it just makes no ordinal claim
   *  (M133, `soleRanks`). It is carried, never re-derived, so this stays a pure pass-through. */
  favorites: readonly { id: string; rank: number | null }[],
  /**
   * M131 — the WIDER popularity ranking (`LOVED_POOL_MAX`), most-ordered first. A selection
   * preference, never a displayed claim: it decides which dish represents its category in row B,
   * and nothing about it reaches the diner as words. Empty (the default) restores the pre-M131
   * behaviour exactly — menu order inside every bucket — so a thin history or a failed aggregate
   * degrades to the row that shipped before, not to an empty one.
   */
  popularIds: readonly string[] = [],
): { rowA: { item: T; rank: number | null }[]; rowB: T[]; dataBacked: boolean } {
  const byId = new Map(items.map((i) => [i.id, i]));
  // The rank is taken BEFORE the sold-out filter (W20 review): a sold-out dish keeps its numeral
  // and simply doesn't render — survivors are never re-numbered into a claim the data doesn't back.
  const loved = favorites
    .map(({ id, rank }) => ({ item: byId.get(id), rank }))
    .filter((e): e is { item: T; rank: number | null } => !!e.item && !e.item.is_sold_out);
  const dataBacked = loved.length >= ROW_MIN;
  const poolA = dataBacked
    ? loved
    : items
        .filter((i) => !i.is_sold_out && i.tags.includes("popular"))
        .map((item) => ({ item, rank: null })); // no seals on the fallback row — nothing to claim
  const rowA = poolA.slice(0, START_HERE_ROW_CAP);
  if (rowA.length < ROW_MIN) return { rowA: [], rowB: [], dataBacked };

  // Row B — round-robin the categories (first-appearance order = the server's sort_order) over
  // what's left: lap 1 takes each category's first remaining dish, lap 2 its second, until the cap.
  const taken = new Set(rowA.map((e) => e.item.id));
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
  const laps = (eligible: (i: T) => boolean) => {
    while (rowB.length < START_HERE_ROW_CAP) {
      let bucket: readonly T[] | null = null;
      let pick: T | null = null;
      for (const b of buckets) {
        const candidate = b.find((i) => !picked.has(i.id) && eligible(i));
        if (!candidate) continue;
        // Strictly `<` so ties keep the buckets' own order, which is the server's sort_order.
        if (bucket === null || (served.get(b) ?? 0) < (served.get(bucket) ?? 0)) {
          bucket = b;
          pick = candidate;
        }
      }
      if (!bucket || !pick) return; // nothing eligible anywhere — this phase is done
      rowB.push(pick);
      picked.add(pick.id);
      served.set(bucket, (served.get(bucket) ?? 0) + 1);
    }
  };
  laps((i) => popRank.has(i.id)); // phase 1 — the top 50 only
  laps(() => true); // phase 2 — coverage, from whatever is left
  return { rowA, rowB: rowB.length >= ROW_MIN ? rowB : [], dataBacked };
}
