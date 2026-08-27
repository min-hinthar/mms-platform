import { describe, expect, it } from "vitest";
import { competitionRanks, soleRanks } from "./rank";

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

describe("soleRanks — a numeral two dishes share is withheld, not re-ordered (M133)", () => {
  it("keeps every rank when nothing is tied", () => {
    expect(soleRanks([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it("nulls BOTH sides of a tie — neither dish may wear the shared numeral", () => {
    expect(soleRanks([1, 2, 2, 4])).toEqual([1, null, null, 4]);
  });

  it("the live shape: only #1 survives", () => {
    // The prod top-12 on 2026-08-27, measured from qr_order_items over the 60-day paid window:
    // 5 orders · 4 · 4 · 3 · 3 · 3 · 3 · 2 · 2 · 2 · 2 · 2. Five cards wore an identical 8.
    expect(soleRanks([1, 2, 2, 4, 5, 5, 5, 8, 8, 8, 8, 8])).toEqual([
      1,
      null,
      null,
      4,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("a rank shared by a NON-ADJACENT pair is still withheld", () => {
    // competitionRanks only ever ties neighbours, but soleRanks takes a plain list of numbers and
    // must not quietly depend on that: counting occurrences, not comparing neighbours, is what
    // makes it safe to reuse on any ranking.
    expect(soleRanks([1, 2, 3, 2])).toEqual([1, null, 3, null]);
  });

  it("an empty ranking is an empty answer, not a throw", () => {
    expect(soleRanks([])).toEqual([]);
  });
});
