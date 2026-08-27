import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * M126 — AT MOST ONE FULL-VIEWPORT `backdrop-filter` MAY EXIST IN THE STYLESHEET.
 *
 * A backdrop buffer scales with the filtered element's AREA, not with its blur radius, so a
 * `position: fixed; inset: 0` pane costs ~20 MB on a 430x932 DPR3 phone regardless of how gentle
 * the blur is. Two of them alive at once is ~41 MB of backing store — the pattern that OOM-crashed
 * an iOS WebKit tab in this product before, and the reason a mobile GPU budget existed at all.
 *
 * The defect this exists to prevent was REAL and was in the first draft of the glass layer, not
 * hypothetical: `.mms-scrim`, `.tier-up` and `.merge-beat` were given the defocus together, and
 * `MergeRedeemer` (apps/qr/app/account/page.tsx:48) and `RewardsHub` -> `TierUpCelebration`
 * (:138) are BOTH rendered on /account — with MergeRedeemer's own comment stating that it
 * refreshes the hub so merged Stars appear, i.e. the exact path that can award a tier and mount
 * the second overlay. Nothing in the type system, the linter, the contrast audit or `verify:slice`
 * can see a stylesheet, and the failure mode is a dead tab on a diner's phone rather than a red
 * test — so it gets a mechanical guard.
 *
 * RED-FIRST: adding `.tier-up` back to the `.mms-scrim` defocus rule fails
 * "at most one full-viewport backdrop-filter" with `.mms-scrim, .tier-up` named; removing
 * `.mms-scrim`'s own filter fails the floor. Both restored.
 *
 * NOTE ON SCOPE, so nobody reads more into a green run than it earns: this checks the STYLESHEET,
 * not the DOM. Radix portals each `Dialog.Overlay` into its own wrapper, so two independently-open
 * sheets would still render two `.mms-scrim` elements. No two sheets in this app are openable at
 * once today (no sheet component renders another), but that is a fact about the components, not
 * something this file proves.
 */
const CSS = readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8");
/** The dial's own declarations live one package over — the same seam `check-theme-parity` crosses. */
const TOKENS = readFileSync(
  path.join(__dirname, "..", "..", "..", "packages", "ui", "src", "tokens.css"),
  "utf8",
);
/** Comments name these selectors in prose; a guard a comment can satisfy reads the wrong thing. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** Selectors whose rule sets both `position: fixed` and `inset: 0` — i.e. viewport-sized panes. */
function fullViewportSelectors(): Set<string> {
  const out = new Set<string>();
  for (const block of CODE.split("}")) {
    const [head, body] = [block.split("{")[0] ?? "", block.split("{")[1] ?? ""];
    if (!/position:\s*fixed/.test(body) || !/inset:\s*0/.test(body)) continue;
    for (const sel of head.split(",")) {
      const s = sel.trim().split(/\s+/).pop();
      if (s?.startsWith(".")) out.add(s);
    }
  }
  return out;
}

/** Selectors that any rule gives a non-`none` `backdrop-filter`. */
function backdropFiltered(): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of CODE.split("}")) {
    const [head, body] = [block.split("{")[0] ?? "", block.split("{")[1] ?? ""];
    const m = /(?:^|[\s;])backdrop-filter:\s*([^;]+);/.exec(body);
    if (!m || /^\s*none\s*$/.test(m[1] ?? "")) continue;
    for (const sel of head.split(",")) {
      const s = sel.trim().split(/\s+/).pop();
      if (s?.startsWith(".")) out.set(s, (m[1] ?? "").trim());
    }
  }
  return out;
}

describe("the full-viewport blur contract", () => {
  const viewport = fullViewportSelectors();
  const filtered = backdropFiltered();

  it("finds the viewport-sized panes it is supposed to be watching", () => {
    // A floor, so deleting rules cannot make the real assertion vacuously true (the W8 lesson:
    // a glob alone passes on an empty directory). These three are the fixed inset:0 overlays.
    for (const s of [".mms-scrim", ".tier-up", ".merge-beat"]) expect(viewport).toContain(s);
  });

  it("gives AT MOST ONE full-viewport selector a backdrop-filter", () => {
    const heavy = [...filtered.keys()].filter((s) => viewport.has(s)).sort();
    expect(heavy).toEqual([".mms-scrim"]);
  });

  it("still applies the defocus to that one — the guard is a cap, not a ban", () => {
    expect(filtered.get(".mms-scrim")).toBe("var(--fx-glass-far)");
  });

  it("routes every backdrop-filter through the --fx-* dial, so `off` really frees the buffer", () => {
    // `blur(0px)` still allocates; `none` does not. The dial can only re-point a whole function
    // list, so a rule that hard-codes its filter silently opts out of the escape hatch.
    const raw = [...filtered.entries()].filter(([, v]) => !v.startsWith("var(--fx-"));
    expect(raw).toEqual([]);
  });

  it("declares no --fx-glass-* rung that nothing consumes", () => {
    // The other direction, and it caught a real one: `--fx-glass-near` (plus --glass-blur-near and
    // --glass-sat-near behind it) survived the decision NOT to frost the sheet head, leaving three
    // tokens documenting a surface that does not exist. That is the same defect as a comment
    // describing code that does not — it just fails silently instead of misleading a reader once.
    const declared = [...TOKENS.matchAll(/(--fx-glass-[\w-]+)\s*:/g)].map((m) => m[1] as string);
    expect(declared.length).toBeGreaterThan(0); // floor: a renamed prefix must not pass vacuously
    const unused = [...new Set(declared)].filter((t) => !CSS.includes(`var(${t})`)).sort();
    expect(unused).toEqual([]);
  });
});
