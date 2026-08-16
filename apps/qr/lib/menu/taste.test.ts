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
    const picks = surpriseMe(catalog, new Set(["i0", "i2", "i4"]), 3, () => 0);
    expect(picks.map((p) => p.id).some((id) => ["i0", "i2", "i4"].includes(id))).toBe(false);
    expect(picks).toHaveLength(3);
  });

  it("asks for more than exists → returns what exists, no repeats", () => {
    const picks = surpriseMe(catalog, new Set(["i0", "i1", "i2", "i3"]), 3, () => 0.99);
    expect(new Set(picks.map((p) => p.id)).size).toBe(picks.length);
    expect(picks).toHaveLength(2);
  });
});
