import { describe, expect, it } from "vitest";
import { cartSoldOutReading, freshestSoldOut, soldOutSendNotice } from "./dish-sold-out";

/**
 * Lifecycle audit (out-of-stock 0 · 5) — the menu's sold-out fact is the FRESHEST reading this phone
 * holds, in both directions. The shipped rule ORed a stale render with the live cart flag, so a dish
 * put back on the menu stayed dead on /menu while /cart's "+" was live; and a sold-out refusal was no
 * reading at all, so the card stayed live under every retry.
 */
describe("freshestSoldOut — the newest reading wins, both ways", () => {
  it("a fresher AVAILABLE reading clears a stale sold-out render (the restock)", () => {
    // MUTATION (lcb/sold-out/stale-render-outvotes-fresher): OR the readings — a restocked dish stays
    // dead on /menu; red.
    expect(
      freshestSoldOut([
        { soldOut: true, atMs: 1_000 },
        { soldOut: false, atMs: 2_000 },
      ]),
    ).toBe(false);
  });

  it("a fresher SOLD-OUT reading beats a live render (the 86 under an open menu)", () => {
    expect(
      freshestSoldOut([
        { soldOut: false, atMs: 1_000 },
        { soldOut: true, atMs: 2_000 },
      ]),
    ).toBe(true);
    // …and order in the list decides nothing.
    expect(
      freshestSoldOut([
        { soldOut: true, atMs: 2_000 },
        { soldOut: false, atMs: 1_000 },
      ]),
    ).toBe(true);
  });

  it("a TIE reads sold out — an Add refused is a named tap, an Add offered for nothing is the trap", () => {
    // MUTATION (lcb/sold-out/tie-reads-available): let the first reading win a tie; red.
    expect(
      freshestSoldOut([
        { soldOut: false, atMs: 5_000 },
        { soldOut: true, atMs: 5_000 },
      ]),
    ).toBe(true);
  });

  it("no reading, or none with a finite clock, is not sold out", () => {
    expect(freshestSoldOut([null, undefined])).toBe(false);
    expect(freshestSoldOut([{ soldOut: true, atMs: Number.NaN }])).toBe(false);
  });
});

describe("cartSoldOutReading — the cart view's line flag, stamped with its DB clock", () => {
  const NOW = "2026-10-13T12:00:00.000Z";
  const lines = [
    { menuItemId: "mohinga", soldOut: false, fulfillment: "dinein" as const },
    { menuItemId: "tea-leaf", soldOut: true, fulfillment: "togo" as const },
    { menuItemId: "rice", soldOut: true, fulfillment: "grocery" as const },
  ];

  it("reads ANY food line of the dish (a tablemate's too), at the view's clock", () => {
    expect(cartSoldOutReading(lines, "tea-leaf", NOW, true)).toEqual({
      soldOut: true,
      atMs: Date.parse(NOW),
    });
    expect(cartSoldOutReading(lines, "mohinga", NOW, true)).toEqual({
      soldOut: false,
      atMs: Date.parse(NOW),
    });
  });

  it("a dish with a REQUIRED choice may only gain a sold-out fact from the cart, never lose one", () => {
    // MUTATION (lcb/sold-out/cart-clears-a-required-choice): drop the guard — the catalog's
    // "nothing left to choose" is cleared by a cart flag that cannot see it; red.
    expect(cartSoldOutReading(lines, "mohinga", NOW, false)).toBeNull();
    expect(cartSoldOutReading(lines, "tea-leaf", NOW, false)?.soldOut).toBe(true);
  });

  it("no line of the dish, a grocery line, or no clock is no reading", () => {
    expect(cartSoldOutReading(lines, "laphet", NOW, true)).toBeNull();
    expect(cartSoldOutReading(lines, "rice", NOW, true)).toBeNull();
    expect(cartSoldOutReading(lines, "mohinga", null, true)).toBeNull();
  });
});

describe("soldOutSendNotice — a refused Send names the dishes and the way through", () => {
  it("one dish, two, and more (the list caps at two names, read aloud)", () => {
    expect(soldOutSendNotice(["Mohinga"])).toBe(
      "Mohinga is sold out now — remove it to send the rest.",
    );
    expect(soldOutSendNotice(["Mohinga", "Tea Leaf Salad"])).toBe(
      "Mohinga and Tea Leaf Salad are sold out now — remove them to send the rest.",
    );
    expect(soldOutSendNotice(["A", "B", "C"])).toBe(
      "A, B and 1 more are sold out now — remove them to send the rest.",
    );
  });
});
