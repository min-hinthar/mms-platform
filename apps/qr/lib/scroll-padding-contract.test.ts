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
const value = (b: Block, prop: string) =>
  b.body.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`))?.[1]?.trim() ?? null;

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
  it("no other block builds a scroll-padding-top on the bar's height", () => {
    const others = blocks.filter(
      (b) =>
        b.selector !== ":root:has(.staff-bar)" &&
        (value(b, "scroll-padding-top") ?? "").includes("--staff-bar-h"),
    );
    expect(others.map((b) => b.selector)).toEqual([]);
  });
});
