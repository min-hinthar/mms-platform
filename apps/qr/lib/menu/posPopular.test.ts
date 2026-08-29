import { describe, expect, it } from "vitest";
import { POS_POPULARITY, POS_BADGE_MAX, posPopularIds } from "./posPopular";

/**
 * M135 — the owner's PayPal/Zettle POS export, as the app reads it. `pos-popularity.json` is
 * GENERATED (scripts/gen-menu-reference.mjs) and `pnpm check:docs` fails if it drifts from the
 * export, so these tests guard the CONTRACT the app depends on, not the numbers themselves.
 */
describe("POS_POPULARITY — the generated sales order", () => {
  it("is non-empty and never increases in units", () => {
    // A silently-empty file would degrade every consumer to "no preference" and nothing would fail,
    // which is exactly the shape that makes a broken data pipeline invisible.
    // NON-INCREASING, not "strictly descending" — this file legitimately carries ties (7 units
    // values are shared by two dishes each, measured), and a strict assertion would be red on
    // honest data. The generator breaks those ties by slug so the order is still total and stable.
    expect(POS_POPULARITY.length).toBeGreaterThan(0);
    const qtys = POS_POPULARITY.map((p) => p.qty);
    expect([...qtys].sort((a, b) => b - a)).toEqual(qtys);
  });

  it("carries no zero or negative units — an unsold dish is not a popularity signal", () => {
    expect(POS_POPULARITY.every((p) => p.qty > 0)).toBe(true);
  });

  it("names every dish exactly once", () => {
    // A slug appearing twice would let one dish outrank itself and double-count in every consumer.
    expect(new Set(POS_POPULARITY.map((p) => p.slug)).size).toBe(POS_POPULARITY.length);
  });

  it("keeps the badge bound well under the list — a badge most dishes wear is not a badge", () => {
    expect(POS_BADGE_MAX).toBeLessThan(POS_POPULARITY.length);
    expect(POS_BADGE_MAX).toBe(12);
  });
});

describe("posPopularIds — mapping the sales order onto the menu being rendered", () => {
  const menu = [
    { id: "id-a", slug: "alpha" },
    { id: "id-b", slug: "beta" },
    { id: "id-c", slug: "gamma" },
  ];
  const order = (slugs: string[]) =>
    posPopularIds(menu.filter((m) => slugs.includes(m.slug))).length;

  it("returns ids in POS order, not menu order", () => {
    // Built from the real list so the assertion cannot pass on a fixture the code never sees: take
    // two real slugs and feed them to the mapper in the REVERSE of their POS order.
    const [first, second] = [POS_POPULARITY[0]!.slug, POS_POPULARITY[1]!.slug];
    const ids = posPopularIds([
      { id: "second", slug: second },
      { id: "first", slug: first },
    ]);
    expect(ids).toEqual(["first", "second"]);
  });

  it("drops dishes this menu does not carry", () => {
    expect(posPopularIds([{ id: "x", slug: "not-a-real-slug" }])).toEqual([]);
  });

  it("an item with no slug is unranked, never a crash", () => {
    expect(posPopularIds([{ id: "x", slug: null }, { id: "y" }])).toEqual([]);
    expect(order([])).toBe(0);
  });

  it("an empty menu is an empty order", () => {
    expect(posPopularIds([])).toEqual([]);
  });

  it("the real export reaches most of the real catalog", () => {
    // A floor, not a fixed count: the join is by Burmese name and the catalog grows. If a change to
    // either input drops coverage off a cliff, the suggestions quietly stop being data-backed and
    // nothing else in the repo would notice.
    expect(POS_POPULARITY.length).toBeGreaterThanOrEqual(60);
  });
});
