import { describe, expect, it } from "vitest";
import { STAFF } from "./i18n/staff";
import {
  HELP_CARD_COUNT,
  HELP_SCREENS,
  HELP_SEEN_PREFIX,
  helpCardKeys,
  helpSeenKey,
  helpTitleKey,
} from "./help";

/**
 * P7·3 — the cards are dictionary keys by CONVENTION, which is only safe while something holds the
 * convention: a screen whose fourth card was never written would render `<Chrome k=…>` on a key
 * that does not exist and throw INSIDE RENDER, taking the board down with the help sheet open.
 */
describe("help — the door's pure part", () => {
  it("every screen has a title and exactly the card count of sentence + line pairs, all in the dictionary", () => {
    for (const screen of HELP_SCREENS) {
      expect(helpTitleKey(screen) in STAFF, `${screen} title`).toBe(true);
      for (let n = 1; n <= HELP_CARD_COUNT; n++) {
        const { k, more } = helpCardKeys(screen, n);
        expect(k in STAFF, k).toBe(true);
        expect(more in STAFF, more).toBe(true);
      }
      // …and no fifth card is authored that the sheet would never show.
      expect(`help.how.${screen}.${HELP_CARD_COUNT + 1}` in STAFF).toBe(false);
    }
  });
  it("a card outside the count is refused, never a key that might happen to exist", () => {
    expect(() => helpCardKeys("kitchen", 0)).toThrow(RangeError);
    expect(() => helpCardKeys("kitchen", HELP_CARD_COUNT + 1)).toThrow(RangeError);
    expect(() => helpCardKeys("kitchen", 1.5)).toThrow(RangeError);
  });
  it("the undo card's slot matches the board's contract — one {n}, both tongues", () => {
    const { k } = helpCardKeys("kitchen", 2);
    expect(STAFF[k].en).toContain("{n}");
    expect(STAFF[k].my).toContain("{n}");
  });
  it("seen is a per-screen DEVICE key under one prefix", () => {
    expect(helpSeenKey("kitchen")).toBe(`${HELP_SEEN_PREFIX}kitchen`);
    expect(new Set(HELP_SCREENS.map(helpSeenKey)).size).toBe(HELP_SCREENS.length);
    expect(HELP_SEEN_PREFIX.startsWith("mms.")).toBe(true);
  });
});
