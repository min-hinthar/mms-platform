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
            .filter((m) => WELLS.some((w) => new RegExp(`\\.${w}(?![\\w-])[^\\s>+~]*:`).test(m)))
            .map((m) => ({ m, value: d.value }))
        : [],
    );
    // The case this guards is real: each well has a focus accent (or this would pass on nothing).
    for (const w of WELLS)
      expect(states.some(({ m }) => m.startsWith(`.${w}`) && m.includes(":focus-visible"))).toBe(
        true,
      );
    // Each one excludes the invalid box exactly — `[aria-invalid="false"]` or a bare `[aria-invalid]`
    // would read the same to a substring check and ship the defect.
    expect(states.filter(({ m }) => !m.includes(':not([aria-invalid="true"])'))).toEqual([]);
  });
});
