import { describe, expect, it } from "vitest";
import { POS_POPULARITY, POS_BADGE_MAX, NOT_PROMOTED_SLUGS, posPopularIds } from "./posPopular";

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
    //
    // From the PROMOTED order, not the raw one: M136 drops `NOT_PROMOTED_SLUGS` from what this
    // function returns, and seeding from `POS_POPULARITY[0]` picked the excluded Rice — the mapper
    // then answered with one id and this assertion went red for the right reason. Deriving the
    // fixture the same way the code does keeps it measuring ORDER rather than membership.
    const promoted = POS_POPULARITY.filter((p) => !NOT_PROMOTED_SLUGS.includes(p.slug));
    const [first, second] = [promoted[0]!.slug, promoted[1]!.slug];
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

describe("NOT_PROMOTED_SLUGS — what the till sells is not automatically what we recommend", () => {
  it("keeps Rice out of the promoted order entirely (M136, owner's call)", () => {
    // Rice outsells every real dish at 2052 because it rides along with them. It is still on the
    // menu and still orderable — it is simply never the answer to "what do people order here?".
    const menu = POS_POPULARITY.map((p) => ({ id: `id-${p.slug}`, slug: p.slug }));
    const ids = posPopularIds(menu);
    expect(ids).not.toContain("id-rice");
    // Not just off the badge — off the ORDER, so row A, the round-robin and the surprise draw all
    // stop preferring it. The ask was about being the top seller, not about one label.
    expect(ids.slice(0, POS_BADGE_MAX)).not.toContain("id-rice");
  });

  it("promotes a real dish first — the whole point of the exclusion", () => {
    const menu = POS_POPULARITY.map((p) => ({ id: `id-${p.slug}`, slug: p.slug }));
    // Computed from the data, not transcribed: the most-sold slug that is not excluded.
    const expected = POS_POPULARITY.find((p) => !NOT_PROMOTED_SLUGS.includes(p.slug))!.slug;
    expect(posPopularIds(menu)[0]).toBe(`id-${expected}`);
    expect(expected).not.toBe("rice");
  });

  it("drops ONLY what is named — a category rule would take the deliberate orders with it", () => {
    // Coconut Rice is a `Sides` row and Burmese Milk Tea / Faluda are `Drinks`; all three are things
    // a diner chooses on purpose. A `category === "Sides"` heuristic would silently swallow them and
    // keep swallowing whatever lands there next. The list is one slug because one was named.
    expect([...NOT_PROMOTED_SLUGS]).toEqual(["rice"]);
    const menu = POS_POPULARITY.map((p) => ({ id: `id-${p.slug}`, slug: p.slug }));
    const ids = posPopularIds(menu);
    for (const slug of ["coconut-rice", "burmese-milk-tea", "faluda"])
      expect(ids).toContain(`id-${slug}`);
  });

  it("leaves the DATA file alone — the till order is the restaurant's, not ours to edit", () => {
    expect(POS_POPULARITY.some((p) => p.slug === "rice")).toBe(true);
  });
});
