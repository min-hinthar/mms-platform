import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cssDeclarations } from "./css-declarations";
import {
  TILL_COLUMNS_PX,
  TILL_GUTTER_PX,
  TILL_HERO_MAX_CHARS,
  TILL_MEDIA,
  TILL_MIN_HEIGHT_EM,
  TILL_PAD_X_PX,
  tillBandsAt,
  tillCancelSays,
  tillDoorLandsInert,
  tillHeroTier,
  tillMinWidthEm,
  tillMinWidthPx,
  tillSlipDiverged,
  tillSlipFrom,
} from "./till";

/**
 * PD6 · counter-floor — the till tray's pure rules, pinned. Red-first by mutant (verify:slice
 * `till/*`): each case names the mutation that reddens it.
 */

describe("where the till applies — the breakpoint is COMPUTED from the grid (Codex correction 8)", () => {
  it("the minimum width is the columns plus the tray's padding and gutters: 1262 + 64 + 40", () => {
    // Measured in the shell: node -e 'console.log(460+32+300+32+438 + 2*32 + 2*20)' → 1366.
    expect(TILL_COLUMNS_PX.reduce((a, b) => a + b, 0)).toBe(1262);
    expect(tillMinWidthPx()).toBe(1366);
    // 1366 / 16 = 85.375 (node -e 'console.log(1366/16)').
    expect(tillMinWidthEm()).toBe(85.375);
    // MUTATION till/min-width-drops-the-gutters → 1326: a 1340px viewport keys the till and clips
    // the GAVE column's tiles; red.
    expect(tillMinWidthPx()).toBe(1262 + 2 * TILL_PAD_X_PX + 2 * TILL_GUTTER_PX);
  });

  it("the ONE media query carries that width and the spec's height bound", () => {
    expect(TILL_MEDIA).toBe(`(min-width: 85.375em) and (min-height: ${TILL_MIN_HEIGHT_EM}em)`);
    expect(TILL_MIN_HEIGHT_EM).toBe(44);
  });

  it("the stylesheet keys `.till-sheet` on exactly that query, and draws the body on exactly those columns", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    const decls = cssDeclarations(css);
    // Every `.till-sheet` / `.till-body` declaration sits under the ONE media query — a till rule
    // outside it would key the layout on a width this module never computed.
    const till = decls.filter((d) => /\.till-(sheet|body|band|owe|tip|gave)\b/.test(d.selector));
    expect(till.length).toBeGreaterThan(0);
    const medias = new Set(till.map((d) => d.media));
    expect([...medias]).toEqual([`@media ${TILL_MEDIA}`]);
    // The body's tracks are the spec's columns: the fr columns in the spec's proportion, the gaps
    // in px — so `tillBandsAt` (fr scaled, gaps fixed) describes what the CSS draws.
    const body = till.find(
      (d) => d.selector === ".till-body" && d.prop === "grid-template-columns",
    );
    expect(body).toBeDefined();
    const [owe, gap1, tip, gap2, gave] = TILL_COLUMNS_PX;
    expect(body!.value.replace(/\s+/g, " ")).toBe(
      `minmax(0, ${owe}fr) ${gap1}px minmax(0, ${tip}fr) ${gap2}px minmax(0, ${gave}fr)`,
    );
    // The band's row shares the tracks, so Cancel + Take (tracks 1–3) and the readout (track 5)
    // land where the body's columns do — the geometry `tillDoorLandsInert` reasons over.
    const band = till.find(
      (d) => d.selector === ".till-band-row" && d.prop === "grid-template-columns",
    );
    expect(band?.value.replace(/\s+/g, " ")).toBe(body!.value.replace(/\s+/g, " "));
    const readout = till.find(
      (d) => d.selector === ".till-band-row > .reg-change" && d.prop === "grid-column",
    );
    expect(readout?.value).toBe("5");
    const actions = till.find(
      (d) => d.selector === ".till-band-row > .till-band-actions" && d.prop === "grid-column",
    );
    expect(actions?.value).toBe("1 / 4");
  });
});

describe("tillHeroTier — a figure past seven characters steps down one tier, never wraps", () => {
  it("'$30.11' (6) and '#3F9A2C' (7) hold their tier; '$9,999.99' (9) steps down", () => {
    expect(TILL_HERO_MAX_CHARS).toBe(7);
    expect(tillHeroTier("$30.11", "hand")).toBe("hand");
    expect(tillHeroTier("#3F9A2C", "pass")).toBe("pass");
    // MUTATION till/hero-never-steps-down: the 128px Change wraps mid-value; red.
    expect(tillHeroTier("$9,999.99", "hand")).toBe("pass");
    expect(tillHeroTier("$9,999.99", "pass")).toBe("display");
    // `display` is the floor.
    expect(tillHeroTier("$9,999.99", "display")).toBe("display");
    // Exactly seven holds; eight steps. "$999.99".length === 7 (node -e).
    expect(tillHeroTier("$999.99", "pass")).toBe("pass");
    expect(tillHeroTier("$1000.00", "pass")).toBe("display");
  });
});

