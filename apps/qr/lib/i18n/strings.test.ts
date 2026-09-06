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

  it("P2 — a STAFF my value carries no bare Latin run: <Chrome> can only mark INTERPOLATED values", () => {
    // `Chrome`'s `renderMyTemplate` splits a MY template on its `{slots}` and wraps a slot VALUE in
    // `<span lang="en">` when it contains Latin — which is what keeps `$42.10` in the body face and
    // stops it breaking mid-amount inside a Burmese run. Latin written LITERALLY inside the template
    // is not a slot, so nothing wraps it: it renders in Padauk, at Burmese leading, announced as
    // Burmese. That is the defect `check-staff-lang.mjs` rule 5 exists for, one layer below where
    // rule 5 can look — the guard inspects the CALL SITE, this inspects the STRING.
    //
    // Scoped to STAFF deliberately: `Chrome` is the staff renderer, and the diner dictionaries reach
    // the DOM through a different path with its own rules. `STAFF_LATIN_BY_DESIGN` is the one
    // exemption, and it already carries a reason per entry.
    //
    // Found while converting the register: one value said "LA" for the timezone inside an otherwise
    // Burmese sentence, and every other guard on this file was green on it.
    const bad = Object.entries(STAFF)
      .filter(([k]) => !(k in STAFF_LATIN_BY_DESIGN))
      .filter(([, v]) => /[A-Za-z]/.test(v.my.replace(/\{[a-z]+\}/g, "")))
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("P2 — two keys on ONE surface may not share a Burmese value while their English differs", () => {
    // A Burmese reader must not lose a distinction the English reader has. The case that produced
    // this rule: `settle.cash.settling` ("Settling…") and `settle.clear.clearing` ("Clearing…") both
    // read `ရှင်းနေပါတယ်…`, and BOTH controls mount on `FloorDetailLive` — so under `my` the busy
    // state of "take the guest's cash" and of "close the session and route away" were the same
    // sentence, one of them destructive. Nothing caught it: the only duplicate-MY assertion in this
    // file fires for declared plural pairs, which these are not.
    //
    // SCOPED TO ONE SURFACE deliberately. Across surfaces a shared Burmese word is the NORM and the
    // point of the namespace — `kds.table` and `floor.table` are both စားပွဲ {id} because they are
    // the same words on two screens. An unscoped version of this rule reports 11, of which 10 are
    // that. Scoping it drops the noise to a single reasoned exemption, which is the difference
    // between a guard and a whitelist that rots.
    //
    // English is compared with punctuation and case folded, so "All-day" / "All day" is one word.
    const SAME_WORD_BY_DESIGN: Readonly<Record<string, string>> = {
      "what.floor|what.room":
        "The floor and the room are one physical space; the console says ခန်းမ for both, and the two English forms exist only because the sentences around them differ.",
    };
    const paired = new Set<string>(STAFF_PLURAL_PAIRS.flat() as readonly string[]);
    const norm = (v: string) =>
      v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const groups = new Map<string, string[]>();
    for (const [k, v] of Object.entries(STAFF)) {
      if (paired.has(k)) continue;
      const g = `${k.split(".")[0]}\u0000${v.my}`;
      groups.set(g, [...(groups.get(g) ?? []), k]);
    }
    const collisions = [...groups.values()]
      .filter((ks) => ks.length > 1)
      .filter((ks) => new Set(ks.map((k) => norm(STAFF[k as keyof typeof STAFF].en))).size > 1)
      .map((ks) => ks.sort().join("|"))
      .filter((id) => !(id in SAME_WORD_BY_DESIGN));
    expect(collisions).toEqual([]);
    // …and an exemption may not outlive the collision it excuses.
    const stale = Object.keys(SAME_WORD_BY_DESIGN).filter((id) => {
      const ks = id.split("|");
      return (
        ks.some((k) => !(k in STAFF)) ||
        new Set(ks.map((k) => STAFF[k as keyof typeof STAFF].my)).size !== 1
      );
    });
    expect(stale).toEqual([]);
  });

  it("P2 — two keys on ONE surface saying the same English must say the same Burmese", () => {
    // The INVERSE of the rule above, and the one the parallel conversion actually needed. Ten agents
    // wrote ten fragments at once; the merge put them side by side and they had forked the Burmese
    // for identical English on shared records. The worst was the void/comp reason codes: the loss
    // sheet and the approvals queue name the SAME database values, so a cook tapped `မှားပြီး မှာမိတာ`
    // and the manager approved the same request reading `မှားပြီး မှာမိ`. "Voided" changed wording
    // between the writable and read-only branches of ONE list in ONE card.
    //
    // Decoration is stripped from BOTH tongues before comparing, so a nav pill ("Tips today →") and
    // the page title it points at are one entry, not a finding — that arrow is the only difference
    // and it is present in both halves.
    const SAME_ENGLISH_DIFFERENT_WORD_BY_DESIGN: Readonly<Record<string, string>> = {
      "browse.price.a11y.list|browse.price.title":
        "The page title names the surface (မီနူး ဈေးနှုန်း); the list's accessible name is plural because it names a LIST of them (…များ). Burmese marks that where English does not, so the two values differ for the same reason the English does not need to.",
    };
    const paired = new Set<string>(STAFF_PLURAL_PAIRS.flat() as readonly string[]);
    const DECOR = /^[\s·+←→↑↓•\-—]+|[\s·+←→↑↓•\-—]+$/gu;
    const core = (v: string) => v.replace(DECOR, "").trim();
    const normEn = (v: string) =>
      core(v)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const groups = new Map<string, string[]>();
    for (const [k, v] of Object.entries(STAFF)) {
      if (paired.has(k)) continue;
      const g = `${k.split(".")[0]}\u0000${normEn(v.en)}`;
      groups.set(g, [...(groups.get(g) ?? []), k]);
    }
    const forks = [...groups.values()]
      .filter((ks) => ks.length > 1)
      .filter((ks) => new Set(ks.map((k) => core(STAFF[k as keyof typeof STAFF].my))).size > 1)
      .map((ks) => ks.sort().join("|"))
      .filter((id) => !(id in SAME_ENGLISH_DIFFERENT_WORD_BY_DESIGN));
    expect(forks).toEqual([]);
    // …and an exemption may not outlive the fork it excuses.
    const stale = Object.keys(SAME_ENGLISH_DIFFERENT_WORD_BY_DESIGN).filter((id) => {
      const ks = id.split("|");
      return (
        ks.some((k) => !(k in STAFF)) ||
        new Set(ks.map((k) => normEn(STAFF[k as keyof typeof STAFF].en))).size !== 1 ||
        new Set(ks.map((k) => core(STAFF[k as keyof typeof STAFF].my))).size === 1
      );
    });
    expect(stale).toEqual([]);
  });

  it("P2 — the staff key namespace is dotted and surface-scoped", () => {
    // At 100+ strings across seven surfaces the same English word means different things: `All` is
    // a station chip AND a browser category; `Pickup` is a channel, a floor mode and a slot. A flat
    // key would silently collapse them. A segment may LEAD with a digit — `kds.86` is the kitchen
    // verb, not a number — which is why the rule is about the surface prefix, not about looking
    // like an identifier.
    const SURFACES = /^(shell|out|what|kds|expo|floor|table|reg|settle|browse|board)$/;
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
