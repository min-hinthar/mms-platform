import { describe, expect, it } from "vitest";
import { CART_MONEY_KEYS, DICT, t } from "./index";
import { CART } from "./cart";
import { COMMON } from "./common";
import { CONFIRM } from "./confirm";

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

  it("module key sets are DISJOINT — an object spread silently shadows duplicates (review MED-4)", () => {
    // `DICT = { ...COMMON, ...CART }` — TS does not error on duplicate keys across spreads, so a
    // re-used key in a later module would silently override a money-path entry while
    // CART_MONEY_KEYS kept guarding the string no longer rendered. Add every new module here.
    const modules: [string, Record<string, unknown>][] = [
      ["common", COMMON],
      ["cart", CART],
      ["confirm", CONFIRM],
    ];
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const [name, mod] of modules) {
      for (const key of Object.keys(mod)) {
        const prior = seen.get(key);
        if (prior) collisions.push(`${key} (${prior} ↔ ${name})`);
        seen.set(key, name);
      }
    }
    expect(collisions).toEqual([]);
    // The union must equal DICT — a module missing from this list would blind the guard.
    expect(seen.size).toBe(Object.keys(DICT).length);
  });

  it("CART_MONEY_KEYS is complete by naming convention — row*/pay* keys must be listed (review LOW-10)", () => {
    const escaped = Object.keys(CART).filter(
      (k) => /^(row|pay)/.test(k) && !(CART_MONEY_KEYS as readonly string[]).includes(k),
    );
    expect(escaped).toEqual([]);
  });

  it("t() resolves both tongues (every render site speaks both — W16b)", () => {
    expect(t("en", "yourOrder")).toBe("Your order");
    expect(t("my", "yourOrder")).toBe("သင့်အော်ဒါ");
  });
});
