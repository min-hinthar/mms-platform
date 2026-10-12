import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cssDeclarations } from "./css-declarations";

/**
 * PD12 · m12 risk 9 — the step guide's sticky foot (dots · Back/Next · footer) and the counter pane.
 *
 * MEASURED, not reasoned (LEARNINGS #264; headless Chromium at 1366×1024 over the built CSS, the
 * counter guide in place in the 464px pane column — 431px card — and both guides in the 34rem
 * Help sheet, EN and Burmese, steps 1–5, root at 100% and 200%). The pane added
 * `--guide-foot-bottom: calc(var(--tap-bump) + var(--s8) + …)` to lift the foot "above the pane's
 * own reserve for the lane's thumb-zone pill". But a sticky box's limit is its scroller's CONTENT
 * edge: the pane's bottom padding (that very reserve) is already outside it. The inset counted the
 * reserve twice, and on every counter step the foot rode 96px above the card's own end:
 *
 *   EN step 1 · 100%   card 108–707, foot 436–611   — the title (457–483) and the sentence
 *                                                      (495–519) under the foot; the pane does
 *                                                      not scroll (711 of 711), so nothing reveals
 *                                                      them
 *   MY step 3 · 100%   card 108–874, foot 582–778   — the sentence (521–665) under it
 *   MY step 3 · 200%   scrolled to the END: foot 544–816 still over the sentence (283–626)
 *
 * With the inset at 0 the same pages measure: foot 531–706 / 677–873 (flush with the card's end),
 * nothing covered, and at the scroll end the foot's bottom (911) sits above the pane's content edge
 * (912) — clear of the reserve, so the pill's band is still never under it. Next stayed in view in
 * every one of the 100 measured states either way; the defect was the words, not the button.
 *
 * RED-FIRST: the shipped rule restored (`.staff-split-pane .staff-guide { --guide-foot-bottom: … }`
 * with `bottom: var(--guide-foot-bottom, 0px)`) fails both assertions below.
 */
const CSS = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
const DECLS = cssDeclarations(CSS);
const members = (selector: string) => selector.split(",").map((s) => s.trim());
const footRules = DECLS.filter(
  (d) => d.prop === "bottom" && members(d.selector).some((s) => /\.staff-guide-foot$/.test(s)),
);

describe("the step guide's sticky foot — flush with its scroller's content edge, in every host", () => {
  it("ONE `bottom` for the foot, and it is 0 — no inset, no custom property feeding one", () => {
    // A floor: the foot must still be sticky at the bottom, or Next scrolls away (risk 9's point).
    expect(footRules.map((d) => [d.selector, d.value])).toEqual([[".staff-guide-foot", "0"]]);
    expect(
      DECLS.find((d) => d.prop === "position" && members(d.selector).includes(".staff-guide-foot"))
        ?.value,
    ).toBe("sticky");
  });

  it("nothing re-lifts it inside the counter's pane — the pane's padding IS the pill's reserve", () => {
    const lift = DECLS.filter(
      (d) =>
        /\.staff-split-pane/.test(d.selector) &&
        (/^--guide-foot/.test(d.prop) ||
          (/\.staff-guide-foot/.test(d.selector) &&
            /^(bottom|inset|inset-block|margin-bottom)/.test(d.prop))),
    );
    expect(lift.map((d) => `${d.selector} { ${d.prop}: ${d.value} }`)).toEqual([]);
    // …and the reserve the foot relies on is still there: the pane's own bottom padding names the
    // thumb-zone band. Remove it and the foot WOULD need a lift again — this line says so.
    const pad = DECLS.filter(
      (d) => d.selector === ".staff-split-pane" && d.prop === "padding" && d.media !== null,
    );
    expect(pad.length).toBe(1);
    expect(pad[0]!.value).toContain("var(--tap-bump)");
  });
});
