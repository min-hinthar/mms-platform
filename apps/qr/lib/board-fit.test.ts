import { describe, expect, it } from "vitest";
import {
  boardColumnFit,
  distinctNames,
  stepDownTables,
  tablesFitStart,
  viewTables,
} from "./board-fit";
import type { BoardDish, BoardTable } from "./board-tables";
import { planBoardMotion } from "./board-motion";

describe("board-1 — the rush cut is a value: rows shown, rows hidden, the last slot for `+N more`", () => {
  it("shows everything that fits, and says nothing is hidden", () => {
    expect(boardColumnFit(4, 6)).toEqual({ shown: 4, more: 0 });
    expect(boardColumnFit(6, 6)).toEqual({ shown: 6, more: 0 });
  });
  it("an unmeasured column (Infinity) shows everything — the CSS clip holds it meanwhile", () => {
    expect(boardColumnFit(40, Infinity)).toEqual({ shown: 40, more: 0 });
  });
  it("past the cap, the LAST slot is the `+N more` row and the count includes every hidden card", () => {
    // MUTATION: `shown: cap` (no slot for the row) — the row pushes a card off the screen, red.
    expect(boardColumnFit(9, 8)).toEqual({ shown: 7, more: 2 });
    // MUTATION: `more: n - cap` — the row under-counts by one, red.
    expect(boardColumnFit(60, 6)).toEqual({ shown: 5, more: 55 });
  });
  it("a column with room for one row shows only the count", () => {
    expect(boardColumnFit(3, 1)).toEqual({ shown: 0, more: 3 });
    expect(boardColumnFit(3, 0)).toEqual({ shown: 0, more: 3 });
  });
  it("never shows a negative or fractional row count", () => {
    expect(boardColumnFit(-2, 6)).toEqual({ shown: 0, more: 0 });
    expect(boardColumnFit(5, 3.7)).toEqual({ shown: 2, more: 3 });
  });
});

// ── PD9 — the kitchen half's step-down ──────────────────────────────────────────────────────────

const dish = (name: string, stage: BoardDish["stage"]): BoardDish => ({
  name,
  nameMy: null,
  stage,
  togo: false,
});
const table = (n: number, out: boolean, ...stages: BoardDish["stage"][]): BoardTable => ({
  table: n,
  out,
  rounds: [{ n: 1, next: false, dishes: stages.map((s, i) => dish(`D${n}.${i}`, s)) }],
});

describe("PD9 — the passes step down in a fixed order: (a) collapse the served, (b) fold, (c) cut", () => {
  it("starts full, then (a), then (b), then cuts one table at a time (`board-fit/step-down-order`)", () => {
    const start = tablesFitStart(5);
    expect(start).toEqual({ level: 0, shown: 5 });
    const a = stepDownTables(start);
    expect(a).toEqual({ level: 1, shown: 5 });
    const b = stepDownTables(a);
    expect(b).toEqual({ level: 2, shown: 5 });
    expect(stepDownTables(b)).toEqual({ level: 2, shown: 4 });
    expect(stepDownTables({ level: 2, shown: 0 })).toEqual({ level: 2, shown: 0 });
  });

  it("(a) an ALL-SERVED table collapses to its stub and roll-up; a cooking one keeps every row (`board-fit/collapse-a-cooking-table`)", () => {
    const tables = [table(2, true, "served"), table(3, false, "cooking", "served")];
    const view = viewTables(tables, { level: 1, shown: 2 });
    const [t2] = view.columns[0];
    const [t3] = view.columns[1];
    expect(t2).toMatchObject({ table: 2, collapsed: true, rounds: [] });
    expect(t3).toMatchObject({ table: 3, collapsed: false, folded: null });
    expect(t3!.rounds[0]!.rows).toHaveLength(2);
    // Level 0 never collapses.
    expect(viewTables(tables, tablesFitStart(2)).columns[0][0]).toMatchObject({ collapsed: false });
  });

  it("(b) a PARTLY served table folds its served dishes into ONE row ahead of what still cooks (`board-fit/fold-the-cooking`)", () => {
    const t = table(4, false, "served", "cooking", "served");
    const [v] = viewTables([t], { level: 2, shown: 1 }).columns[0];
    expect(v!.folded).toEqual({
      kind: "folded",
      dishes: [dish("D4.0", "served"), dish("D4.2", "served")],
    });
    expect(v!.rounds[0]!.rows).toEqual([
      { kind: "dish", dish: dish("D4.1", "cooking"), key: "4|1|d|D4.1" },
    ]);
    // Level 1 does not fold.
    expect(viewTables([t], { level: 1, shown: 1 }).columns[0][0]!.folded).toBeNull();
  });

  it("a row keeps the motion key the PLANNER mints, from its round's ORIGINAL index — even after the fold drops an emptied round (the blind pass on #336; `board-fit/fold-keys-by-the-shifted-index`)", () => {
    // Table 4: round 1 all served (it drops at the fold), round 2 UNNUMBERED (the round read did not
    // answer), its Tea advancing to Cooking. The planner keys the Tea by its round's position, @1.
    const before: BoardTable = {
      table: 4,
      out: false,
      rounds: [
        { n: null, next: false, dishes: [dish("Mohinga", "served"), dish("Rice", "served")] },
        { n: null, next: true, dishes: [dish("Tea", "sent")] },
      ],
    };
    const after: BoardTable = {
      ...before,
      rounds: [before.rounds[0]!, { ...before.rounds[1]!, dishes: [dish("Tea", "cooking")] }],
    };
    const seeded = planBoardMotion(null, [before], []).memory;
    const fill = planBoardMotion(seeded, [after], []).steps;
    expect(fill).toEqual([{ kind: "fill", row: "4|@1|d|Tea" }]);
    const [v] = viewTables([after], { level: 2, shown: 1 }).columns[0];
    expect(v!.rounds).toHaveLength(1); // round 1 folded away
    const row = v!.rounds[0]!.rows[0]!;
    expect(row.kind === "dish" ? row.key : null).toBe("4|@1|d|Tea");
  });

  it("(c) the cut takes the HIGHEST numbers and '+N more' counts the TABLES cut (`board-fit/cut-the-lowest`, `board-fit/more-counts-dishes`)", () => {
    const tables = [2, 3, 4, 5, 7].map((n) => table(n, false, "sent", "sent", "sent"));
    const view = viewTables(tables, { level: 2, shown: 3 });
    expect(view.columns.flat().map((t) => t.table)).toEqual([2, 3, 4]);
    expect(view.more).toBe(2);
  });

  it("columns come from the sorted index: the first ⌈n/2⌉ tables left, the rest right — never from heights (Codex round 4 on #319; `board-fit/columns-from-heights`)", () => {
    const tables = [2, 3, 4, 5, 7].map((n) => table(n, n === 3, n === 3 ? "served" : "sent"));
    const view = viewTables(tables, { level: 1, shown: 5 });
    expect(view.columns.map((c) => c.map((t) => t.table))).toEqual([
      [2, 3, 4],
      [5, 7],
    ]);
  });
});

describe("distinctNames — sibling lists a screen reader can tell apart (the blind pass on #336)", () => {
  it("keeps a unique name as is, and numbers each repeat after its first (`board-fit/distinct-names-repeat`)", () => {
    expect(distinctNames(["Table 4", "Table 4 · Round 2", "Table 4", "Table 4"])).toEqual([
      "Table 4",
      "Table 4 · Round 2",
      "Table 4 (2)",
      "Table 4 (3)",
    ]);
    expect(distinctNames([])).toEqual([]);
  });
});
