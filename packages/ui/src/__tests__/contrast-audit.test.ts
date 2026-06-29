import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contrast audit (M5·P5.5, ported from the delivery repo) — locks in the WCAG-AA claim the
 * `tokens.css` header makes ("AA verified across the text×surface matrix"). Unlike the delivery
 * version (which hardcoded token hex as fixtures and silently passed when a token regressed), this
 * **parses `tokens.css` at test time**, so a token edit is checked automatically — no fixture to
 * refresh. The combo DEFINITIONS below (which text sits on which surface, and the expected verdict)
 * are the semantic fixtures; the hex values come from the real file.
 *
 * Threshold: AA 4.5:1 for normal text. Badge labels are 12px/700 → still "normal" weight (the 3.0
 * large-text exemption needs ≥18.66px-bold), so 4.5 applies to the tinted accent/status text too.
 */

// ── WCAG sRGB contrast core ──
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
/** Composite an `alpha`-opacity foreground over a solid background → effective hex. QR's tints are
 *  `color-mix(in srgb, <hue> N%, transparent)` painted over a surface, which is exactly this blend. */
function flattenAlpha(fgHex: string, alpha: number, bgHex: string): string {
  const [fr, fg, fb] = hexToRgb(fgHex);
  const [br, bg, bb] = hexToRgb(bgHex);
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(mix(fr, br))}${to2(mix(fg, bg))}${to2(mix(fb, bb))}`;
}
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ── tokens.css parser (resolves var() aliases like `--ac-strong: var(--ac)` in dark) ──
const css = readFileSync(fileURLToPath(new URL("../tokens.css", import.meta.url)), "utf8");

function parseBlock(selector: string): Record<string, string> {
  // Grabs the FIRST matching `selector { … }` block. Relies on tokens.css having no nested braces
  // inside `:root`/`.dark` (true — CSS var values have none) and the main block preceding the
  // `@media (prefers-reduced-motion){ :root{…} }` override. Re-check if tokens.css is restructured.
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`);
  // Strip CSS comments first — a multi-line `/* … */` between declarations contains `;`/`:` that
  // otherwise corrupt the declaration scan (the token right after a comment failed to parse).
  const body = (re.exec(css)?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const map: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const name = m[1];
    const val = m[2];
    if (name && val) map[name] = val.trim();
  }
  return map;
}
function tok(map: Record<string, string>, name: string): string {
  let v = map[name] ?? "";
  for (let i = 0; i < 5 && v.startsWith("var("); i++) {
    const ref = v.slice(4, -1).trim();
    const next = map[ref];
    if (next === undefined) break;
    v = next.trim();
  }
  return v;
}

const light = parseBlock(":root");
const dark = parseBlock(".dark");

// Self-check the parser found the token block.
it("parses tokens.css", () => {
  expect(tok(light, "--cd")).toMatch(/^#/);
  expect(tok(dark, "--cd")).toMatch(/^#/);
  expect(tok(dark, "--ac-strong")).toBe(tok(dark, "--ac")); // var() alias resolved
});

// Sanity-check the contrast math (mirrors the delivery suite).
it("contrast math is correct", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
});

type Combo = { name: string; fg: string; bg: string };

function combos(map: Record<string, string>, theme: "light" | "dark") {
  const pg = tok(map, "--pg");
  const sf = tok(map, "--sf");
  const cd = tok(map, "--cd");
  const ac = tok(map, "--ac");
  const acStrong = tok(map, "--ac-strong");
  // Badge tints = `color-mix(in srgb, <hue> N%, transparent)` composited over the surface BEHIND the
  // badge. The accent badge renders on more than --cd cards (the announced FloorDetailLive "Tab"
  // badge sits on the page/section surface), so assert the tint over each surface — --sf is tightest.
  const accentTintCd = flattenAlpha(ac, 0.14, cd);
  const accentTintPg = flattenAlpha(ac, 0.14, pg);
  const accentTintSf = flattenAlpha(ac, 0.14, sf);
  const goldTint = flattenAlpha(tok(map, "--gold"), 0.16, cd);
  const jadeTint = flattenAlpha(tok(map, "--jade"), 0.16, cd);

  // Must clear 4.5:1 (real production text×surface pairings).
  const pass: Combo[] = [
    { name: "tx on cd", fg: tok(map, "--tx"), bg: cd },
    // R1: --surface-elevated is the theme-true white/dark chrome that floats OVER cards/photos
    // (favorite heart, close X, add ✓). Body/icon text on it must stay AA in both themes.
    { name: "tx on surface-elevated", fg: tok(map, "--tx"), bg: tok(map, "--surface-elevated") },
    { name: "t2 on pg", fg: tok(map, "--t2"), bg: pg },
    { name: "t2 on sf", fg: tok(map, "--t2"), bg: sf },
    { name: "t2 on cd", fg: tok(map, "--t2"), bg: cd },
    { name: "t3 on pg", fg: tok(map, "--t3"), bg: pg },
    { name: "t3 on sf", fg: tok(map, "--t3"), bg: sf },
    { name: "t3 on cd", fg: tok(map, "--t3"), bg: cd },
    // Plain --ac IS legible as text on the solid page/card surfaces (FloorStatusChip "ordering" state,
    // section eyebrows) — but NOT on --sf or the tints (see the negative guards). Lock the tight ones.
    { name: "ac on pg", fg: ac, bg: pg },
    { name: "ac on cd", fg: ac, bg: cd },
    // Accent badge text (--ac-strong) on the 14% tint over each surface the badge can sit on.
    { name: "ac-strong on accent tint /cd", fg: acStrong, bg: accentTintCd },
    { name: "ac-strong on accent tint /pg", fg: acStrong, bg: accentTintPg },
    { name: "ac-strong on accent tint /sf", fg: acStrong, bg: accentTintSf },
    { name: "gold-strong on gold tint", fg: tok(map, "--gold-strong"), bg: goldTint },
    { name: "jade-strong on jade tint", fg: tok(map, "--jade-strong"), bg: jadeTint },
    { name: "oa on solid ac", fg: tok(map, "--oa"), bg: ac },
    { name: "ok on okb", fg: tok(map, "--ok"), bg: tok(map, "--okb") },
    { name: "warn on warnb", fg: tok(map, "--warn"), bg: tok(map, "--warnb") },
  ];

  // Anti-regression (LIGHT only): the vivid hues must STAY below 4.5 as text — this is why the
  // `-strong` text variants exist. These are PROPHYLACTIC (no live site uses plain `--ac`/`--gold` as
  // text here — they'd fail); the guard catches a future call site that reverts to the vivid hue and
  // only LOOKS fine. In DARK they're moot — `--ac-strong`/`--gold-strong` alias the legible bright hue.
  const fail: Combo[] =
    theme === "light"
      ? [
          { name: "plain ac on accent tint", fg: ac, bg: accentTintCd },
          { name: "plain ac on sf", fg: ac, bg: sf },
          { name: "plain gold on gold tint", fg: tok(map, "--gold"), bg: goldTint },
        ]
      : [];
  return { pass, fail };
}

for (const [theme, map] of [
  ["light", light],
  ["dark", dark],
] as const) {
  const { pass, fail } = combos(map, theme);
  describe(`${theme} theme — AA text contrast`, () => {
    it.each(pass)("$name clears 4.5:1", ({ fg, bg }) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
    if (fail.length > 0) {
      it.each(fail)("$name stays below 4.5:1 (use the -strong variant as text)", ({ fg, bg }) => {
        expect(contrastRatio(fg, bg)).toBeLessThan(4.5);
      });
    }
  });
}
