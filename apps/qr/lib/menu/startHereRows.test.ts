import { describe, expect, it } from "vitest";
import { buildStartHereRows } from "./startHereRows";

type Item = {
  id: string;
  is_sold_out: boolean;
  tags: string[];
  category: string;
};

const item = (id: string, category: string, tags: string[] = [], soldOut = false): Item => ({
  id,
  is_sold_out: soldOut,
  tags,
  category,
});

/** A catalog shaped like the real one: categories in sort order, items in menu order within. */
const catalog = (spec: Record<string, number>): Item[] =>
  Object.entries(spec).flatMap(([cat, n]) =>
    Array.from({ length: n }, (_, k) => item(`${cat}-${k + 1}`, cat)),
  );

describe("buildStartHereRows", () => {
  it("row A = the paid-order ranking with its ranks preserved, capped at 10", () => {
    const items = catalog({ Noodles: 8, Curries: 8 });
    const favorites = items.slice(0, 12).map((i, k) => ({ id: i.id, rank: k + 1 }));
    const { rowA, dataBacked } = buildStartHereRows(items, favorites);
    expect(dataBacked).toBe(true);
    expect(rowA).toHaveLength(10);
    expect(rowA.map((e) => e.item.id)).toEqual(favorites.slice(0, 10).map((f) => f.id));
    expect(rowA.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("a sold-out loved dish keeps its numeral out of the row without re-numbering survivors", () => {
    const items = [
      item("a", "Noodles"),
      item("b", "Noodles", [], true),
      item("c", "Curries"),
      item("d", "Curries"),
    ];
    const favorites = [
      { id: "a", rank: 1 },
      { id: "b", rank: 2 },
      { id: "c", rank: 3 },
      { id: "d", rank: 4 },
    ];
    const { rowA } = buildStartHereRows(items, favorites);
    // b is sold out: its card is gone but c/d keep the ranks the data gave them.
    expect(rowA.map((e) => [e.item.id, e.rank])).toEqual([
      ["a", 1],
      ["c", 3],
      ["d", 4],
    ]);
  });

  it("falls back to the popular tag (rank 0, not data-backed) when history is thin", () => {
    const items = [
      item("a", "Noodles", ["popular"]),
      item("b", "Noodles", ["popular"]),
      item("c", "Curries", ["popular"]),
      item("d", "Curries"),
    ];
    const { rowA, dataBacked } = buildStartHereRows(items, [{ id: "a", rank: 1 }]);
    expect(dataBacked).toBe(false);
    expect(rowA.map((e) => e.item.id)).toEqual(["a", "b", "c"]);
    expect(rowA.every((e) => e.rank === 0)).toBe(true);
  });

  it("returns no rows at all below the 3-card floor", () => {
    const items = [item("a", "Noodles", ["popular"]), item("b", "Noodles", ["popular"])];
    const { rowA, rowB } = buildStartHereRows(items, []);
    expect(rowA).toEqual([]);
    expect(rowB).toEqual([]);
  });

  it("row B round-robins the categories over what row A left, in menu order", () => {
    const items = catalog({ Noodles: 4, Curries: 4, Desserts: 4 });
    // Row A takes the first 3 noodles (data-backed).
    const favorites = [
      { id: "Noodles-1", rank: 1 },
      { id: "Noodles-2", rank: 2 },
      { id: "Noodles-3", rank: 3 },
    ];
    const { rowB } = buildStartHereRows(items, favorites);
    // Lap 1: first remaining of each category; lap 2: second remaining; …
    expect(rowB.map((i) => i.id)).toEqual([
      "Noodles-4",
      "Curries-1",
      "Desserts-1",
      "Curries-2",
      "Desserts-2",
      "Curries-3",
      "Desserts-3",
      "Curries-4",
      "Desserts-4",
    ]);
  });

  it("row B excludes row A's picks and sold-out dishes, and caps at 10", () => {
    // "dead" leads its category: if the sold-out filter ever drops, it is lap 1's FIRST pick —
    // the fixture must put the dish where only the filter keeps it out (a sold-out card past the
    // 10-cap would let the mutation survive; watched happen red-first).
    const items = [item("dead", "Curries", [], true), ...catalog({ Noodles: 8, Curries: 8 })];
    const favorites = items.slice(1, 5).map((i, k) => ({ id: i.id, rank: k + 1 }));
    const { rowA, rowB } = buildStartHereRows(items, favorites);
    expect(rowB).toHaveLength(10);
    const aIds = new Set(rowA.map((e) => e.item.id));
    expect(rowB.some((i) => aIds.has(i.id))).toBe(false);
    expect(rowB.some((i) => i.id === "dead")).toBe(false);
  });

  it("row B below its own 3-card floor renders row A alone", () => {
    const items = catalog({ Noodles: 5 });
    const favorites = items.slice(0, 4).map((i, k) => ({ id: i.id, rank: k + 1 }));
    const { rowA, rowB } = buildStartHereRows(items, favorites);
    expect(rowA).toHaveLength(4);
    expect(rowB).toEqual([]); // only Noodles-5 remains — below the floor
  });
});
