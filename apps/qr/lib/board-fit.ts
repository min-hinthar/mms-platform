import type { BoardDish, BoardRound, BoardTable } from "./board-tables";

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

// ── PD9 — the kitchen half: table passes in two columns, stepped down to fit ─────────────────────

/**
 * PD9 (m9 "Order and fit") — how far the kitchen half has stepped down to fit the wall. Measured,
 * never a constant, like board-1: the component starts every snapshot at `tablesFitStart` and calls
 * `stepDownTables` while the passes overflow their box. The order is fixed:
 *
 *   (a) level 1 — a table that is ALL SERVED collapses to its stub and its roll-up: it has said
 *       its news;
 *   (b) level 2 — a table that is PARTLY served folds its served dishes into one row;
 *   (c) past both, the highest-numbered passes are cut one at a time, and a final "+N more" row
 *       counts the TABLES cut (never dishes). Last resort: it strands those guests' view.
 */
export type TablesFit = { level: 0 | 1 | 2; shown: number };

export function tablesFitStart(total: number): TablesFit {
  return { level: 0, shown: Math.max(0, Math.floor(total)) };
}

export function stepDownTables(fit: TablesFit): TablesFit {
  if (fit.level === 0) return { level: 1, shown: fit.shown };
  if (fit.level === 1) return { level: 2, shown: fit.shown };
  return { level: 2, shown: Math.max(0, fit.shown - 1) };
}

/** A dish row as the wall draws it: a dish, or (level 2) a table's served dishes folded into one. */
export type FitRow = { kind: "dish"; dish: BoardDish } | { kind: "folded"; dishes: BoardDish[] };
export type FitRound = Omit<BoardRound, "dishes"> & { rows: FitRow[] };
/** A pass as the wall draws it: `collapsed` is stub + roll-up only (level 1, all served). */
export type FitTable = Omit<BoardTable, "rounds"> & {
  collapsed: boolean;
  folded: FitRow | null;
  rounds: FitRound[];
};

/** The passes shown at a fit, the TABLES the cut hid, and the two columns by sorted index. */
export type TablesView = { columns: [FitTable[], FitTable[]]; more: number };

/**
 * The view at a fit. Columns come from the SORTED INDEX, never from card heights (Codex round 4 on
 * #319): the first ⌈n/2⌉ tables by number go left and the rest right, so a status change that
 * collapses a pass never moves another table to the other side.
 */
export function viewTables(tables: readonly BoardTable[], fit: TablesFit): TablesView {
  const shownCount = Math.min(tables.length, fit.shown);
  const shown = tables.slice(0, shownCount).map((t) => fitTable(t, fit.level));
  const left = Math.ceil(shown.length / 2);
  return { columns: [shown.slice(0, left), shown.slice(left)], more: tables.length - shownCount };
}

function fitTable(t: BoardTable, level: TablesFit["level"]): FitTable {
  const asRows = (r: BoardRound): FitRound => ({
    n: r.n,
    next: r.next,
    rows: r.dishes.map((dish): FitRow => ({ kind: "dish", dish })),
  });
  // (a) all served: the stub and its roll-up say it; the rows go.
  if (t.out && level >= 1)
    return { table: t.table, out: true, collapsed: true, folded: null, rounds: [] };
  const served = t.rounds.flatMap((r) => r.dishes.filter((d) => d.stage === "served"));
  // (b) partly served: the served dishes fold into ONE row, ahead of what is still cooking; a round
  // left with nothing on it drops with its stub.
  if (!t.out && level >= 2 && served.length > 1) {
    return {
      table: t.table,
      out: false,
      collapsed: false,
      folded: { kind: "folded", dishes: served },
      rounds: t.rounds
        .map((r) => ({ ...r, dishes: r.dishes.filter((d) => d.stage !== "served") }))
        .filter((r) => r.dishes.length > 0)
        .map(asRows),
    };
  }
  return {
    table: t.table,
    out: t.out,
    collapsed: false,
    folded: null,
    rounds: t.rounds.map(asRows),
  };
}
