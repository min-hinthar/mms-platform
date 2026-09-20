import { describe, expect, it } from "vitest";
import { browseRows } from "./menu-browse";

const rows = [
  { id: "a", nameEn: "Mohinga", nameMy: "မုန့်ဟင်းခါး", category: "Soups", soldOut: false },
  { id: "b", nameEn: "Tea Leaf Salad", nameMy: null, category: "Salads", soldOut: true },
  { id: "c", nameEn: "Shan Noodles", nameMy: "ရှမ်းခေါက်ဆွဲ", category: "Noodles", soldOut: true },
];
const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe("browseRows — the menu list's one filter", () => {
  it("an empty query shows everything; the chip narrows to what is off the menu", () => {
    expect(ids(browseRows(rows, "", false))).toEqual(["a", "b", "c"]);
    // MUTATION: drop `(!soldOutOnly || i.soldOut) &&` — the chip shows all three; red.
    expect(ids(browseRows(rows, "  ", true))).toEqual(["b", "c"]);
  });

  it("matches the English name and the category case-blind, the Burmese name as typed", () => {
    expect(ids(browseRows(rows, "mohin", false))).toEqual(["a"]);
    expect(ids(browseRows(rows, "SALAD", false))).toEqual(["b"]);
    expect(ids(browseRows(rows, "ရှမ်း", false))).toEqual(["c"]);
    expect(ids(browseRows(rows, "ရှမ်း ", false))).toEqual(["c"]); // trimmed before the Burmese match
  });

  it("the chip and the needle compose", () => {
    expect(ids(browseRows(rows, "noodle", true))).toEqual(["c"]);
    expect(ids(browseRows(rows, "mohinga", true))).toEqual([]);
  });
});
