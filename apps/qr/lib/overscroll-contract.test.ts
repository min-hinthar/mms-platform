import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * W22c — the overscroll contract, guarded mechanically because it is a CSS rule nothing else can
 * see. `verify:slice` mutates TypeScript; `tsc` never reads a stylesheet; and the defect it prevents
 * (a rail flicked back to its start walking the diner out of the app via the iOS back gesture) is
 * invisible on a desktop browser, which is where it would be reviewed.
 *
 * Two halves, and the second matters more than the first:
 *
 *   1. Every horizontally-scrolling rail contains its own overscroll. Adding a rail without this is
 *      the regression — there are seven today and the eighth is the one that will forget.
 *   2. The SHORTHAND never appears at all. `overscroll-behavior: contain` on `:root`/`html`/`body`
 *      sets BOTH axes, which would suppress the vertical pull the platform owns app-wide — the
 *      native pull-to-refresh and, on Android, the system back-swipe affordance. The `-x` form is
 *      the whole discipline: contain the axis we scroll, never the axis we don't.
 */
const CSS = readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8");

/** Strip comments first — the rationale text names the shorthand in prose, and a guard that a
 *  comment can satisfy (or trip) is reading the wrong thing. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("the overscroll contract", () => {
  it("contains the horizontal overscroll on EVERY rail that scrolls horizontally", () => {
    const rails = CODE.split("}")
      .filter((b) => /overflow-x:\s*auto/.test(b))
      .map((b) => ({
        selector: (b.split("{")[0] ?? "").trim().split("\n").pop()?.trim() ?? "?",
        contained: /overscroll-behavior-x:\s*contain/.test(b),
      }));
    // A floor, so deleting rails cannot make this vacuously true (the W8 lesson: a glob alone
    // passes on an empty directory).
    expect(rails.length).toBeGreaterThanOrEqual(7);
    expect(rails.filter((r) => !r.contained).map((r) => r.selector)).toEqual([]);
  });

  it("never uses the SHORTHAND, which would contain the vertical axis too", () => {
    // `overscroll-behavior:` (no axis) anywhere is the failure — most destructively on the root,
    // where it would kill the platform's own vertical pull for every surface at once.
    const shorthand = [...CODE.matchAll(/(^|[;{\s])overscroll-behavior:\s*[^;]+/g)].map((m) =>
      m[0].trim(),
    );
    expect(shorthand).toEqual([]);
  });

  it("keeps the 16px iOS input floor, which is the other rule no test could see", () => {
    // Ported from the delivery repo, where iOS auto-zooming on a <16px input — and never zooming
    // back out — was a real checkout defect. It has sat here unguarded since P5.2.
    const inputRule = CODE.split("}").find((b) =>
      /^\s*input,\s*\n?\s*textarea,\s*\n?\s*select/m.test(b),
    );
    expect(inputRule).toBeDefined();
    expect(inputRule!).toMatch(/font-size:\s*16px/);
  });
});
