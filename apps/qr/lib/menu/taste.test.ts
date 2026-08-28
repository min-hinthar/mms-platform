import { describe, expect, it } from "vitest";
import { surpriseMe, topUpToFloor, refillSurprise, TASTE_ROW_MIN, TASTE_ROW_MAX } from "./taste";

/**
 * W21 → M137 — the taste band's rules. The craving-matcher suites went with `CRAVINGS` and
 * `recommendByTaste` when the owner made surprise the section's only feature; what remains is the
 * draw, its bounds, and the two honesty rules that decide when a short row may be filled.
 */

const item = (category: string, tags: string[] = [], id = category) => ({ id, category, tags });

describe("surpriseMe — random picks that respect the exclusions, deterministic under a seeded rng", () => {
  const catalog = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}` }));

  it("never offers an excluded (already-hearted) item", () => {
    const picks = surpriseMe(catalog, new Set(["i0", "i2", "i4"]), 3, [], () => 0);
    expect(picks.map((p) => p.id).some((id) => ["i0", "i2", "i4"].includes(id))).toBe(false);
    expect(picks).toHaveLength(3);
  });

  it("asks for more than exists → returns what exists, no repeats", () => {
    const picks = surpriseMe(catalog, new Set(["i0", "i1", "i2", "i3"]), 3, [], () => 0.99);
    expect(new Set(picks.map((p) => p.id)).size).toBe(picks.length);
    expect(picks).toHaveLength(2);
  });
});

describe("M131 — the surprise draw comes from the ranked tier first", () => {
  const catalog = Array.from({ length: 6 }, (_, k) => item("Curries", [], `i${k}`));

  it("fills entirely from the ranked tier when it can", () => {
    const picks = surpriseMe(catalog, new Set(), 3, ["i3", "i4", "i5"], () => 0);
    expect(picks.map((p) => p.id).sort()).toEqual(["i3", "i4", "i5"]);
  });

  it("tops up from the rest rather than returning a short row", () => {
    // The ranked tier holds one eligible dish; the row still fills, from the unranked remainder.
    const picks = surpriseMe(catalog, new Set(["i1", "i2"]), 3, ["i0"], () => 0);
    expect(picks).toHaveLength(3);
    expect(picks[0]!.id).toBe("i0");
    expect(picks.slice(1).every((p) => !["i0", "i1", "i2"].includes(p.id))).toBe(true);
  });

  it("never offers a hearted dish, ranked or not", () => {
    const picks = surpriseMe(catalog, new Set(["i0", "i1", "i2"]), 3, ["i0", "i1"], () => 0);
    expect(picks.some((p) => ["i0", "i1", "i2"].includes(p.id))).toBe(false);
  });

  it("no ranking is a NO-OP — one uniform shuffle over everything, as before", () => {
    expect(surpriseMe(catalog, new Set(), 3, [], () => 0).map((p) => p.id)).toEqual(
      surpriseMe(catalog, new Set(), 3, undefined, () => 0).map((p) => p.id),
    );
  });
});

describe("M133 — the row bounds, and the honest way to reach the floor", () => {
  it("the owner's numbers, pinned as literals — at least 4, at most 8", () => {
    // A product decision, not an implementation detail: "all explore your burmese taste buds
    // suggestions (including surprise your taste buds) should offer at least 4 and at most 7 menu
    // items", then M135: "should offer at most 8 menu items and displayed as one row". Nothing else
    // in this file can catch a change to either bound, because every other assertion reads the
    // constant it is trying to verify.
    expect(TASTE_ROW_MIN).toBe(4);
    expect(TASTE_ROW_MAX).toBe(8);
  });

  it("the bounds are a real range, not a single number", () => {
    // A degenerate MIN >= MAX would make every top-up either impossible or unbounded, and both
    // failures are silent: the row just comes out the wrong length. Pin the relationship itself.
    expect(TASTE_ROW_MIN).toBeLessThan(TASTE_ROW_MAX);
    expect(TASTE_ROW_MIN).toBeGreaterThan(0);
  });

  it("surpriseMe can now fill a whole row, not three cards", () => {
    const catalog = Array.from({ length: 12 }, (_, k) => item("Curries", [], `i${k}`));
    expect(surpriseMe(catalog, new Set(), TASTE_ROW_MAX, [], () => 0)).toHaveLength(TASTE_ROW_MAX);
  });

  describe("topUpToFloor", () => {
    const pool = Array.from({ length: 8 }, (_, k) => ({ id: `p${k}` }));

    it("adds nothing to a row already at the floor", () => {
      expect(topUpToFloor(pool.slice(0, TASTE_ROW_MIN), pool, [])).toEqual([]);
    });

    it("adds nothing to a row ABOVE the floor either", () => {
      expect(topUpToFloor(pool.slice(0, TASTE_ROW_MIN + 2), pool, [])).toEqual([]);
    });

    it("fills exactly the shortfall — never overshoots the floor", () => {
      expect(topUpToFloor(pool.slice(0, 1), pool, [])).toHaveLength(TASTE_ROW_MIN - 1);
    });

    it("never re-offers a dish the row already holds", () => {
      const row = [pool[0]!, pool[1]!];
      const add = topUpToFloor(row, pool, []);
      expect(add.some((i) => i.id === "p0" || i.id === "p1")).toBe(false);
    });

    it("draws the most-ordered dishes FIRST", () => {
      // p7 and p6 sit last in menu order, so taking them proves the ranking drove the choice.
      expect(topUpToFloor([pool[0]!, pool[1]!], pool, ["p7", "p6"]).map((i) => i.id)).toEqual([
        "p7",
        "p6",
      ]);
    });

    it("falls back to menu order when the ranking runs out — a preference, not a filter", () => {
      // One ranked dish, two slots to fill: the ranked one leads, the rest comes from menu order
      // rather than the row staying short. This is the whole reason it is not a filter.
      expect(topUpToFloor([pool[0]!, pool[1]!], pool, ["p5"]).map((i) => i.id)).toEqual([
        "p5",
        "p2",
      ]);
    });

    it("cannot invent dishes: an exhausted pool returns what exists", () => {
      const tiny = pool.slice(0, 3);
      expect(topUpToFloor(tiny.slice(0, 1), tiny, [])).toHaveLength(2);
    });
  });
});

describe("refillSurprise — Codex round 2, P2: a partial row is topped up, an empty one is not", () => {
  const pool = Array.from({ length: 10 }, (_, k) => ({ id: `p${k}` }));

  it("THE FINDING — three survivors of a seven-card draw come back at the floor", () => {
    // "Draw seven surprises and then enable a dietary filter … `liveSurprise` can retain only 1–3
    // cards even when the filtered pool contains enough other eligible, non-hearted dishes to
    // satisfy the new four-card minimum." Verified against source before fixing: the branch
    // rendered that partial snapshot directly and only treated ZERO as empty.
    const alive = pool.slice(0, 3);
    expect(refillSurprise(alive, pool, new Set())).toHaveLength(TASTE_ROW_MIN);
  });

  it("keeps the cards the diner is already looking at, in place", () => {
    // A fresh draw would be the lazy fix and it throws away the row for a filter toggle.
    const alive = [pool[4]!, pool[7]!];
    expect(refillSurprise(alive, pool, new Set()).slice(0, 2)).toEqual(alive);
  });

  it("an EMPTY row is never padded — its emptiness is the answer", () => {
    expect(refillSurprise([], pool, new Set())).toEqual([]);
  });

  it("never tops up with a hearted dish — surpriseMe's contract survives the refill", () => {
    const hearted = new Set(["p1", "p2", "p3", "p4"]);
    const out = refillSurprise([pool[0]!], pool, hearted);
    expect(out.some((i) => hearted.has(i.id))).toBe(false);
  });

  it("prefers the most-ordered dishes for the top-up", () => {
    expect(
      refillSurprise([pool[0]!], pool, new Set(), ["p9", "p8", "p7"]).map((i) => i.id),
    ).toEqual(["p0", "p9", "p8", "p7"]);
  });

  it("is DETERMINISTIC — the same inputs give the same row, twice", () => {
    // It runs inside a useMemo; a random top-up would reshuffle the tail on every render.
    const alive = [pool[0]!, pool[1]!];
    expect(refillSurprise(alive, pool, new Set(), ["p6"])).toEqual(
      refillSurprise(alive, pool, new Set(), ["p6"]),
    );
  });

  it("cannot invent dishes: a nearly-exhausted pool returns what exists", () => {
    const tiny = pool.slice(0, 2);
    expect(refillSurprise([tiny[0]!], tiny, new Set())).toHaveLength(2);
  });
});
