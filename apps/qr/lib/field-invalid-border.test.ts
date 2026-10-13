import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cssDeclarations } from "./css-declarations";

/**
 * F20 · blind pass on #355 — a refused box keeps its `--warn` border while it has focus.
 *
 * The `@mms/ui` Field marks a refused box `aria-invalid` and `.ui-field-control[aria-invalid="true"]`
 * (primitives.css, 0,2,0) draws it `--warn`. The app dresses the Field's box in its wells —
 * `.checkout-promo-input` (the promo box) and `.account-field` (the account card's two boxes) — whose
 * `:focus-visible` accent is ALSO 0,2,0 and sits in globals.css, which imports primitives.css first:
 * later wins the tie. A refusal said by moving focus into the box (and Enter in it, where focus never
 * left) therefore drew the accent border, not the warn one the change promised. The accent is for a
 * VALID box: every state rule of a well that recolours its border excludes the invalid one.
 */
const ROOT = join(__dirname, "..", "..", "..");
const PRIMITIVES = cssDeclarations(
  readFileSync(join(ROOT, "packages", "ui", "src", "primitives.css"), "utf8"),
);
const GLOBALS = cssDeclarations(
  readFileSync(join(ROOT, "apps", "qr", "app", "globals.css"), "utf8"),
);
const WELLS = ["checkout-promo-input", "account-field"];
const members = (selector: string) => selector.split(",").map((s) => s.trim());

/** The compound a selector member styles: the text after its last combinator outside `()`/`[]`. */
function subject(member: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < member.length; i++) {
    const c = member[i]!;
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(c)) start = i + 1;
  }
  return member.slice(start);
}

/** A STATE rule of a well: the styled compound carries the well's class and a pseudo-class, in any
 *  order (`:focus-visible.checkout-promo-input` is the same rule, at the same specificity). */
const wellState = (member: string) => {
  const s = subject(member);
  return WELLS.some((w) => new RegExp(`\\.${w}(?![\\w-])`).test(s)) && /:(?!:)/.test(s);
};

const EXCLUDED = ':not([aria-invalid="true"])';
/** The styled compound excludes the invalid box EXACTLY: the one `:not([aria-invalid="true"])` at
 *  the top level, and `aria-invalid` named nowhere else in it — so `:not(:not(…))`, an `:is(…, …)`
 *  around it, or a second `[aria-invalid…]` is refused rather than read as the exclusion. */
function excludesInvalid(member: string): boolean {
  const s = subject(member);
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (depth === 0 && s.startsWith(EXCLUDED, i)) {
      const rest = s.slice(0, i) + s.slice(i + EXCLUDED.length);
      return !rest.includes("aria-invalid");
    }
    const c = s[i]!;
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
  }
  return false;
}

describe("a refused Field box keeps its warn border in the app's wells", () => {
  it("the primitive draws an invalid box --warn", () => {
    const warn = PRIMITIVES.filter(
      (d) =>
        members(d.selector).includes('.ui-field-control[aria-invalid="true"]') &&
        d.prop === "border-color",
    );
    expect(warn.map((d) => d.value)).toEqual(["var(--warn)"]);
  });

  it("no well's state rule recolours the border of an INVALID box", () => {
    const states = GLOBALS.flatMap((d) =>
      /^border(-color)?$/.test(d.prop)
        ? members(d.selector)
            .filter(wellState)
            .map((m) => ({ m, value: d.value }))
        : [],
    );
    // The case this guards is real: each well has a focus accent (or this would pass on nothing).
    for (const w of WELLS)
      expect(states.some(({ m }) => m.includes(`.${w}`) && m.includes(":focus-visible"))).toBe(
        true,
      );
    expect(states.filter(({ m }) => !excludesInvalid(m))).toEqual([]);
  });

  it("the matcher: a state rule in any order is a candidate, and only the exact exclusion passes", () => {
    // Blind pass over #355's fix commits: the pseudo-class written first slipped the candidate scan,
    // and a double negation satisfied the substring check while matching ONLY invalid boxes.
    expect(wellState(":focus-visible.checkout-promo-input")).toBe(true);
    expect(wellState("form .account-field:hover")).toBe(true);
    expect(wellState(".checkout-promo-input")).toBe(false);
    expect(wellState(".checkout-promo-input:focus-visible + span")).toBe(false);
    expect(excludesInvalid('.checkout-promo-input:focus-visible:not([aria-invalid="true"])')).toBe(
      true,
    );
    expect(excludesInvalid('.x:not([aria-invalid="true"]):focus-visible.account-field')).toBe(true);
    for (const evasion of [
      ":focus-visible.checkout-promo-input",
      '.checkout-promo-input:focus-visible:not(:not([aria-invalid="true"]))',
      '.checkout-promo-input:focus-visible:is(:not([aria-invalid="true"]), .x)',
      '.checkout-promo-input:focus-visible:not([aria-invalid="false"])',
      '.checkout-promo-input:focus-visible:not([aria-invalid="true"])[aria-invalid="true"]',
      '.account-field:not([aria-invalid="true"]) .account-field:focus-visible',
    ])
      expect(excludesInvalid(evasion)).toBe(false);
  });
});
