import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Plain words (owner, 2026-09-24: "86 this dish doesn't make sense to my parents … same for
 * customer facing"). Every English value a person reads — staff console, diner screens, market,
 * kiosk — uses the words someone would say out loud: no kitchen slang, no payments jargon.
 *
 * The guard PARSES each dictionary module with the TypeScript compiler (LEARNINGS #60 — a comment is
 * not an AST node, so a note that SAYS "86" to explain a key's history never trips it, and a value
 * written as a template literal or split across lines is still read whole). It walks every object
 * literal property named `en` and evaluates the string it holds; a value it cannot evaluate to a
 * string is refused outright rather than skipped, so an expression cannot smuggle a word past it.
 *
 * An exemption is a KEY, named here with its reason — never a pattern loosened to let one through.
 */
const DICTIONARIES = [
  "staff.ts",
  "common.ts",
  "cart.ts",
  "confirm.ts",
  "market.ts",
  "../kiosk/strings.ts",
] as const;

const BANNED: readonly RegExp[] = [
  /\b86\b/i,
  /86'?d/i,
  /\bbump(ed|ing|s)?\b/i,
  /\bcomp(ed|ing|s)?\b/i,
  /\bvoid(ed|ing|s)?\b/i,
  /\bfire(d|s)?\b/i,
  /\bexpo\b/i,
  /\bthe pass\b/i,
  /\bauthori[sz]/i,
];

/** key → why its English legitimately matches a banned pattern. Empty is the goal, not a rule. */
const ALLOW: Readonly<Record<string, string>> = {};

type Value = { file: string; key: string; en: string };

/** A string-valued expression, evaluated — or null when it is not a plain string. */
function stringOf(e: ts.Expression): string | null {
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isParenthesizedExpression(e)) return stringOf(e.expression);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = stringOf(e.left);
    const r = stringOf(e.right);
    return l === null || r === null ? null : l + r;
  }
  return null;
}

function propName(n: ts.PropertyName): string | null {
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  return null;
}

/** Every `en:` value in a module, keyed by the property that holds its `{ en, my }` object. */
function englishValues(file: string, src: string): { values: Value[]; refused: string[] } {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const values: Value[] = [];
  const refused: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && propName(node.name) === "en") {
      const owner = node.parent.parent;
      const key =
        ts.isPropertyAssignment(owner) && propName(owner.name) !== null
          ? propName(owner.name)!
          : `<line ${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}>`;
      const en = stringOf(node.initializer);
      if (en === null) refused.push(`${file} ${key}`);
      else values.push({ file, key, en });
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  };
  visit(sf);
  return { values, refused };
}

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`./${rel}`, import.meta.url)), "utf8");

function violations(values: Value[]): string[] {
  return values.flatMap((v) =>
    BANNED.filter((re) => re.test(v.en) && !(v.key in ALLOW)).map(
      (re) => `${v.file} ${v.key}: ${re} in "${v.en}"`,
    ),
  );
}

describe("plain words — no kitchen slang or payments jargon in any English a person reads", () => {
  const all = DICTIONARIES.map((f) => ({ f, ...englishValues(f, read(f)) }));

  it("reads every dictionary — each module yields values, and every `en` is a plain string", () => {
    for (const { f, values, refused } of all) {
      expect(values.length, f).toBeGreaterThanOrEqual(3);
      expect(refused, f).toEqual([]);
    }
  });

  it("no English value matches a banned word", () => {
    expect(violations(all.flatMap((a) => a.values))).toEqual([]);
  });

  it("every allowlisted key still exists and still needs its exemption", () => {
    const byKey = new Map(all.flatMap((a) => a.values).map((v) => [v.key, v.en]));
    for (const key of Object.keys(ALLOW)) {
      const en = byKey.get(key);
      expect(en, key).toBeDefined();
      expect(
        BANNED.some((re) => re.test(en!)),
        key,
      ).toBe(true);
    }
  });

  // The matcher, aimed at: what text would satisfy the guard without shipping plain words?
  describe("the matcher", () => {
    const one = (src: string) => englishValues("x.ts", src);

    it("a comment naming the slang is not a value — and a value carrying it is caught", () => {
      const src = `const D = {
        // was "86 this dish" — the owner's parents did not know the word
        "kds.86": { en: "Mark sold out", my: "x" },
        "kds.bad": { en: "86 this dish", my: "x" },
      };`;
      expect(violations(one(src).values)).toEqual([`x.ts kds.bad: ${BANNED[0]} in "86 this dish"`]);
    });

    it("a concatenated or template value is read whole; a computed one is refused, never skipped", () => {
      const src =
        "const D = { a: { en: 'Tap ' + `Bump`, my: 'x' }, b: { en: `${x} done`, my: 'x' } };";
      const r = one(src);
      expect(r.values).toEqual([{ file: "x.ts", key: "a", en: "Tap Bump" }]);
      expect(violations(r.values)).toHaveLength(1);
      expect(r.refused).toEqual(["x.ts b"]);
    });

    it("each banned word is caught in its inflections, and plain neighbours pass", () => {
      const hits = [
        "86 this",
        "86'd",
        "bumped",
        "BUMP",
        "comped",
        "voided",
        "fire the table",
        "fired",
        "expo",
        "at the pass",
        "authorized",
        "Authorise",
      ];
      for (const h of hits)
        expect(
          BANNED.some((re) => re.test(h)),
          h,
        ).toBe(true);
      const misses = [
        "Compose",
        "company",
        "complete",
        "avoid",
        "fireplace",
        "export",
        "exposure",
        "passed",
        "Pickup pass",
        "author",
        "1860",
        "Table 186",
      ];
      for (const m of misses)
        expect(
          BANNED.some((re) => re.test(m)),
          m,
        ).toBe(false);
    });
  });
});
