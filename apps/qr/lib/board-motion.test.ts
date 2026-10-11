import { describe, expect, it } from "vitest";
import { planBoardMotion, rowKey, type MotionMemory } from "./board-motion";
import type { BoardDish, BoardTable } from "./board-tables";

/**
 * PD9 — the wall's motion as a value (m9 critic B6). What moves, in which order, and — the half that
 * protects a dining room — what never moves: a first read, a revisit, and anything after a frozen
 * spell. Each rule carries a `board-motion/*` mutant.
 */
const dish = (name: string, stage: BoardDish["stage"]): BoardDish => ({
  name,
  nameMy: null,
  stage,
  togo: false,
});
const table = (n: number, ...dishes: BoardDish[]): BoardTable => ({
  table: n,
  out: dishes.every((d) => d.stage === "served"),
  rounds: [{ n: 1, next: false, dishes }],
});
const seed = (tables: BoardTable[] | null, ready: string[] = []): MotionMemory =>
  planBoardMotion(null, tables, ready).memory;

describe("planBoardMotion — what moves, one thing at a time, in a fixed order", () => {
  it("a first read plays NOTHING — no storm of turns, fills or flashes after a reboot (`board-motion/first-read-plays`)", () => {
    const { steps } = planBoardMotion(
      null,
      [table(5, dish("Faluda", "served")), table(7, dish("Tea", "cooking"))],
      ["1E94D0"],
    );
    expect(steps).toEqual([]);
  });

  it("a dish that ADVANCES fills its row; a row seen for the first time lands at its final frame (`board-motion/new-row-fills`)", () => {
    const prev = seed([table(4, dish("Mohinga", "sent"))]);
    const { steps } = planBoardMotion(
      prev,
      [table(4, dish("Mohinga", "cooking"), dish("Tea", "cooking"))],
      [],
    );
    expect(steps).toEqual([{ kind: "fill", row: "4|1|d|Mohinga" }]);
  });

  it("a recall (an un-fill) is instant — nothing plays", () => {
    const prev = seed([table(4, dish("Mohinga", "cooking"))]);
    expect(planBoardMotion(prev, [table(4, dish("Mohinga", "sent"))], []).steps).toEqual([]);
  });

  it("a table whose LAST dish is served TURNs once, and its rows do not fill under it (`board-motion/turn-and-fill`)", () => {
    const prev = seed([table(7, dish("Mohinga", "served"), dish("Rice", "cooking"))]);
    const { steps } = planBoardMotion(
      prev,
      [table(7, dish("Mohinga", "served"), dish("Rice", "served"))],
      [],
    );
    expect(steps).toEqual([{ kind: "turn", table: 7 }]);
  });

  it("ONCE per visit: a Bring-back and a re-bump never celebrate the same table twice (`board-motion/celebrated-pruned-while-present`)", () => {
    const cooking = table(7, dish("Rice", "cooking"));
    const out = table(7, dish("Rice", "served"));
    const p1 = planBoardMotion(seed([cooking]), [out], []);
    expect(p1.steps).toEqual([{ kind: "turn", table: 7 }]);
    const p2 = planBoardMotion(p1.memory, [cooking], []); // recalled from the rail
    const p3 = planBoardMotion(p2.memory, [out], []); // bumped again
    expect(p3.steps).toEqual([]);
    // A NEW visit — the table left the wall, then came back — celebrates again.
    const gone = planBoardMotion(p3.memory, [], []);
    const back = planBoardMotion(gone.memory, [cooking], []);
    expect(planBoardMotion(back.memory, [out], []).steps).toEqual([{ kind: "turn", table: 7 }]);
  });

  it("several changes play in a FIXED order: tables by number, then the pickups as Ready draws them (`board-motion/pickups-before-tables`)", () => {
    const prev = seed(
      [table(3, dish("Tea", "sent")), table(9, dish("Rice", "cooking"))],
      ["7F3A2C"],
    );
    const { steps } = planBoardMotion(
      prev,
      [table(3, dish("Tea", "cooking")), table(9, dish("Rice", "served"))],
      ["4C1A9E", "7F3A2C"],
    );
    expect(steps).toEqual([
      { kind: "fill", row: "3|1|d|Tea" },
      { kind: "turn", table: 9 },
      { kind: "flash", code: "4C1A9E" },
    ]);
  });

  it("a kitchen read that did not answer plays no table step, and the next answer RE-SEEDS — never a turn for everything that went out meanwhile (`board-motion/unread-kitchen-keeps-stale-memory`)", () => {
    const prev = seed([table(7, dish("Rice", "cooking"))]);
    const blind = planBoardMotion(prev, null, []);
    expect(blind.steps).toEqual([]);
    expect(blind.memory.tables).toBeNull();
    expect(planBoardMotion(blind.memory, [table(7, dish("Rice", "served"))], []).steps).toEqual([]);
  });

  it("a row's identity is its table, round, to-go flag and name — never an id", () => {
    const r = { n: null, next: true, dishes: [] };
    expect(rowKey(4, 1, r, { ...dish("Tea", "sent"), togo: true })).toBe("4|@1|t|Tea");
  });
});
