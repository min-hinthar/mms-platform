/**
 * W21 (Codex P2 on #191) — competition ("1224") ranking for an already-sorted list. The Start-here
 * rank seals make an ORDINAL claim ("No. 2 at tables"), but `getMostLoved`'s comparator can tie
 * (same distinct-order count AND qty), and a tie's relative order is arbitrary insertion order —
 * so converting array POSITION to a rank labeled one tied dish above the other on data that
 * establishes no such thing. Competition ranks give tied entries the SAME numeral and skip the
 * next (1, 2, 2, 4) — every seal stays a claim the counts actually back.
 */
export function competitionRanks<T>(
  sorted: readonly T[],
  tiedWithPrev: (a: T, b: T) => boolean,
): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    ranks.push(i > 0 && tiedWithPrev(sorted[i]!, sorted[i - 1]!) ? ranks[i - 1]! : i + 1);
  }
  return ranks;
}

/**
 * M133 (owner: "what is wrong with the numberings duplicates on the cards of Start here?").
 *
 * Competition ranking is CORRECT and stays: tied dishes must share a numeral, because the counts
 * establish no order between them. What was wrong is showing that numeral. On the live menu today
 * the top twelve rank 1, 2, 2, 4, 5, 5, 5, 8, 8, 8, 8, 8 — five cards wearing an identical "8" and
 * three wearing "5". Every one of those seals is true and the band still reads as broken, because
 * a numeral repeated five times has stopped functioning as a rank to the person looking at it.
 *
 * So a seal renders only where the rank is UNIQUE. A shared rank returns null and its card carries
 * no seal at all — it is still in the row, still one of the most-loved dishes, it just makes no
 * ordinal claim. Nothing here weakens an existing claim; it withholds the ones that were never
 * legible. As real order history accumulates, ties break on their own and the seals come back.
 *
 * Deliberately NOT solved by breaking ties on a third key (price, name, menu order): that would
 * manufacture an order the data does not contain, print it as a numeral, and be indistinguishable
 * from a real ranking to everyone who reads it.
 */
export function soleRanks(ranks: readonly number[]): (number | null)[] {
  const seen = new Map<number, number>();
  for (const r of ranks) seen.set(r, (seen.get(r) ?? 0) + 1);
  return ranks.map((r) => (seen.get(r) === 1 ? r : null));
}
