import { describe, expect, it } from "vitest";
import { PRICE_MAX_CENTS, PRICE_MIN_CENTS } from "@mms/db/bounds";
import { draftCents, priceDraftHeld, priceDraftVerdict } from "./menu-price-draft";

describe("priceDraftVerdict — every refused draft has a stated reason", () => {
  it("parses dollars strictly to integer cents", () => {
    expect(draftCents("14.50")).toBe(1450);
    expect(draftCents("14.5")).toBe(1450);
    expect(draftCents(" 14 ")).toBe(1400);
    expect(draftCents("0.25")).toBe(25);
    for (const bad of ["", "$14", "14,50", "14.505", "abc", "1e3", "-3", ".5"])
      expect(draftCents(bad), bad).toBeNaN();
  });

  it("names the floor and the ceiling INCLUSIVELY — the bounds the write accepts", () => {
    // MUTATION: `cents <= PRICE_MIN_CENTS` — the floor itself refused while the server accepts it; red.
    expect(priceDraftVerdict("0.25", 1200)).toBe("ok");
    expect(priceDraftVerdict("0.24", 1200)).toBe("below");
    // MUTATION: `cents >= PRICE_MAX_CENTS` — red.
    expect(priceDraftVerdict("5000", 1200)).toBe("ok");
    expect(priceDraftVerdict("5000.01", 1200)).toBe("above");
    expect(PRICE_MIN_CENTS).toBe(25);
    expect(PRICE_MAX_CENTS).toBe(500000);
  });

  it("an empty field, a malformed one and the current price are each their own verdict", () => {
    expect(priceDraftVerdict("", 1200)).toBe("empty");
    expect(priceDraftVerdict("   ", 1200)).toBe("empty");
    expect(priceDraftVerdict("12.0x", 1200)).toBe("nan");
    // MUTATION: drop the `unchanged` arm — Save lights for a no-op edit; red.
    expect(priceDraftVerdict("12.00", 1200)).toBe("unchanged");
    expect(priceDraftVerdict("12", 1200)).toBe("unchanged");
    expect(priceDraftVerdict("12.01", 1200)).toBe("ok");
  });
});

describe("priceDraftHeld — an edited price not yet saved holds a reload (Codex r2 on #311)", () => {
  it("a typed amount that is not the saved price is held — well-formed or not", () => {
    // MUTATION (p2i-draft/price-never-held): the draft never holds — a manager who typed 14.50 and
    // tapped away loses it to the automatic reload; red.
    expect(priceDraftHeld("14.50", 1295)).toBe(true);
    expect(priceDraftHeld("14.5x", 1295)).toBe(true);
  });
  it("the saved price, however it is typed, or an emptied field, holds nothing — nothing would be lost", () => {
    // MUTATION (p2i-draft/price-text-compared): compared as TEXT — "12.95" against a field that
    // reads "12.950" or " 12.95 " holds the reload over a price that is already saved; red.
    expect(priceDraftHeld("12.95", 1295)).toBe(false);
    expect(priceDraftHeld(" 12.95 ", 1295)).toBe(false);
    expect(priceDraftHeld("12.9", 1290)).toBe(false);
    // MUTATION (p2i-draft/price-empty-held): an emptied field holds — the saved price is untouched
    // and nothing typed would be lost; red.
    expect(priceDraftHeld("", 1295)).toBe(false);
    expect(priceDraftHeld("   ", 1295)).toBe(false);
  });
});
