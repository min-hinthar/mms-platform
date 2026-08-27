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
 * M131 (owner: "a little bit of everything … should mostly be selected from the top 50 of popular,
 * customer most ordered items") — row B now ORDERS ITS BUCKETS by that ranking, and that is a
 * deliberately smaller change than filtering to it. "A little of everything" is a claim about
 * COVERAGE: one dish from each category, then a second lap. Filtering the candidates to the top 50
 * would silently drop any category with nothing in the top 50 — the row would quietly stop being a
 * little of everything while still saying it was. Sorting inside each bucket keeps every category
 * represented and makes the dish that represents it the one tables actually order. Categories with
 * no ranked dish still appear, led by their menu-order first item, which is the honest fallback.
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
  /** Paid-order ranking (competitionRanks order) — empty while history is thin. */
  favorites: readonly { id: string; rank: number }[],
  /**
   * M131 — the WIDER popularity ranking (`LOVED_POOL_MAX`), most-ordered first. A selection
   * preference, never a displayed claim: it decides which dish represents its category in row B,
   * and nothing about it reaches the diner as words. Empty (the default) restores the pre-M131
   * behaviour exactly — menu order inside every bucket — so a thin history or a failed aggregate
   * degrades to the row that shipped before, not to an empty one.
   */
  popularIds: readonly string[] = [],
): { rowA: { item: T; rank: number }[]; rowB: T[]; dataBacked: boolean } {
  const byId = new Map(items.map((i) => [i.id, i]));
  // The rank is taken BEFORE the sold-out filter (W20 review): a sold-out dish keeps its numeral
  // and simply doesn't render — survivors are never re-numbered into a claim the data doesn't back.
  const loved = favorites
    .map(({ id, rank }) => ({ item: byId.get(id), rank }))
    .filter((e): e is { item: T; rank: number } => !!e.item && !e.item.is_sold_out);
  const dataBacked = loved.length >= ROW_MIN;
  const poolA = dataBacked
    ? loved
    : items
        .filter((i) => !i.is_sold_out && i.tags.includes("popular"))
        .map((item) => ({ item, rank: 0 })); // rank unused — the fallback row shows no seals
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
  for (let lap = 0; rowB.length < START_HERE_ROW_CAP; lap++) {
    const lapPicks = buckets.filter((b) => lap < b.length).map((b) => b[lap]!);
    if (lapPicks.length === 0) break;
    rowB.push(...lapPicks.slice(0, START_HERE_ROW_CAP - rowB.length));
  }
  return { rowA, rowB: rowB.length >= ROW_MIN ? rowB : [], dataBacked };
}
