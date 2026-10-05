import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Codex round 3 on #312 (P2) — the staff `scroll-padding-top` reserve, guarded as the overscroll
 * contract is: a CSS cascade nothing else can see.
 *
 * Phase 3a's zone strip (`CounterZoneStrip`) is sticky UNDER the staff bar, so a `#zone` jump must
 * land a heading below bar AND strip. The first fix declared that on `:root:has(.staff-zone-strip)`
 * — and never won: `:root:has(.staff-bar)` is declared LATER at the SAME specificity (`:has()` takes
 * its argument's), at both widths, so the strip's height was overwritten on every console page that
 * has a bar, which is all of them. The reserve therefore lives in the bar's rules, and the strip only
 * publishes its height (`--zone-strip-h`, 0 where there is no strip).
 *
 * The candidate is selected by what it DECLARES (LEARNINGS #60): every block whose selector is the
 * bar's and which declares `scroll-padding-top` must add the strip's variable, and no OTHER block
 * may declare a `scroll-padding-top` built on `--staff-bar-h` — a second home for it is exactly the
 * same-specificity race this exists to end.
 */
const CSS = readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8");
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

type Block = { selector: string; body: string };
const blocks: Block[] = CODE.split("}")
  .map((b) => {
    const at = b.lastIndexOf("{");
    if (at === -1) return null;
    return {
      selector: (b.slice(0, at).trim().split("\n").pop() ?? "").trim(),
      body: b.slice(at + 1),
    };
  })
  .filter((b): b is Block => b !== null);

const declares = (b: Block, prop: string) => new RegExp(`(^|[;\\s])${prop}\\s*:`).test(b.body);
/** EVERY declaration of `prop` in the block, in order. CSS applies the LAST; the first draft of this
 *  file read the FIRST (`match` without `g`), so a later duplicate inside the same block could drop
 *  the strip's height with every assertion green (deep pass on #312). */
const values = (b: Block, prop: string) =>
  [...b.body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) =>
    m[1]!.trim(),
  );
/** The ONE declaration — a duplicate is refused, never resolved by position. */
const value = (b: Block, prop: string) => {
  const all = values(b, prop);
  if (all.length > 1)
    throw new Error(
      `${b.selector} declares ${prop} ${all.length} times — the cascade keeps the last; one home`,
    );
  return all[0] ?? null;
};
/** The longhand and every alias that sets the same edge — a `scroll-padding` shorthand or the
 *  logical `scroll-padding-block-start` re-opens the race under another name. */
const TOP_ALIASES = ["scroll-padding-top", "scroll-padding-block-start", "scroll-padding"];

describe("the staff scroll-padding reserve", () => {
  const barRules = blocks.filter(
    (b) => b.selector === ":root:has(.staff-bar)" && declares(b, "scroll-padding-top"),
  );
  it("the bar's rules carry the zone strip's height — at every width", () => {
    // Two: the tablet rule and the two-row phone rule. A floor, so deleting one cannot pass.
    expect(barRules.length).toBeGreaterThanOrEqual(2);
    for (const r of barRules) {
      expect(value(r, "scroll-padding-top")).toContain("var(--staff-bar-h");
      expect(value(r, "scroll-padding-top")).toContain("var(--zone-strip-h, 0px)");
    }
  });
  it("the strip publishes its height and declares no reserve of its own", () => {
    const strip = blocks.filter((b) => b.selector === ":root:has(.staff-zone-strip)");
    expect(strip.length).toBe(1);
    expect(declares(strip[0]!, "--zone-strip-h")).toBe(true);
    expect(declares(strip[0]!, "scroll-padding-top")).toBe(false);
  });
  it("no other block builds a scroll-padding-top — or its shorthand, or its logical alias — on the bar's height", () => {
    const others = blocks.filter(
      (b) =>
        b.selector !== ":root:has(.staff-bar)" &&
        TOP_ALIASES.some((prop) => values(b, prop).some((v) => v.includes("--staff-bar-h"))),
    );
    expect(others.map((b) => b.selector)).toEqual([]);
  });
  it("the bar's rules set the top edge ONCE each, by the longhand alone", () => {
    for (const r of barRules) {
      expect(values(r, "scroll-padding-top")).toHaveLength(1);
      expect(values(r, "scroll-padding")).toEqual([]);
      expect(values(r, "scroll-padding-block-start")).toEqual([]);
    }
  });
});

describe("the diner tab bar's bottom reserve (deep pass on #312)", () => {
  // The bar is a viewport-fixed bottom overlay; `body { padding-bottom }` protects only the
  // document's END. A focus scroll or `scrollIntoView` lands its target flush with the viewport's
  // bottom — under the bar (WCAG 2.4.11) — unless the root reserves the height as scroll padding,
  // exactly as the top chrome does with `scroll-padding-top`.
  const tabRoots = blocks.filter((b) => b.selector === ":root:has(.diner-tabs)");
  it("exactly one `:root:has(.diner-tabs)` rule declares a `scroll-padding-bottom` built on the bar's height", () => {
    const reserve = tabRoots.filter((b) =>
      values(b, "scroll-padding-bottom").some((v) => v.includes("var(--tabs-h")),
    );
    expect(reserve).toHaveLength(1);
    expect(value(reserve[0]!, "scroll-padding-bottom")).toContain("env(safe-area-inset-bottom");
  });
  it("print zeroes it beside the body reserve — the bar is not drawn on paper", () => {
    // The `@media print` block whose own braces enclose the bar's hiding rule, found by matching
    // braces — a split on the at-rule's text would hand back everything up to the NEXT one.
    const atRules: string[] = [];
    let from = 0;
    for (;;) {
      const at = CODE.indexOf("@media print", from);
      if (at === -1) break;
      const open = CODE.indexOf("{", at);
      let depth = 0;
      let i = open;
      for (; i < CODE.length; i++) {
        if (CODE[i] === "{") depth++;
        else if (CODE[i] === "}" && --depth === 0) break;
      }
      atRules.push(CODE.slice(open, i + 1));
      from = i + 1;
    }
    const bar = atRules.find((body) => /\.diner-tabs\s*\{[^}]*display:\s*none/.test(body));
    expect(bar).toBeDefined();
    expect(bar!).toMatch(/:root:has\(\.diner-tabs\)\s*\{[^}]*scroll-padding-bottom:\s*0\s*;/);
  });
});