describe("the slip — frozen with the quote, diverged when the cart changes (Codex round 3 on m6)", () => {
  const L = (id: string, qty: number) => ({ id, qty });
  it("same lines, same quantities: not diverged", () => {
    expect(tillSlipDiverged([L("a", 1), L("b", 2)], [L("b", 2), L("a", 1)])).toBe(false);
  });
  it("a line added, a line gone, or a quantity changed: diverged", () => {
    // MUTATION till/slip-ignores-a-new-line (count check dropped): a colleague's add shows beside
    // the old due; red.
    expect(tillSlipDiverged([L("a", 1)], [L("a", 1), L("c", 1)])).toBe(true);
    expect(tillSlipDiverged([L("a", 1), L("c", 1)], [L("a", 1)])).toBe(true);
    // MUTATION till/slip-ignores-qty (qty compare dropped): 1× becomes 2× under the frozen due; red.
    expect(tillSlipDiverged([L("a", 1)], [L("a", 2)])).toBe(true);
    // A swap at the same count is still a change.
    expect(tillSlipDiverged([L("a", 1)], [L("z", 1)])).toBe(true);
  });
  it("tillSlipFrom drops a voided line, keeps a comped one, and leads Burmese on a Burmese console", () => {
    const lines = [
      { id: "a", qty: 1, name: "Mohinga", nameMy: "မုန့်ဟင်းခါး", state: "draft" as const },
      { id: "v", qty: 1, name: "Tea", nameMy: null, state: "voided" as const },
      { id: "c", qty: 2, name: "Samosa", nameMy: null, state: "fired" as const },
    ];
    const my = tillSlipFrom(lines, "my");
    // MUTATION till/slip-lists-a-voided-line: a dish the kitchen was told to drop rides the slip
    // beside a due that excludes it; red.
    expect(my.map((l) => l.id)).toEqual(["a", "c"]);
    expect(my[0]).toEqual({
      id: "a",
      qty: 1,
      lead: { text: "မုန့်ဟင်းခါး", lang: "my" },
      echo: { text: "Mohinga", lang: "en" },
    });
    // No Burmese in the catalog: the English leads, marked, with no echo (padDishName's rule).
    expect(my[1]).toEqual({ id: "c", qty: 2, lead: { text: "Samosa", lang: "en" }, echo: null });
    expect(tillSlipFrom(lines, "en")[0]!.lead).toEqual({ text: "Mohinga", lang: "en" });
  });
});

describe("tillCancelSays — reassurance only where doubt existed and was resolved as nothing", () => {
  it("says it after a refused or stalled attempt; never after waiting, unknown, landed, or a plain cancel", () => {
    expect(tillCancelSays("refused")).toBe(true);
    expect(tillCancelSays("stalled")).toBe(true);
    // MUTATION till/cancel-reassures-a-waiting-payment: "nothing was taken" over a settle that may
    // still be recorded — the cashier takes the money twice; red.
    expect(tillCancelSays("waiting")).toBe(false);
    expect(tillCancelSays("unknown")).toBe(false);
    expect(tillCancelSays("landed")).toBe(false);
    // Appendix C: a routine cancel stays silent.
    expect(tillCancelSays("none")).toBe(false);
  });
});

describe("the double-tap guard, by geometry (decision 6)", () => {
  it("at 1366 the bands are the spec's px: OWE x52–512 · TIP x544–844 · GAVE x876–1314, padding to 1346", () => {
    const b = tillBandsAt(1366);
    expect(b.tray).toEqual({ x0: 20, x1: 1346 });
    expect(b.owe).toEqual({ x0: 52, x1: 512 });
    expect(b.tip).toEqual({ x0: 544, x1: 844 });
    expect(b.gave).toEqual({ x0: 876, x1: 1314 });
    expect(b.padRight).toEqual({ x0: 1314, x1: 1346 });
  });
  it("the pad's door (x962–1346, the dock at 1366) lands on the GAVE column and the padding: inert", () => {
    // picked-m6-1 ② Dock: "Primary xl 64 … x962–1346". MUTATION till/door-spot-admits-the-band-buttons
    // (the GAVE bound widened to the tray's left edge): Take's x244–844 span would read inert; red.
    expect(tillDoorLandsInert({ x0: 962, x1: 1346 }, 1366)).toBe(true);
    expect(tillDoorLandsInert({ x0: 244, x1: 844 }, 1366)).toBe(false);
    // The pane's door (picked-m2-3 ③: Take cash at x907–1338) opens the SAME viewport-wide tray,
    // and sits inside the GAVE column (x876–1314) and the padding: inert too.
    expect(tillDoorLandsInert({ x0: 907, x1: 1338 }, 1366)).toBe(true);
    // A door that starts one pixel inside the TIP/GAVE gap is not admitted.
    expect(tillDoorLandsInert({ x0: 875, x1: 1338 }, 1366)).toBe(false);
  });
  it("below the minimum width nothing is inert by this rule — the single-column sheet serves there", () => {
    expect(tillDoorLandsInert({ x0: 962, x1: 1346 }, 1365)).toBe(false);
  });
  it("wider viewports scale the fr columns and keep the gaps: the door stays inert at 1920", () => {
    const b = tillBandsAt(1920);
    expect(b.tip.x0 - b.owe.x1).toBe(32);
    expect(b.gave.x0 - b.tip.x1).toBe(32);
    // The dock at 1920 keeps its right edge on the gutter and its 384px width (962→1346 at 1366).
    expect(tillDoorLandsInert({ x0: 1920 - 20 - 384, x1: 1900 }, 1920)).toBe(true);
  });
});
