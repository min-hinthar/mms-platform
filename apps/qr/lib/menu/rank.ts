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
