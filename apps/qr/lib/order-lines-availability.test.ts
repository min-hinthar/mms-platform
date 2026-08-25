import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W23a — the ADD-TIME half of the availability gate, pinned against the real `priceItem`.
 *
 * `priceItem` is the ONE place a unit price is minted (diner add, staff add, kiosk, reorder), so it is
 * also the one place every add path can be refused. The charge-boundary re-read (`lib/availability.ts`)
 * cannot cover this moment and this one cannot cover that one: an 86 that lands BEFORE the tap should
 * never let the dish into the basket, and an 86 that lands AFTER it has to be caught before the charge.
 * Both halves read the SAME predicate (`itemSellable`), which is the point of extracting it.
 *
 * The fixtures below differ from the sellable case in exactly ONE field each, so a gate that drops
 * either flag reddens exactly one test.
 */

vi.mock("server-only", () => ({}));

const BASE = {
  id: "44444444-4444-4444-8444-444444444444",
  name_en: "Mohinga",
  base_price_cents: 990,
  tax_category: "hot_prepared",
  is_sold_out: false,
  is_active: true,
  item_modifier_groups: [],
};

let ITEM: Record<string, unknown> | null = { ...BASE };
/** A transport-level failure on the item read — distinct from "the row is not there" (ITEM = null). */
let ITEM_ERROR: { message: string } | null = null;

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () =>
          Promise.resolve(
            ITEM_ERROR
              ? { data: null, error: ITEM_ERROR }
              : { data: table === "menu_items" ? ITEM : null, error: null },
          ),
      };
      return chain;
    },
  }),
}));

const { priceItem, ItemUnsellableError, ItemUnreadableError } = await import("./order-lines");

beforeEach(() => {
  ITEM = { ...BASE };
  ITEM_ERROR = null;
});

describe("priceItem — the add-time availability refusal", () => {
  it("prices a sellable dish (the control: 990, no refusal)", async () => {
    ITEM = { ...BASE };
    await expect(priceItem(BASE.id, [])).resolves.toMatchObject({
      name: "Mohinga",
      unitPriceCents: 990,
    });
  });

  it("refuses a SOLD OUT dish, and names it", async () => {
    ITEM = { ...BASE, is_sold_out: true };
    // Naming the dish is load-bearing: the diner is holding a menu and needs to know what to pick
    // instead. A refusal that says "unavailable" leaves them hunting.
    await expect(priceItem(BASE.id, [])).rejects.toThrow(/Mohinga just sold out/);
  });

  it("refuses a DELISTED dish — a stale phone can still hold one", async () => {
    ITEM = { ...BASE, is_active: false };
    await expect(priceItem(BASE.id, [])).rejects.toThrow(/Mohinga just sold out/);
  });

  it("refuses BEFORE it prices — a refused add mints no amount at all", async () => {
    // The ordering matters on a money path: if the gate sat after the price derivation, a partially
    // priced line could still be threaded onto a cart by a caller that swallowed the throw.
    ITEM = { ...BASE, is_sold_out: true, base_price_cents: 123456 };
    await expect(priceItem(BASE.id, [])).rejects.toThrow();
  });
});

/**
 * M119 (Codex round 2, P2) — the read that could not tell an outage from a delisting.
 *
 * `.single()` reports a 0-row result as an ERROR, so `if (error || !item)` answered `gone` for both
 * "this dish is no longer in the catalog" and "we could not reach the catalog". That was unreachable
 * from `reorderOrder` while it refused outright on a failed batch read; the round-1 fallback made it
 * reachable, and it put the fabricated diagnosis straight back on the screen the fallback exists to
 * keep honest. `.maybeSingle()` is what separates the two.
 */
describe("priceItem — a failed read is not an availability verdict", () => {
  it("THE DEFECT — a transport failure must NOT come back as 'gone'", async () => {
    ITEM_ERROR = { message: "transport failure" };
    await expect(priceItem(BASE.id, [])).rejects.toBeInstanceOf(ItemUnreadableError);
    // The specific wrong answer: an availability verdict about a dish nobody could check.
    await expect(priceItem(BASE.id, [])).rejects.not.toBeInstanceOf(ItemUnsellableError);
  });

  it("a genuine no-row is STILL 'gone' — the fix must not blunt the real refusal", async () => {
    ITEM = null;
    await expect(priceItem(BASE.id, [])).rejects.toBeInstanceOf(ItemUnsellableError);
    await expect(priceItem(BASE.id, [])).rejects.toMatchObject({ reason: "gone" });
  });

  it("the unreadable error carries the id it could not read (diagnosable without the message)", async () => {
    ITEM_ERROR = { message: "transport failure" };
    await expect(priceItem(BASE.id, [])).rejects.toMatchObject({ menuItemId: BASE.id });
  });
});
