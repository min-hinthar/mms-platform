import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cssDeclarations } from "./css-declarations";

/**
 * Phase 2c · review fixes · pad2 — two stylesheet rules of the order pad (DESIGN-LANGUAGE §28) that
 * no render can see: jsdom has no `:focus-visible` and no layout. Parsed through the shared walker
 * (comments stripped, each declaration bound to its selector and its @media block — LEARNINGS #60).
 *
 *  1. A programmatic focus target keeps the global `:focus-visible` ring (P10). The pad moves focus
 *     to the ticket's heading ("Skip to the order", the phone's view flip, the focus catch-all); a
 *     bare `.pad-ticket-title { outline: none }` sits later than `:focus-visible` at equal
 *     specificity, so it WON, and the keyboard landing showed no ring at all.
 *  2. The reflow tier (WCAG 1.4.10, the open question on 320×256 CSS px — a laptop at 400% zoom, or
 *     a small phone in landscape): the app shell is exactly the viewport with `overflow: hidden`,
 *     and the bar, the tools and the dock alone fill 256px, leaving the panes nothing. Below the
 *     tier's height the shell becomes a document that scrolls as a whole.
 */
const DECLS = cssDeclarations(
  readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8"),
);

describe("the pad's focus targets keep the focus-visible ring (P10)", () => {
  it("no .pad-* rule turns the outline off except for a focus that is NOT focus-visible", () => {
    const offs = DECLS.filter(
      (d) =>
        d.prop === "outline" &&
        /^(none|0)$/.test(d.value) &&
        d.selector.split(",").some((s) => /\.pad-/.test(s)),
    );
    // MUTATION: `.pad-ticket-title { outline: none }` — the keyboard landing on the order shows no
    // ring (it beats the global `:focus-visible` by source order); red.
    const bare = offs.flatMap((d) =>
      d.selector
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /\.pad-/.test(s) && !s.includes(":not(:focus-visible)")),
    );
    expect(bare).toEqual([]);
  });
});

describe("the reflow tier — at 256px tall the pad scrolls as a document (open question)", () => {
  /** The height-only tiers that reshape the pad's shell (never a width tier, which would move the
   *  tablet or the desktop) — selected by what they DECLARE, not by position. */
  const tiers = [
    ...new Set(
      DECLS.filter((d) => d.selector === ".pad-main")
        .map((d) => d.media)
        .filter((m): m is string => m !== null && /^@media \(max-height: [\d.]+em\)$/.test(m)),
    ),
  ];
  const inTier = (sel: string, prop: string) =>
    DECLS.filter((d) => d.selector === sel && d.prop === prop && d.media !== null)
      .filter((d) => tiers.includes(d.media!))
      .map((d) => d.value);

  it("exists, and reaches 256px (16em) — the WCAG 1.4.10 height", () => {
    expect(tiers).toHaveLength(1);
    const em = Number(/max-height: ([\d.]+)em/.exec(tiers[0]!)![1]);
    expect(em).toBeGreaterThanOrEqual(16);
  });

  it("lets the shell grow and the page scroll, and the panes stop scrolling on their own", () => {
    // MUTATION: drop the tier — the panes are clipped to nothing under the bar, the tools and the
    // dock, and the order cannot be reached at 400% zoom; red.
    expect(inTier(".pad-main", "height")).toEqual(["auto"]);
    expect(inTier(".pad-main", "overflow")).toEqual(["visible"]);
    // Each pane's VERTICAL overflow is visible. The ticket takes the shorthand: its base rule is
    // `overflow: hidden`, and `overflow-y: visible` beside a hidden x-axis computes to `auto` — it
    // would stay a scroll box of its own.
    const seen = (sel: string) =>
      DECLS.filter((d) => d.selector.split(",").some((s) => s.trim() === sel))
        .filter((d) => d.media !== null && tiers.includes(d.media))
        .map((d) => `${d.prop}: ${d.value}`);
    expect(seen(".pad-tiles")).toEqual(["overflow-y: visible"]);
    expect(seen(".pad-ticket-body")).toEqual(["overflow-y: visible"]);
    expect(seen(".pad-ticket")).toEqual(["overflow: visible"]);
  });
});
