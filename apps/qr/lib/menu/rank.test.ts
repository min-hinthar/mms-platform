import { describe, expect, it } from "vitest";
import { competitionRanks } from "./rank";

/** W21 — tie-aware ranks: a seal must never order two dishes the data left tied. */

type Loved = { orders: number; qty: number };
const tied = (a: Loved, b: Loved) => a.orders === b.orders && a.qty === b.qty;

describe("competitionRanks", () => {
  it("no ties → plain 1..n", () => {
    expect(
      competitionRanks(
        [
          { orders: 9, qty: 12 },
          { orders: 7, qty: 9 },
          { orders: 3, qty: 3 },
        ],
        tied,
      ),
    ).toEqual([1, 2, 3]);
  });

  it("tied entries share the numeral and the next rank SKIPS (1, 2, 2, 4)", () => {
    expect(
      competitionRanks(
        [
          { orders: 9, qty: 12 },
          { orders: 7, qty: 9 },
          { orders: 7, qty: 9 },
          { orders: 3, qty: 3 },
        ],
        tied,
      ),
    ).toEqual([1, 2, 2, 4]);
  });

  it("a tie at the TOP crowns both — two honest 'Most loved' seals, no invented No. 2", () => {
    expect(
      competitionRanks(
        [
          { orders: 9, qty: 12 },
          { orders: 9, qty: 12 },
          { orders: 3, qty: 3 },
        ],
        tied,
      ),
    ).toEqual([1, 1, 3]);
  });

  it("same orders but different qty is NOT a tie — the comparator did order them", () => {
    expect(
      competitionRanks(
        [
          { orders: 9, qty: 12 },
          { orders: 9, qty: 8 },
        ],
        tied,
      ),
    ).toEqual([1, 2]);
  });

  it("empty list → empty ranks", () => {
    expect(competitionRanks([], tied)).toEqual([]);
  });
});
