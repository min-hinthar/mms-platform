import { describe, it, expect } from "vitest";
import {
  dishUnavailable,
  itemSellable,
  pickUnavailable,
  pickUnavailableNames,
  foodMenuIds,
  sendBlockingDishes,
  type CartLineish,
  type CatalogItemish,
} from "./availability";
import { CUSTOM_ITEM_PREFIX } from "./custom-item";

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

describe("pickUnavailable — the ids the manual-capture path acts on (W23c)", () => {
  it("carries the id alongside the name, so the void can target the line", () => {
    expect(
      pickUnavailable(
        [line({ menu_item_id: "a" }), line({ menu_item_id: "b" })],
        [item({ id: "a", name_en: "Mohinga", is_sold_out: true }), item({ id: "b" })],
      ),
    ).toEqual([{ id: "a", name: "Mohinga", why: "sold_out" }]);
  });

  it("is the SAME verdict pickUnavailableNames projects — one rule, not two", () => {
    // Two functions deciding "is this sellable?" would eventually disagree, and the surface they
    // would disagree on is a charge: the gate would refuse a basket the capture path was happy to
    // void, or worse, the other way round.
    const lines = [line({ menu_item_id: "a" }), line({ menu_item_id: "b", fulfillment: "dinein" })];
    const items = [
      item({ id: "a", name_en: "Alpha", is_sold_out: true }),
      item({ id: "b", name_en: "Beta", is_active: false }),
    ];
    expect(pickUnavailable(lines, items).map((u) => u.name)).toEqual(
      pickUnavailableNames(lines, items),
    );
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

  it("never asks the catalog about a custom item, and never calls one gone (OA4 · `availability/custom-item-asked`)", () => {
    const custom = `${CUSTOM_ITEM_PREFIX}6f1c2d3e-0000-4000-8000-000000000001`;
    const lines = [
      line({ menu_item_id: custom, name: "Birthday cake" }),
      line({ menu_item_id: custom, fulfillment: "dinein", name: "Birthday cake" }),
      line({ menu_item_id: "a" }),
    ];
    expect(foodMenuIds(lines)).toEqual(["a"]);
    expect(pickUnavailable(lines, [item({ id: "a" })])).toEqual([]);
    expect(sendBlockingDishes(lines, [item({ id: "a" })])).toEqual([]);
  });
});

/**
 * Lifecycle audit (out-of-stock 1 · kitchen-board-sync 6) — the dishes that hold a dine-in SEND:
 * exactly the `dinein` drafts the Send would fire whose dish can no longer be made. A to-go draft
 * waits for the payment (and its own gate), so it must never hold the table's Send.
 */
describe("sendBlockingDishes — what a Send would put on the board that the kitchen said no to", () => {
  const catalog: CatalogItemish[] = [
    { id: "m1", name_en: "Mohinga", is_sold_out: true, is_active: true },
    { id: "m2", name_en: "Tea Leaf Salad", is_sold_out: false, is_active: true },
    { id: "m3", name_en: "Shan Noodles", is_sold_out: false, is_active: false },
  ];
  it("names sold-out and delisted dine-in drafts, and nothing sendable", () => {
    const lines: CartLineish[] = [
      { menu_item_id: "m1", name: "Mohinga", state: "draft", fulfillment: "dinein" },
      { menu_item_id: "m2", name: "Tea Leaf Salad", state: "draft", fulfillment: "dinein" },
      { menu_item_id: "m3", name: "Shan Noodles", state: "draft", fulfillment: "dinein" },
    ];
    expect(sendBlockingDishes(lines, catalog).map((u) => u.name)).toEqual([
      "Mohinga",
      "Shan Noodles",
    ]);
  });
  it("a TO-GO draft of a sold-out dish never holds the table's Send", () => {
    // MUTATION (lcb/availability/to-go-draft-holds-the-send): drop the dine-in filter; red.
    const lines: CartLineish[] = [
      { menu_item_id: "m1", name: "Mohinga", state: "draft", fulfillment: "togo" },
    ];
    expect(sendBlockingDishes(lines, catalog)).toEqual([]);
  });
  it("a line already with the kitchen is not the Send's (it is not fired again)", () => {
    const lines: CartLineish[] = [
      { menu_item_id: "m1", name: "Mohinga", state: "fired", fulfillment: "dinein" },
    ];
    expect(sendBlockingDishes(lines, catalog)).toEqual([]);
  });
});

/**
 * #362 (Codex round 1, cart.ts:190) — ONE predicate that returns the KIND. A delisted dish is not a
 * temporary 86, and every surface that names the reason ("Sold out" vs "No longer on the menu") reads
 * it from here, so /cart, the Send's names and the refusals agree.
 */
describe("dishUnavailable — a HIDDEN category is off the menu (OA2)", () => {
  it("a dish whose category is hidden is gone; a shown category or a read without the embed is not (`availability/hidden-category-sells`)", () => {
    const dish = { is_sold_out: false, is_active: true };
    expect(dishUnavailable({ ...dish, menu_categories: { is_active: false } })).toBe("gone");
    expect(dishUnavailable({ ...dish, menu_categories: { is_active: true } })).toBeNull();
    expect(dishUnavailable({ ...dish, menu_categories: null })).toBeNull();
    expect(dishUnavailable(dish)).toBeNull();
  });
});

describe("dishUnavailable — sold out, or no longer on the menu", () => {
  it("names the kind: an 86 is `sold_out`; a delisted dish, or no catalog row at all, is `gone`", () => {
    // MUTATION (lcb/availability/delisted-reads-sold-out): answer `sold_out` for an inactive dish —
    // a delisting reads as a temporary 86 ("Sold out" on a dish that is not coming back); red.
    expect(dishUnavailable(item({ id: "a", is_sold_out: true }))).toBe("sold_out");
    expect(dishUnavailable(item({ id: "a", is_active: false }))).toBe("gone");
    expect(dishUnavailable(null)).toBe("gone");
    expect(dishUnavailable(undefined)).toBe("gone");
    expect(dishUnavailable(item({ id: "a" }))).toBeNull();
    // A delisted dish that was also 86'd is GONE: the delisting is the fact that outlives the 86.
    expect(dishUnavailable(item({ id: "a", is_sold_out: true, is_active: false }))).toBe("gone");
  });

  it("`itemSellable` is that predicate's projection — never a second spelling", () => {
    for (const flags of [
      { is_sold_out: false, is_active: true },
      { is_sold_out: true, is_active: true },
      { is_sold_out: false, is_active: false },
      { is_sold_out: true, is_active: false },
    ])
      expect(itemSellable(flags)).toBe(dishUnavailable(flags) === null);
  });

  it("pickUnavailable carries the kind of each dish it names", () => {
    expect(
      pickUnavailable(
        [line({ menu_item_id: "a" }), line({ menu_item_id: "b" }), line({ menu_item_id: "ghost" })],
        [
          item({ id: "a", name_en: "Mohinga", is_sold_out: true }),
          item({ id: "b", name_en: "Shan Noodles", is_active: false }),
        ],
      ).map((u) => [u.name, u.why]),
    ).toEqual([
      ["Mohinga", "sold_out"],
      ["Shan Noodles", "gone"],
      ["Line", "gone"],
    ]);
  });
});

/**
 * #362 (blind pass 2b) — a COMPED draft never holds the table's Send. No diner can remove a comped
 * line (`canMutateLine`), so a sold-out comp blocked the whole table's Send with no way through; staff
 * comped it, staff own it. It fires as it did before this gate existed (the KDS shows the 86).
 */
describe("sendBlockingDishes — a comp the diner cannot remove never blocks the Send", () => {
  it("skips a comped sold-out dine-in draft, and still blocks an uncomped one", () => {
    // MUTATION (lcb/availability/comp-blocks-the-send): drop the comped filter; red.
    const catalog = [item({ id: "m1", name_en: "Mohinga", is_sold_out: true })];
    expect(
      sendBlockingDishes(
        [line({ menu_item_id: "m1", fulfillment: "dinein", comped: true })],
        catalog,
      ),
    ).toEqual([]);
    expect(
      sendBlockingDishes(
        [line({ menu_item_id: "m1", fulfillment: "dinein", comped: false })],
        catalog,
      ).map((u) => u.name),
    ).toEqual(["Mohinga"]);
  });
});
