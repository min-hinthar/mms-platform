import { describe, expect, it } from "vitest";
import { STAFF } from "./i18n/staff";
import {
  HELP_SCREENS,
  HELP_SEEN_PREFIX,
  helpCardCount,
  helpCardKeys,
  helpSeenKey,
  helpTitleKey,
  helpScreenNameKey,
} from "./help";

/**
 * P7·3 — the cards are dictionary keys by CONVENTION, which is only safe while something holds the
 * convention: a screen whose last card was never written would render `<Chrome k=…>` on a key
 * that does not exist and throw INSIDE RENDER, taking the board down with the help sheet open.
 */
describe("help — the door's pure part", () => {
  it("every screen has a title and exactly its card count of sentence + line pairs, all in the dictionary", () => {
    for (const screen of HELP_SCREENS) {
      expect(helpTitleKey(screen) in STAFF, `${screen} title`).toBe(true);
      const count = helpCardCount(screen);
      for (let n = 1; n <= count; n++) {
        const { k, more } = helpCardKeys(screen, n);
        expect(k in STAFF, k).toBe(true);
        expect(more in STAFF, more).toBe(true);
      }
      // …and no card beyond the count is authored that the sheet would never show.
      expect(`help.how.${screen}.${count + 1}` in STAFF, `${screen} card ${count + 1}`).toBe(false);
    }
  });
  it("the counter holds six — the screen for three jobs since A4·2; the kitchen keeps the canvas's four", () => {
    expect(helpCardCount("counter")).toBe(6);
    expect(helpCardCount("kitchen")).toBe(4);
  });
  it("the takeaway board has no door of its own — the bump card is composed from its two bump sentences, the paper card moved whole", () => {
    expect(HELP_SCREENS).not.toContain("expo");
    expect(Object.keys(STAFF).filter((k) => k.startsWith("help.how.expo"))).toEqual([]);
    // The four strings the board authored (P7·3, owner-reviewed), pinned as LITERALS in both
    // tongues — the sentences that survived the fold, exactly as they were.
    expect(STAFF["help.how.counter.3"]).toEqual({
      en: "Bag packed? Tap Bagged & ready.",
      my: "ထုပ်ပြီးပြီလား? ထုပ်ပြီး၊ ယူလို့ရပြီ ကို နှိပ်ပါ။",
    });
    expect(STAFF["help.how.counter.3.more"]).toEqual({
      en: "Guest has it? Tap Picked up. The card clears.",
      my: "ဧည့်သည် ယူသွားပြီလား? ယူသွားပြီ ကို နှိပ်ပါ။ ကတ် ပျောက်သွားပါမယ်။",
    });
    expect(STAFF["help.how.counter.4"]).toEqual({
      en: "Board says it isn’t updating? Keep going on paper.",
      my: "ဘုတ်က အသစ်မတက်ဘူးလို့ ပြရင် စာရွက်နဲ့ ဆက်လုပ်ပါ။",
    });
    expect(STAFF["help.how.counter.4.more"]).toEqual({
      en: "Nothing already recorded is lost — it catches up when we’re back.",
      my: "မှတ်ထားပြီးသမျှ မပျောက်ပါ — ပြန်ကောင်းတာနဲ့ အလိုလို ပြန်တက်လာပါမယ်။",
    });
    // …and a report filed from the old board still names its screen (`staff_reports.screen`).
    expect(helpScreenNameKey("expo") in STAFF).toBe(true);
  });
  it("a card outside the screen's count is refused, never a key that might happen to exist", () => {
    expect(() => helpCardKeys("kitchen", 0)).toThrow(RangeError);
    expect(() => helpCardKeys("kitchen", helpCardCount("kitchen") + 1)).toThrow(RangeError);
    expect(() => helpCardKeys("counter", helpCardCount("counter") + 1)).toThrow(RangeError);
    expect(() => helpCardKeys("kitchen", 1.5)).toThrow(RangeError);
  });
  it("the undo card's slot matches the board's contract — EXACTLY one {n}, both tongues", () => {
    const { k } = helpCardKeys("kitchen", 2);
    const count = (s: string) => (s.match(/\{n\}/g) ?? []).length;
    expect(count(STAFF[k].en)).toBe(1);
    expect(count(STAFF[k].my)).toBe(1);
  });
  it("each screen's NAME key exists and is the door's word, never the how-view's sentence", () => {
    for (const screen of HELP_SCREENS) {
      const k = helpScreenNameKey(screen);
      expect(k in STAFF).toBe(true);
      expect(k).not.toBe(helpTitleKey(screen));
      expect(STAFF[k].en).not.toMatch(/^How /);
    }
  });
  it("seen is a per-screen DEVICE key under one prefix — and the counter's sheet, reshaped by A4·2, is a new key", () => {
    expect(helpSeenKey("kitchen")).toBe(`${HELP_SEEN_PREFIX}kitchen`);
    // The old four-card mark (`mms.help.seen:counter`) is not this key: a tablet that dismissed
    // that sheet sees the six-card one once.
    expect(helpSeenKey("counter")).toBe(`${HELP_SEEN_PREFIX}counter:2`);
    expect(new Set(HELP_SCREENS.map(helpSeenKey)).size).toBe(HELP_SCREENS.length);
    expect(HELP_SEEN_PREFIX.startsWith("mms.")).toBe(true);
  });
});
