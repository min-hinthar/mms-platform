import { describe, expect, it } from "vitest";
import { CART_MONEY_KEYS, DICT, t } from "./index";
import { CART } from "./cart";
import { COMMON } from "./common";
import { CONFIRM } from "./confirm";
import { STAFF, STAFF_LATIN_BY_DESIGN, STAFF_PLURAL_PAIRS } from "./staff";

/**
 * W5 — the dictionary guards (the contrast-audit pattern: walk the REAL data, no fixtures to
 * refresh). Each rule was induced red before shipping. These are the rules that keep 900 strings
 * honest as the L3…L5 rollout grows the dictionary.
 */

/** Deliberately identical EN/MY — a DECISION list, never a hole (brand terms, Latin-anchored). */
const IDENTICAL_BY_DESIGN = new Set<string>([]);

const entries = Object.entries(DICT);

/**
 * P2 — the content rules must cover EVERY dictionary, not only the ones spread into `DICT`.
 *
 * `STAFF` is standalone on purpose (spreading it would ship staff Burmese in the diner bundle), and
 * the first cut of that module carried a docblock claiming these guards already walked it. They did
 * not: `ALL_MODULES` existed only in that sentence, so 104 authored Burmese strings had no parity,
 * no script check, no glossary check and no numeral check — the half of the change an English
 * reader cannot review was the half with nothing behind it. Coverage is PAID FOR here rather than
 * asserted there.
 *
 * `SPREAD_MODULES` stays separate below because the disjointness/identity rule is specifically about
 * the object spread; widening it to a standalone module would make its `seen.size === DICT` check
 * false by construction.
 */
const ALL_MODULES: [string, Record<string, { en: string; my: string }>][] = [
  ["common", COMMON],
  ["cart", CART],
  ["confirm", CONFIRM],
  ["staff", STAFF],
];

const allEntries = ALL_MODULES.flatMap(([mod, m]) =>
  Object.entries(m).map(([k, v]) => [`${mod}.${k}`, k, v] as const),
);

describe("the dictionary guards", () => {
  it("EN/MY parity — every key in EVERY module carries both tongues, non-empty", () => {
    const missing = allEntries
      .filter(([, , v]) => !v.en?.trim() || !v.my?.trim())
      .map(([id]) => id);
    expect(missing).toEqual([]);
  });

  it("no untranslated placeholders — my !== en outside the explicit identity lists", () => {
    const untranslated = allEntries
      .filter(
        ([id, key, v]) =>
          !IDENTICAL_BY_DESIGN.has(id) && !(key in STAFF_LATIN_BY_DESIGN) && v.my === v.en,
      )
      .map(([id]) => id);
    expect(untranslated).toEqual([]);
  });

  it("every MY value actually contains Myanmar script (no English pasted into the my slot)", () => {
    // The by-design exception is a NAMED list with a reason per entry, never a loosened rule: the
    // four KDS station chips stay Latin in both tongues by owner decision, because a wrong Burmese
    // word on that filter hides tickets from the cook.
    const latinOnly = allEntries
      .filter(([, key, v]) => !(key in STAFF_LATIN_BY_DESIGN) && !/\p{Script=Myanmar}/u.test(v.my))
      .map(([id]) => id);
    expect(latinOnly).toEqual([]);
  });

  it("money/legal keys carry LATIN digits only — never ၀–၉ (the money-path numerals rule)", () => {
    const burmeseDigits = CART_MONEY_KEYS.filter((k) => /[၀-၉]/.test(CART[k].my));
    expect(burmeseDigits).toEqual([]);
  });

  it("the S14a glossary holds — the order NOUN is အော်ဒါ, never the formal မှာယူမှု", () => {
    const drifted = allEntries.filter(([, , v]) => v.my.includes("မှာယူမှု")).map(([id]) => id);
    expect(drifted).toEqual([]);
  });

  it("P2 — every Latin-by-design entry names a REAL key, so the list cannot outlive its reason", () => {
    const orphans = Object.keys(STAFF_LATIN_BY_DESIGN).filter((k) => !(k in STAFF));
    expect(orphans).toEqual([]);
    // …and every listed key must genuinely be Latin. A key that has since been translated must
    // leave the list, or the exception silently protects a string that no longer needs it.
    const nowBurmese = Object.keys(STAFF_LATIN_BY_DESIGN).filter((k) =>
      /\p{Script=Myanmar}/u.test(STAFF[k as keyof typeof STAFF].my),
    );
    expect(nowBurmese).toEqual([]);
  });

  it("P2 — the staff key namespace is dotted and surface-scoped", () => {
    // At 100+ strings across seven surfaces the same English word means different things: `All` is
    // a station chip AND a browser category; `Pickup` is a channel, a floor mode and a slot. A flat
    // key would silently collapse them. A segment may LEAD with a digit — `kds.86` is the kitchen
    // verb, not a number — which is why the rule is about the surface prefix, not about looking
    // like an identifier.
    const SURFACES = /^(shell|out|what|kds|expo|floor|table|reg|settle|browse|board|pilot)$/;
    const bad = Object.keys(STAFF).filter((k) => {
      const parts = k.split(".");
      return (
        parts.length < 2 ||
        !SURFACES.test(parts[0]!) ||
        parts.slice(1).some((p) => !/^[a-zA-Z0-9]+$/.test(p))
      );
    });
    expect(bad).toEqual([]);
  });

  it("P2 — the {slot} SETS match across en/my, every staff key", () => {
    // Positions are free per tongue (Burmese is SOV); the SET is not. A slot dropped from one side
    // renders a literal `{n}` on the pass tablet, in exactly one language.
    const slots = (v: string) =>
      [...v.matchAll(/\{([a-z]+)\}/g)]
        .map((m) => m[1])
        .sort()
        .join(",");
    const mismatched = Object.entries(STAFF)
      .filter(([, v]) => slots(v.en) !== slots(v.my))
      .map(([k]) => k);
    expect(mismatched).toEqual([]);
  });

  it("P2 — plural pairs share one Burmese value, and every listed key exists", () => {
    // Burmese has no plural inflection, so the EN pair collapses to one MY string. Enumerated
    // rather than inferred, and checked BOTH ways so a pair cannot drift apart unnoticed.
    const bad: string[] = [];
    for (const [one, many] of STAFF_PLURAL_PAIRS) {
      if (!(one in STAFF) || !(many in STAFF)) bad.push(`${one}/${many} — missing key`);
      else if (STAFF[one].my !== STAFF[many].my) bad.push(`${one}/${many} — MY values differ`);
    }
    expect(bad).toEqual([]);
    // …and no `…One` key may exist without being listed.
    const listed = new Set(STAFF_PLURAL_PAIRS.flat());
    const unlisted = Object.keys(STAFF).filter(
      (k) => k.endsWith(".one") && !listed.has(k as never),
    );
    expect(unlisted).toEqual([]);
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
