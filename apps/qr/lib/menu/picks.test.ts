import { describe, expect, it } from "vitest";
import { picksLenses, resolveLens, surpriseEligible } from "./picks";

describe("picksLenses — the picks row offers only lenses that have something to show", () => {
  it("leads with the diner's favorites, then most ordered, then surprise", () => {
    // MUTATION: push `popular` before `favorites` — a returning diner's shortlist loses the first
    // slot to our guidance (J5's precedence); red.
    expect(picksLenses({ favorites: 2, popular: 8, pool: 60 })).toEqual([
      "favorites",
      "popular",
      "surprise",
    ]);
  });

  it("never offers an empty lens", () => {
    // MUTATION: drop the `> 0` guard on favorites — a first-timer sees a pill that opens nothing; red.
    expect(picksLenses({ favorites: 0, popular: 8, pool: 60 })).toEqual(["popular", "surprise"]);
    expect(picksLenses({ favorites: 0, popular: 0, pool: 3 })).toEqual(["surprise"]);
    expect(picksLenses({ favorites: 0, popular: 0, pool: 0 })).toEqual([]);
  });
});

describe("resolveLens — the row never sits on a lens with nothing to show", () => {
  it("keeps the diner's choice while it is still offered", () => {
    // MUTATION: always return offered[0] — tapping Most ordered snaps back to Favorites; red.
    expect(resolveLens("popular", ["favorites", "popular", "surprise"])).toBe("popular");
  });

  it("falls back to the first offered lens when a filter empties the chosen one", () => {
    // MUTATION: return `chosen` unconditionally — a Vegan filter that empties Favorites leaves the
    // row on an empty lens with no pill lit; red.
    expect(resolveLens("favorites", ["popular", "surprise"])).toBe("popular");
    expect(resolveLens(null, ["surprise"])).toBe("surprise");
    expect(resolveLens("popular", [])).toBeNull();
  });
});

describe("surpriseEligible — what a draw could actually produce", () => {
  it("excludes hearted dishes, exactly as the draw does", () => {
    // MUTATION: count the whole pool — a diner who hearted every fitting dish is offered a Surprise
    // that can only open an empty row; red.
    const pool = [{ id: "a" }, { id: "b" }];
    expect(surpriseEligible(pool, new Set(["a", "b"]))).toBe(0);
    expect(surpriseEligible(pool, new Set(["a"]))).toBe(1);
    expect(
      picksLenses({ favorites: 2, popular: 0, pool: surpriseEligible(pool, new Set(["a", "b"])) }),
    ).toEqual(["favorites"]);
  });
});
