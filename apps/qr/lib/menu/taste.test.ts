import { describe, expect, it } from "vitest";
import { CRAVINGS, recommendByTaste, surpriseMe } from "./taste";

/** W21 — the taste picker's honesty rules: every recommendation traces to a real category/tag. */

const item = (category: string, tags: string[] = [], id = category) => ({ id, category, tags });

describe("craving rules — each chip maps to real data", () => {
  const by = Object.fromEntries(CRAVINGS.map((c) => [c.id, c]));

  it("category chips match by KEYWORD, so a rename doesn't kill them", () => {
    expect(by.noodles!.matches(item("Rice / Noodles / Soups"))).toBe(true);
    expect(by.curry!.matches(item("Curries (A la Carte)"))).toBe(true);
    expect(by.curry!.matches(item("Seafood Curries"))).toBe(true);
    expect(by.seafood!.matches(item("Seafood Curries"))).toBe(true);
    expect(by.fresh!.matches(item("Appetizers / Salads"))).toBe(true);
    expect(by.fresh!.matches(item("Vegetables"))).toBe(true);
    expect(by.breakfast!.matches(item("All-Day Breakfast"))).toBe(true);
    expect(by.sweet!.matches(item("Desserts"))).toBe(true);
    expect(by.sweet!.matches(item("Drinks"))).toBe(false); // a drink is not a promised dessert
  });

  it("tag chips reuse the menu's own declarations", () => {
    expect(by.spicy!.matches(item("Sides", ["spicy"]))).toBe(true);
    // spicy_optional is fine to include: the kitchen turns the heat UP on request — offering a
    // milder-by-default dish under "Bring the heat" steers nobody into an allergen or a diet break.
    expect(by.spicy!.matches(item("Sides", ["spicy_optional"]))).toBe(true);
    expect(by.spicy!.matches(item("Sides"))).toBe(false);
    expect(by.plant!.matches(item("Sides", ["vegan"]))).toBe(true);
    expect(by.plant!.matches(item("Sides", ["vegetarian"]))).toBe(true);
    expect(by.plant!.matches(item("Sides", ["popular"]))).toBe(false);
  });

  it("Plant-based EXCLUDES vegan-optional — the DEFAULT prep is not plant-based (Codex P1)", () => {
    // The dietary predicate's own rule (lib/menu/dietary.ts): "vegan on request" means a VARIANT
    // exists — Everything Salad's default ships with shrimp powder. A 🌱 card would steer a diner
    // into animal products under a plant-based claim; the fail-safe rule owns this call.
    expect(by.plant!.matches(item("Sides", ["vegan-optional"]))).toBe(false);
  });
});

describe("recommendByTaste — only matches, ranked by match count then popularity", () => {
  const catalog = [
    item("Curries (A la Carte)", ["spicy"], "spicy-curry"),
    item("Curries (A la Carte)", [], "plain-curry"),
    item("Curries (A la Carte)", ["popular"], "popular-curry"),
    item("Desserts", [], "dessert"),
  ];

  it("no picks → no recommendations (never a filler row)", () => {
    expect(recommendByTaste(catalog, [])).toEqual([]);
  });

  it("non-matching items never appear, however few matches there are", () => {
    const r = recommendByTaste(catalog, ["sweet"]);
    expect(r.map((e) => e.item.id)).toEqual(["dessert"]);
  });

  it("more matched cravings ranks first; popular breaks the tie", () => {
    const r = recommendByTaste(catalog, ["curry", "spicy"]);
    expect(r[0]!.item.id).toBe("spicy-curry"); // 2 matches
    expect(r[1]!.item.id).toBe("popular-curry"); // 1 match, popular
    expect(r[2]!.item.id).toBe("plain-curry");
  });

  it("says WHY — the matched cravings ride along", () => {
    const r = recommendByTaste(catalog, ["curry", "spicy"]);
    expect(r[0]!.matched.map((c) => c.id).sort()).toEqual(["curry", "spicy"]);
  });

  it("caps at 8 — a row, not a second menu", () => {
    const many = Array.from({ length: 20 }, (_, i) => item("Curries", [], `c${i}`));
    expect(recommendByTaste(many, ["curry"])).toHaveLength(8);
  });
});

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

describe("M131 — the ranking prefers what tables order, and never outranks the match itself", () => {
  const catalog = [
    item("Curries (A la Carte)", [], "cold"),
    item("Curries (A la Carte)", [], "hot"),
    item("Curries (A la Carte)", ["spicy"], "both"),
  ];

  it("breaks TIES toward the most-ordered dish", () => {
    const r = recommendByTaste(catalog, ["curry"], ["hot", "cold"]);
    expect(r.map((e) => e.item.id)).toEqual(["hot", "cold", "both"]);
  });

  it("but the MATCH COUNT still wins — a stronger reason outranks a more popular dish", () => {
    // `both` matches two cravings and is ranked LAST; it must still lead, because the card's own
    // "why" line reads out the reason that earned it the place.
    const r = recommendByTaste(catalog, ["curry", "spicy"], ["hot", "cold"]);
    expect(r[0]!.item.id).toBe("both");
    expect(r[0]!.matched).toHaveLength(2);
  });

  it("an empty ranking leaves the pre-M131 order untouched", () => {
    expect(recommendByTaste(catalog, ["curry"], []).map((e) => e.item.id)).toEqual(
      recommendByTaste(catalog, ["curry"]).map((e) => e.item.id),
    );
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
