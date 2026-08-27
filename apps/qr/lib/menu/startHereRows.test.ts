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

  it("falls back to the popular tag (rank null, not data-backed) when history is thin", () => {
    const items = [
      item("a", "Noodles", ["popular"]),
      item("b", "Noodles", ["popular"]),
      item("c", "Curries", ["popular"]),
      item("d", "Curries"),
    ];
    const { rowA, dataBacked } = buildStartHereRows(items, [{ id: "a", rank: 1 }]);
    expect(dataBacked).toBe(false);
    expect(rowA.map((e) => e.item.id)).toEqual(["a", "b", "c"]);
    // M133 — `null`, not the old `0` sentinel. StartHereBand seals on `rank != null`, so a magic
    // 0 was one careless `!== undefined` away from printing a "0" coin on every fallback card.
    expect(rowA.every((e) => e.rank === null)).toBe(true);
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

describe("M131 — row B leads each category with what tables actually order", () => {
  // Row A must FILL, or the function returns early and there is no row B to assert about — the
  // first draft of these fixtures missed that and failed for a reason that had nothing to do with
  // the rule under test. Starters are the loved row; everything else is row B's to arrange.
  const loved = [
    { id: "Starters-1", rank: 1 },
    { id: "Starters-2", rank: 2 },
    { id: "Starters-3", rank: 3 },
  ];

  it("orders INSIDE each bucket by the popularity ranking, not menu order", () => {
    const items = catalog({ Starters: 3, Noodles: 3, Curries: 3 });
    const { rowB } = buildStartHereRows(items, loved, ["Curries-3", "Noodles-2"]);
    // Lap 1 takes each category's HIGHEST-RANKED remaining dish rather than its first in menu order.
    expect(rowB.slice(0, 2).map((i) => i.id)).toEqual(["Noodles-2", "Curries-3"]);
  });

  it("a category with NOTHING ranked still appears — after the ranked dishes, not interleaved", () => {
    // The whole point of not FILTERING to the top 50: "a little of everything" is a coverage claim,
    // and a filter would silently drop a category while the caption still promised it.
    //
    // Round 1 is one dish per category, best-ranked INSIDE each — so Curries leads with its ranked
    // dish while Noodles and Desserts lead with their menu-order first. An intermediate M133 draft
    // ran the ranked round first and unbounded, which put Curries-2 at the head of the whole row;
    // Codex round 2 showed what that costs when a category holds many ranked dishes, so coverage
    // is bought first now. The coverage assertion above is the invariant either way.
    const items = catalog({ Starters: 3, Noodles: 2, Curries: 2, Desserts: 2 });
    const { rowB } = buildStartHereRows(items, loved, ["Curries-2"]);
    expect(new Set(rowB.map((i) => i.category))).toEqual(
      new Set(["Noodles", "Curries", "Desserts"]),
    );
    expect(rowB.slice(0, 3).map((i) => i.id)).toEqual(["Noodles-1", "Curries-2", "Desserts-1"]);
  });

  it("no ranking at all is a NO-OP — the pre-M131 menu order, exactly", () => {
    // The degraded shape: a thin history, or an aggregate that failed and returned []. Row B must
    // still be the row that shipped before, never an empty or re-ordered one.
    const items = catalog({ Starters: 3, Noodles: 3, Curries: 3 });
    expect(buildStartHereRows(items, loved, []).rowB.map((i) => i.id)).toEqual(
      buildStartHereRows(items, loved).rowB.map((i) => i.id),
    );
    expect(
      buildStartHereRows(items, loved)
        .rowB.slice(0, 2)
        .map((i) => i.id),
    ).toEqual(["Noodles-1", "Curries-1"]);
  });
});

describe("M133 — row B SELECTS from the ranking, it no longer merely orders by it", () => {
  // Three categories, three dishes each. Row A is fed from a fourth category so it never competes
  // for these — the ROW_MIN=3 floor means row A must be non-empty or the function returns early.
  const items = [...catalog({ Seed: 3 }), ...catalog({ Noodles: 3, Curries: 3, Salads: 3 })];
  const loved = catalog({ Seed: 3 }).map((i, k) => ({ id: i.id, rank: k + 1 }));

  it("takes a ranked dish from EVERY category before any unranked one", () => {
    // One ranked dish per category, and each is that category's LAST in menu order — so if the
    // ranking only re-ordered buckets (the M131 behaviour) the first lap would still be
    // Noodles-3, Curries-3, Salads-3 and this test could not tell the two apart. What it can tell
    // apart is what comes NEXT: under selection, lap 2 is unranked; under ordering, lap 2 would be
    // whatever sorted second. Both agree here, so the DISCRIMINATING assertion is the one below.
    const { rowB } = buildStartHereRows(items, loved, ["Noodles-3", "Curries-3", "Salads-3"]);
    expect(rowB.slice(0, 3).map((i) => i.id)).toEqual(["Noodles-3", "Curries-3", "Salads-3"]);
  });

  it("THE DISCRIMINATOR — a ranked dish outranks every SECOND dish, once coverage is paid for", () => {
    // What separates selection from M131's ordering-only, now that coverage goes first. Noodles
    // holds two ranked dishes; Curries and Salads hold none. Round 1 gives all three one dish.
    // Round 2 then spends the rest on the ranking, so Noodles' SECOND (ranked) dish lands ahead of
    // any other category's second — which ordering-only could never do, because it would simply
    // lap the categories again and hand Curries its second first.
    const { rowB } = buildStartHereRows(items, loved, ["Noodles-3", "Noodles-2"]);
    expect(rowB.slice(0, 3).map((i) => i.id)).toEqual(["Noodles-3", "Curries-1", "Salads-1"]);
    expect(rowB[3]!.id).toBe("Noodles-2");
  });

  it("phase 2 keeps the coverage the caption promises — a category with NO ranked dish still appears", () => {
    const { rowB } = buildStartHereRows(items, loved, ["Noodles-3"]);
    const cats = new Set(rowB.map((i) => i.category));
    expect(cats).toContain("Curries");
    expect(cats).toContain("Salads");
  });

  it("never offers the same dish twice across the two phases", () => {
    const { rowB } = buildStartHereRows(items, loved, ["Noodles-3", "Curries-2"]);
    expect(new Set(rowB.map((i) => i.id)).size).toBe(rowB.length);
  });

  it("an empty ranking still fills the row — phase 1 finds nothing and phase 2 does all of it", () => {
    const { rowB } = buildStartHereRows(items, loved, []);
    expect(rowB.length).toBeGreaterThanOrEqual(3);
    expect(new Set(rowB.map((i) => i.category)).size).toBe(3);
  });

  it("row A's ranks pass through untouched, nulls included", () => {
    // soleRanks nulls a shared numeral upstream; this function must carry that decision, never
    // re-derive or repair it — a rank invented here would be a claim no data backs.
    const tied = catalog({ Seed: 3 }).map((i, k) => ({ id: i.id, rank: k === 0 ? 1 : null }));
    const { rowA } = buildStartHereRows(items, tied);
    expect(rowA.map((e) => e.rank)).toEqual([1, null, null]);
  });
});

describe("M133 — the ranking may not eat the 'everything' (the balance the two phases share)", () => {
  const items = [...catalog({ Seed: 3 }), ...catalog({ Noodles: 2, Curries: 2, Desserts: 2 })];
  const loved = catalog({ Seed: 3 }).map((i, k) => ({ id: i.id, rank: k + 1 }));

  it("no category gets a SECOND dish until every category has a first", () => {
    // The defect this pins, found by probing the first draft: phase 2 restarted its own lap count
    // at zero, so the category that placed a ranked dish in phase 1 was served again on phase 2's
    // first lap. With ["Curries-2"] ranked, row B opened Curries-2, Noodles-1, Curries-1 — two
    // Curries before Desserts appeared at all, in the row whose entire caption is "a little of
    // everything". The two phases now share one per-category counter.
    const { rowB } = buildStartHereRows(items, loved, ["Curries-2"]);
    const seen = new Map<string, number>();
    for (const i of rowB) {
      const n = (seen.get(i.category) ?? 0) + 1;
      seen.set(i.category, n);
      if (n < 2) continue;
      // The moment any category reaches 2, every category must already be at 1.
      expect([...seen.values()].filter((v) => v >= 1)).toHaveLength(3);
    }
  });

  it("CODEX round 2, P2 — a popular category may not eat the whole row", () => {
    // The finding, verbatim in behaviour: "When the remaining top-50 dishes can fill the 10-card
    // cap before phase 1 ends — for example, ten ranked dishes all belonging to Curries — this
    // call fills rowB, so the coverage phase immediately does nothing and 'A little of everything'
    // can contain only Curries." It was right. `laps` picks the LEAST-SERVED bucket that has an
    // ELIGIBLE dish, and a bucket with nothing ranked has none — so it is skipped, never waited
    // for, and an unbounded ranked round drains the cap into one category.
    const wide = [...catalog({ Seed: 3 }), ...catalog({ Curries: 12, Noodles: 2, Salads: 2 })];
    const allCurries = Array.from({ length: 10 }, (_, k) => `Curries-${k + 1}`);
    const { rowB } = buildStartHereRows(wide, loved, allCurries);
    expect(rowB).toHaveLength(10);
    // Every category still appears — that is the caption's whole promise.
    expect(new Set(rowB.map((i) => i.category))).toEqual(new Set(["Curries", "Noodles", "Salads"]));
    // …and the other two are served in round 1, before Curries takes a second.
    expect(new Set(rowB.slice(0, 3).map((i) => i.category))).toEqual(
      new Set(["Curries", "Noodles", "Salads"]),
    );
    // Popularity still gets everything coverage did not need: 8 of the 10 are ranked Curries.
    expect(rowB.filter((i) => i.category === "Curries")).toHaveLength(8);
  });
});
