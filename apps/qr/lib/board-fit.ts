/**
 * board-1 — the rush cut. A wall TV cannot scroll and nobody stands at it to page, so a column that
 * grows past its screen pushes the runner's `Food up` band and the oldest bags off the bottom in
 * silence — the O-D rule this violates is "nothing hides silently". The cut is a VALUE decided
 * here, from a measured `cap` (rows the column can show), never from a constant: a hand-picked six
 * is wrong on the next TV. The last slot goes to the `+N more` row whenever anything is hidden, so
 * the room is told what it is not seeing.
 *
 * `cap` is `Infinity` until the column has been measured (a board that has not laid out yet shows
 * everything, the CSS clip keeps it on-screen meanwhile); a cap under 1 shows only the `+N more`
 * row, which is the honest answer for a column with no room.
 */
export type ColumnFit = { shown: number; more: number };

export function boardColumnFit(count: number, cap: number): ColumnFit {
  const n = Math.max(0, Math.floor(count));
  if (!Number.isFinite(cap) || n <= cap) return { shown: n, more: 0 };
  const shown = Math.max(0, Math.floor(cap) - 1);
  return { shown, more: n - shown };
}
