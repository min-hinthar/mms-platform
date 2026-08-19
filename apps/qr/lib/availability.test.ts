import { describe, it, expect } from "vitest";
import {
  pickUnavailableNames,
  foodMenuIds,
  type CartLineish,
  type CatalogItemish,
} from "./availability";

/**
 * W23a — the availability gate that stands between an 86'd dish and a charge.
 *
 * This is the rule the owner's question was really about. Before it, `menu_items.is_sold_out` was
 * read by ~15 surfaces and written by nothing, and neither `priceItem` nor `create-intent` selected
 * the column at all — so a sold-out dish could be added, priced and charged with no refusal anywhere,
 * and the only remedy left was a refund.
 */
const line = (o: Partial<CartLineish> & { menu_item_id: string | null }): CartLineish => ({
  name: "Line",
  state: "draft",
  fulfillment: "togo",
  ...o,
});
const item = (o: Partial<CatalogItemish> & { id: string }): CatalogItemish => ({
  name_en: "Dish",
  is_sold_out: false,
  is_active: true,
  ...o,
});

describe("pickUnavailableNames", () => {
  it("says nothing when the whole basket is still sellable", () => {
    expect(
      pickUnavailableNames(
        [line({ menu_item_id: "a" }), line({ menu_item_id: "b" })],
        [item({ id: "a" }), item({ id: "b" })],
      ),
    ).toEqual([]);
  });

  it("names a dish that sold out while the cart sat open", () => {
    expect(
      pickUnavailableNames(
        [line({ menu_item_id: "a" }), line({ menu_item_id: "b" })],
        [item({ id: "a", name_en: "Mohinga", is_sold_out: true }), item({ id: "b" })],
      ),
    ).toEqual(["Mohinga"]);
  });

  it("names a DELISTED dish too — a stale phone can still hold one", () => {
    // The diner menu filters `.eq("is_active", true)` at query time, but that is a fact about a page
    // that may be minutes old.
    expect(
      pickUnavailableNames(
        [line({ menu_item_id: "a" })],
        [item({ id: "a", name_en: "Retired Curry", is_active: false })],
      ),
    ).toEqual(["Retired Curry"]);
  });

  it("reports one dish once, however many lines carry it", () => {
    expect(
      pickUnavailableNames(
        [line({ menu_item_id: "a" }), line({ menu_item_id: "a" }), line({ menu_item_id: "a" })],
        [item({ id: "a", name_en: "Tea Leaf Salad", is_sold_out: true })],
      ),
    ).toEqual(["Tea Leaf Salad"]);
  });

  it("uses the CATALOG name, not the line's stamped snapshot", () => {
    // The diner is about to go looking for this dish on the menu in front of them; the line's name
    // may predate a rename.
    expect(
      pickUnavailableNames(
        [line({ menu_item_id: "a", name: "Old Name" })],
        [item({ id: "a", name_en: "New Name", is_sold_out: true })],
      ),
    ).toEqual(["New Name"]);
  });

  it("ignores a VOIDED line — it is already out of the charge and out of the kitchen", () => {
    expect(
      pickUnavailableNames(
        [line({ menu_item_id: "a", state: "voided" })],
        [item({ id: "a", name_en: "Mohinga", is_sold_out: true })],
      ),
    ).toEqual([]);
  });

  it.each(["fired", "in_progress", "served"])(
    "ignores a %s line — the kitchen already has it, and the diner cannot remove it",
    (state) => {
      // The remedy constraint, not a kitchen one: `permissions.ts` lets a diner mutate a DRAFT line
      // and nothing else, so blocking here would say "remove it to keep going" about a line they
      // cannot remove — a dine-in table that just ate the last portion could not pay at all. Same
      // fixture as the blocking case except `state`, so a gate that widens past draft goes red here.
      expect(
        pickUnavailableNames(
          [line({ menu_item_id: "a", state })],
          [item({ id: "a", name_en: "Mohinga", is_sold_out: true })],
        ),
      ).toEqual([]);
    },
  );

  it("blocks a dish that has vanished from the catalog, named from the line", () => {
    // `qr_cart_items.menu_item_id` is a SOFT ref (text, no FK), so a deleted menu row leaves a
    // dangling line. A dish with no catalog row cannot be made either — and the line's stamped name
    // is the only name left to show.
    expect(pickUnavailableNames([line({ menu_item_id: "a", name: "Ghost Curry" })], [])).toEqual([
      "Ghost Curry",
    ]);
  });

  it("ignores GROCERY lines — the shopper is already holding the item", () => {
    // A grocery line's togo_status is an exit-pass check, not a kitchen bag; there is nothing for the
    // kitchen to be out of. Same fixture as the blocking case except `fulfillment`.
    expect(
      pickUnavailableNames(
        [line({ menu_item_id: "a", fulfillment: "grocery" })],
        [item({ id: "a", name_en: "Rice", is_sold_out: true })],
      ),
    ).toEqual([]);
  });

  it("covers dine-in as well as to-go", () => {
    expect(
      pickUnavailableNames(
        [line({ menu_item_id: "a", fulfillment: "dinein" })],
        [item({ id: "a", name_en: "Mohinga", is_sold_out: true })],
      ),
    ).toEqual(["Mohinga"]);
  });

  it("lists several unavailable dishes in cart order", () => {
    expect(
      pickUnavailableNames(
        [line({ menu_item_id: "b" }), line({ menu_item_id: "a" })],
        [
          item({ id: "a", name_en: "Alpha", is_sold_out: true }),
          item({ id: "b", name_en: "Beta", is_sold_out: true }),
        ],
      ),
    ).toEqual(["Beta", "Alpha"]);
  });
});

describe("foodMenuIds", () => {
  it("asks the catalog only about live food lines, once each", () => {
    expect(
      foodMenuIds([
        line({ menu_item_id: "a" }),
        line({ menu_item_id: "a" }),
        line({ menu_item_id: "b", fulfillment: "dinein" }),
        line({ menu_item_id: "c", fulfillment: "grocery" }),
        line({ menu_item_id: "d", state: "voided" }),
        line({ menu_item_id: "e", state: "served" }),
        line({ menu_item_id: null }),
      ]),
    ).toEqual(["a", "b"]);
  });

  it("asks nothing of the catalog for a grocery-only basket", () => {
    expect(foodMenuIds([line({ menu_item_id: "a", fulfillment: "grocery" })])).toEqual([]);
  });
});
