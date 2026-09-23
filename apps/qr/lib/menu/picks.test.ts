import { describe, expect, it } from "vitest";
import { picksLenses } from "./picks";

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
