import { describe, expect, it } from "vitest";
import {
  categoryShown,
  cleanText,
  dishChanges,
  dishUpdate,
  fitWithin,
  moveCategory,
  nextSortOrder,
  PHOTO_MAX_BYTES,
  photoPath,
  photoVerdict,
  slugify,
  SLUG_MAX,
  uniqueSlug,
  type DishFields,
} from "./menu-studio-rules";

/** Menu studio (owner, 2026-10-24) — each rule a value here, and a `menu-studio/*` mutant. */

describe("slugify · uniqueSlug", () => {
  it("lowercase ASCII words joined by single dashes, accents folded", () => {
    expect(slugify("  Mohinga — Fish  Noodle Soup! ")).toBe("mohinga-fish-noodle-soup");
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
  });
  it("a name with no Latin letters slugs to the fallback, never empty (`menu-studio/slug-empty`)", () => {
    expect(slugify("မုန့်ဟင်းခါး")).toBe("dish");
    expect(slugify("မုန့်", "category")).toBe("category");
  });
  it("is cut at SLUG_MAX with no trailing dash", () => {
    const s = slugify(`${"a".repeat(SLUG_MAX - 1)} b c`);
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(s.endsWith("-")).toBe(false);
  });
  it("the first free of base, base-2, base-3 (`menu-studio/slug-collides`)", () => {
    expect(uniqueSlug("tea", new Set())).toBe("tea");
    expect(uniqueSlug("tea", new Set(["tea"]))).toBe("tea-2");
    expect(uniqueSlug("tea", new Set(["tea", "tea-2"]))).toBe("tea-3");
  });
});

describe("cleanText", () => {
  it("collapses spaces, keeps line breaks, blank is null", () => {
    expect(cleanText("  Rich   broth \n\n  with  fish ")).toBe("Rich broth\nwith fish");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(null)).toBeNull();
  });
});

const dish: DishFields = {
  nameEn: "Mohinga",
  nameMy: null,
  descriptionEn: null,
  descriptionMy: null,
  categoryId: "c1",
  taxCategory: "hot_prepared",
  isActive: true,
};

describe("dishChanges · dishUpdate", () => {
  it("nothing changed is no change (`menu-studio/changes-always`)", () => {
    expect(dishChanges(dish, { ...dish })).toEqual([]);
  });
  it("each changed field once, by its column, old → new as text", () => {
    const after = { ...dish, nameMy: "မုန့်ဟင်းခါး", isActive: false, categoryId: "c2" };
    expect(dishChanges(dish, after)).toEqual([
      { field: "name_my", oldValue: null, newValue: "မုန့်ဟင်းခါး" },
      { field: "category_id", oldValue: "c1", newValue: "c2" },
      { field: "is_active", oldValue: "true", newValue: "false" },
    ]);
  });
  it("the update writes ONLY the changed columns — never a full row that reverts a concurrent edit (`menu-studio/update-full-row`)", () => {
    const after = { ...dish, nameEn: "Mohinga (large)" };
    expect(dishUpdate(after, dishChanges(dish, after))).toEqual({ name_en: "Mohinga (large)" });
  });
});

describe("photoVerdict · photoPath · fitWithin", () => {
  it("a JPEG, PNG or WebP under the bucket's limit; anything else is named (`menu-studio/photo-any-type`)", () => {
    expect(photoVerdict({ type: "image/jpeg", size: 300_000 })).toBe("ok");
    expect(photoVerdict({ type: "image/webp", size: PHOTO_MAX_BYTES })).toBe("ok");
    expect(photoVerdict({ type: "image/heic", size: 300_000 })).toBe("type");
    expect(photoVerdict({ type: "text/html", size: 300 })).toBe("type");
    expect(photoVerdict({ type: "image/jpeg", size: PHOTO_MAX_BYTES + 1 })).toBe("size");
    expect(photoVerdict({ type: "image/jpeg", size: 0 })).toBe("empty");
  });
  it("one folder per dish, a fresh name per upload, the extension of its type", () => {
    expect(photoPath("d1", "image/jpeg", 1700000000000)).toBe("d1/1700000000000.jpg");
    expect(photoPath("d1", "image/png", 5)).toBe("d1/5.png");
    expect(photoPath("d1", "image/webp", 5)).toBe("d1/5.webp");
  });
  it("the longest edge to the max, aspect kept, never enlarged (`menu-studio/fit-enlarges`)", () => {
    expect(fitWithin(4032, 3024)).toEqual({ w: 1600, h: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ w: 1200, h: 1600 });
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
  });
});

describe("categories", () => {
  const cats = [
    { id: "a", sortOrder: 10 },
    { id: "b", sortOrder: 20 },
    { id: "c", sortOrder: 30 },
  ];
  it("a new category goes last, ten past the highest", () => {
    expect(nextSortOrder(cats)).toBe(40);
    expect(nextSortOrder([])).toBe(10);
  });
  it("a move swaps with the neighbour in the menu's order (`menu-studio/move-wrong-neighbour`)", () => {
    expect(moveCategory(cats, "b", "up")).toEqual([
      { id: "b", sortOrder: 10 },
      { id: "a", sortOrder: 20 },
    ]);
    expect(moveCategory(cats, "b", "down")).toEqual([
      { id: "b", sortOrder: 30 },
      { id: "c", sortOrder: 20 },
    ]);
    // Out of input order: the menu's order decides the neighbour.
    expect(moveCategory([cats[2]!, cats[0]!, cats[1]!], "c", "up")?.[1].id).toBe("b");
  });
  it("at an edge, or for an unknown id, nothing to write", () => {
    expect(moveCategory(cats, "a", "up")).toBeNull();
    expect(moveCategory(cats, "c", "down")).toBeNull();
    expect(moveCategory(cats, "z", "up")).toBeNull();
  });
  it("a tie is separated so the move is real", () => {
    const tied = [
      { id: "a", sortOrder: 10 },
      { id: "b", sortOrder: 10 },
    ];
    const pair = moveCategory(tied, "b", "up")!;
    expect(pair[0].sortOrder).toBeLessThan(pair[1].sortOrder);
  });
  it("a hidden category hides; a missing read or flag shows (`menu-studio/hidden-shown`)", () => {
    expect(categoryShown({ is_active: false })).toBe(false);
    expect(categoryShown({ is_active: true })).toBe(true);
    expect(categoryShown(null)).toBe(true);
    expect(categoryShown({})).toBe(true);
  });
});
