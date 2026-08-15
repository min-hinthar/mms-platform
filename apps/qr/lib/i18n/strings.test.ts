import { describe, expect, it } from "vitest";
import { CART_MONEY_KEYS, DICT, isLocale, t } from "./index";
import { CART } from "./cart";

/**
 * W5 — the dictionary guards (the contrast-audit pattern: walk the REAL data, no fixtures to
 * refresh). Each rule was induced red before shipping. These are the rules that keep 900 strings
 * honest as the L3…L5 rollout grows the dictionary.
 */

/** Deliberately identical EN/MY — a DECISION list, never a hole (brand terms, Latin-anchored). */
const IDENTICAL_BY_DESIGN = new Set<string>([]);

const entries = Object.entries(DICT);

describe("the dictionary guards", () => {
  it("EN/MY parity — every key carries both tongues, non-empty", () => {
    const missing = entries.filter(([, v]) => !v.en?.trim() || !v.my?.trim()).map(([k]) => k);
    expect(missing).toEqual([]);
  });

  it("no untranslated placeholders — my !== en outside the explicit identity list", () => {
    const untranslated = entries
      .filter(([k, v]) => !IDENTICAL_BY_DESIGN.has(k) && v.my === v.en)
      .map(([k]) => k);
    expect(untranslated).toEqual([]);
  });

  it("every MY value actually contains Myanmar script (no English pasted into the my slot)", () => {
    const latinOnly = entries.filter(([, v]) => !/\p{Script=Myanmar}/u.test(v.my)).map(([k]) => k);
    expect(latinOnly).toEqual([]);
  });

  it("money/legal keys carry LATIN digits only — never ၀–၉ (the money-path numerals rule)", () => {
    const burmeseDigits = CART_MONEY_KEYS.filter((k) => /[၀-၉]/.test(CART[k].my));
    expect(burmeseDigits).toEqual([]);
  });

  it("the S14a glossary holds — the order NOUN is အော်ဒါ, never the formal မှာယူမှု", () => {
    const drifted = entries.filter(([, v]) => v.my.includes("မှာယူမှု")).map(([k]) => k);
    expect(drifted).toEqual([]);
  });

  it("t() resolves both locales and the locale guard is exact", () => {
    expect(t("en", "yourOrder")).toBe("Your order");
    expect(t("my", "yourOrder")).toBe("သင့်အော်ဒါ");
    expect(isLocale("my")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
