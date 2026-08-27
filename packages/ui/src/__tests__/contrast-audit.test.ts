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
/**
 * `color-mix(in oklab, <hue> N%, <SOLID colour>)` → effective hex.
 *
 * ⚠️ NOT interchangeable with `flattenAlpha`. Mixing a hue with `transparent` is premultiplied, so
 * the interpolation space cancels and sRGB alpha compositing gives the identical result — that is
 * why the tint recipes above can use `flattenAlpha` even though the CSS says `oklab`. But mixing
 * against an OPAQUE second colour (`.wallet-chip`'s `color-mix(in oklab, var(--chip-tint) 12%,
 * var(--cd))`) genuinely interpolates in OKLab and lands somewhere sRGB compositing does not. That
 * form was unguarded, and it is where the tightest real failure lived.
 */
function mixOklab(hexA: string, weight: number, hexB: string): string {
  const srgbToLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const linearToSrgb = (c: number) =>
    c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  const toOklab = (hex: string): [number, number, number] => {
    const [r, g, b] = hexToRgb(hex).map((v) => srgbToLinear(v / 255)) as [number, number, number];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const [la, aa, ba] = toOklab(hexA);
  const [lb, ab, bb] = toOklab(hexB);
  const L = la * weight + lb * (1 - weight);
  const A = aa * weight + ab * (1 - weight);
  const B = ba * weight + bb * (1 - weight);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const to2 = (v: number) =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to2(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)}${to2(
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
  )}${to2(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)}`;
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
  // M83 — a missing token used to return "" and surface as `expected NaN to be >= 4.5`, a message
  // that names neither the token nor the reason. Every assertion here is about a real pair, so an
  // unresolvable one is a bug in the suite, not a contrast failure, and it should say so.
  if (!/^#[0-9a-fA-F]{3,8}$/.test(v))
    throw new Error(`tokens.css: ${name} did not resolve to a hex (got ${v || "nothing"})`);
  return v;
}

const light = parseBlock(":root");
/**
 * `.dark` OVERRIDES `:root`; it does not replace it.
 *
 * That is what the cascade does, and this map now says so. Some tokens are deliberately declared
 * once and never re-declared — `--ink` carries a comment in `tokens.css` explaining that it is a
 * CONSTANT deep ink precisely so dark text on a constant-bright fill stays legible in both themes —
 * so reading the raw `.dark` block alone reports them as missing. Before M83 no assertion happened
 * to touch one; the first that did (the email CTA's `--oa` on `--ink`) produced a `NaN`. Merging
 * makes the dark map mean what a browser means by it.
 *
 * ⚠️ **PROPHYLACTIC, and it cannot currently fail.** `--ink` is the only colour token `.dark` never
 * re-declares, and the one pair that reads it was made light-only in the same commit — so reverting
 * this merge leaves every test green. That is the repo's red-first rule pointing at itself: the
 * modelling is right and the guard is unfalsifiable today, so it is LABELLED rather than claimed.
 * M93 (a dark negative bucket) is what would give it teeth.
 */
const dark = { ...light, ...parseBlock(".dark") };

/**
 * W22d — the badge tint PERCENTAGES, read out of `badge.tsx` rather than transcribed.
 *
 * Everything else in this file derives from the real source; these three numbers were the exception,
 * copied by hand as 14/16/16. Nothing cross-checked them, so retuning `TONES` (or switching its
 * blend space) would move the shipped contrast while this suite kept asserting the old recipe and
 * stayed green — the "green for the wrong reason" class. The regex also pins the MIX SPACE: an
 * `in srgb` → `in oklab` edit against `transparent` happens to composite identically (premultiplied
 * alpha cancels the space), but against an opaque colour it does not, so the assumption is asserted
 * rather than assumed.
 */
const badgeSrc = readFileSync(fileURLToPath(new URL("../badge.tsx", import.meta.url)), "utf8");
function badgeTintPct(tone: string, hue: string): number {
  // The tone KEY and the token name differ for accent (`accent:` uses `var(--ac)`), so both are
  // named rather than assumed equal.
  const re = new RegExp(
    `${tone}:\\s*\\{[^}]*?color-mix\\(in srgb,\\s*var\\(--${hue}\\)\\s*(\\d+)%,\\s*transparent\\)`,
  );
  const m = re.exec(badgeSrc);
  if (!m?.[1]) throw new Error(`badge.tsx: no \`in srgb\` tint recipe found for tone "${tone}"`);
  return Number(m[1]) / 100;
}
const ACCENT_PCT = badgeTintPct("accent", "ac");
const GOLD_PCT = badgeTintPct("gold", "gold");
const JADE_PCT = badgeTintPct("jade", "jade");

it("reads the badge tint percentages out of badge.tsx", () => {
  // A self-check with a floor, not an equality: the point is that the numbers came from the file.
  // If a tone's recipe is renamed or restructured, `badgeTintPct` throws and this fails loudly
  // rather than silently falling back to a stale constant.
  for (const pct of [ACCENT_PCT, GOLD_PCT, JADE_PCT]) {
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(1);
  }
});

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
  const accentTintCd = flattenAlpha(ac, ACCENT_PCT, cd);
  const accentTintPg = flattenAlpha(ac, ACCENT_PCT, pg);
  const accentTintSf = flattenAlpha(ac, ACCENT_PCT, sf);
  const goldTint = flattenAlpha(tok(map, "--gold"), GOLD_PCT, cd);
  const jadeTint = flattenAlpha(tok(map, "--jade"), JADE_PCT, cd);
  // W22d — the REWARD TIER tints, which had no coverage at all even though `--ruby` is live on four
  // surfaces. `tierTint()` (apps/qr/lib/rewards-tiers.ts) is the one mapper: `fill` paints the dot,
  // glyph and border; `text` is `--<hue>-strong` and is rendered ON the tint. Two alpha recipes are
  // in production: 16% (AccountStatus' tier card) and 14% (its tier row), both over `--cd` — the
  // tightest of the three grounds, which is why only `--cd` is asserted here. WelcomeBackChooser
  // uses the same 16% recipe but over `.wb-chip`'s `--sf`, which is looser in both themes.
  const rubyStrong = tok(map, "--ruby-strong");
  const ruby = tok(map, "--ruby");
  const rubyTint16 = flattenAlpha(ruby, 0.16, cd);
  const rubyTint14 = flattenAlpha(ruby, 0.14, cd);
  // The wallet chip's star, whose background is the OPAQUE-second-colour oklab form — a different
  // blend from every tint above, and the only place the hover state changes the contrast. Hover is
  // the tighter of the two, so both are asserted rather than just the rest state.
  const chipRest = (hue: string) => mixOklab(hue, 0.12, cd);
  const chipHover = (hue: string) => mixOklab(hue, 0.18, cd);

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
    // W22d — ruby, previously uncovered on every surface.
    { name: "ruby-strong on ruby tint 16% /cd", fg: rubyStrong, bg: rubyTint16 },
    { name: "ruby-strong on ruby tint 14% /cd", fg: rubyStrong, bg: rubyTint14 },
    // W22d — the wallet chip star, per tier, rest AND hover (the oklab-over-opaque blend).
    { name: "ruby-strong on chip tint /cd", fg: rubyStrong, bg: chipRest(ruby) },
    { name: "ruby-strong on chip tint HOVER /cd", fg: rubyStrong, bg: chipHover(ruby) },
    {
      name: "jade-strong on chip tint HOVER /cd",
      fg: tok(map, "--jade-strong"),
      bg: chipHover(tok(map, "--jade")),
    },
    {
      name: "gold-strong on chip tint HOVER /cd",
      fg: tok(map, "--gold-strong"),
      bg: chipHover(tok(map, "--gold")),
    },
    // W22d — PROPHYLACTIC, and labelled as such. `--surface-elevated` has exactly one consumer today
    // (`.aisle-fan-label`) and it uses `--tx`, which is already guarded above. An earlier version of
    // this comment justified the combo with "timestamps, the Save X% sub-label" — neither exists;
    // that was invented, in a file whose whole subject is claims that outrun their evidence. The
    // combo still earns its place beside the `--ac2` guard: this token is the theme-true chrome that
    // floats over cards and photos, muted text on it is the obvious next use, and asserting it now
    // costs nothing. But it guards a FUTURE call site, not a current one.
    { name: "t3 on surface-elevated", fg: tok(map, "--t3"), bg: tok(map, "--surface-elevated") },
    // W22d-1 (adversarial review, HIGH ×2) — the two ACCENT PILLS. Both shipped `color: var(--ac)`
    // on an accent tint over `--sf` and both failed AA in light (3.53 and 3.70), which is precisely
    // what the `plain ac on sf` negative guard below already declared impossible — the guard was
    // right and two live call sites were violating it, with nothing connecting the two facts.
    // `.lend-banner-back` clears at only 4.53, so it is asserted rather than trusted.
    {
      name: "ac-strong on accent 16% over sf (.lend-banner-back)",
      fg: acStrong,
      bg: mixOklab(ac, 0.16, sf),
    },
    {
      name: "ac-strong on accent 12% tint over sf (.wb-method)",
      fg: acStrong,
      bg: flattenAlpha(ac, 0.12, sf),
    },
    { name: "oa on solid ac", fg: tok(map, "--oa"), bg: ac },
    { name: "ok on okb", fg: tok(map, "--ok"), bg: tok(map, "--okb") },
    { name: "warn on warnb", fg: tok(map, "--warn"), bg: tok(map, "--warnb") },
    // ── M83 · the EMAIL pairs ────────────────────────────────────────────────────────────────
    // Every text×surface pair rendered by `apps/qr/emails/*`, asserted here as TOKEN pairs.
    //
    // The templates cannot import `tokens.css` — email clients resolve no custom properties — so
    // they bake literals from `apps/qr/emails/palette.ts`, and `check-theme-parity.mjs` (surface 6)
    // pins each of those literals to the token named below. That is the whole chain: the guard
    // proves the emails ARE these tokens, and these assertions prove the tokens clear AA. Neither
    // half alone says anything about what a diner reads.
    //
    // This package cannot reach into `apps/qr` (one-way deps), and it does not need to: the pairs
    // are the palette's own, and naming them here is what makes a future token edit — which is
    // exactly what W22d proper is — fail on the email surface too rather than only on screen.
    //
    // ⚠️ LIGHT ONLY, and that is a fact about the emails rather than a convenience. They bake the
    // LIGHT literals and declare `color-scheme: light`; there is no dark variant to assert. Running
    // them against the dark map would not be a free extra, it would be a claim about values the
    // templates never send — and it is not even a safe one: `--oa` on `--ink` scores **1.01** in
    // dark, because `--ink` is a CONSTANT (never re-declared in `.dark`) while `--oa` flips to a
    // dark ink. That pair is fine in every email and would be near-invisible on a dark screen, which
    // is worth knowing (registry M93) and is not what this block is measuring.
    // W22d/PR A — the ORDER-READY wall board's column heading (`.orb-col-ready h2`), DARK ONLY, and
    // the theme restriction is the entire point rather than a convenience.
    //
    // Every `.orb-root` wrapper is Night-forced (`<div className="orb-root dark">`,
    // `ReadyBoard.tsx:164/187/208`) and `.orb-col-ready` renders nowhere else, so this heading's
    // `color: var(--gold)` always resolves through `.dark` — #f4c879 on #171221, 11.69:1. Asserting
    // it in LIGHT would be asserting a pairing the app never renders, and it would fail: light
    // `--gold` on light `--pg` is 1.97.
    //
    // ⚠️ That 1.97 is exactly what an earlier pass in this PR measured and then reported as a live
    // AA failure on this heading, "fixed" by swapping to `--gold-strong` — a byte-identical no-op,
    // since `--gold-strong` aliases `--gold` in `.dark`. The ratio was computed correctly and
    // attributed to a theme the surface never renders in. This combo exists so the REAL pairing is
    // an asserted fact rather than something nobody had checked: a board read across a room, whose
    // legibility had no coverage at all while a defect that never existed collected six citations.
    ...(theme === "dark"
      ? [
          {
            name: "gold on pg (.orb-col-ready h2, Night-forced wall board)",
            fg: tok(map, "--gold"),
            bg: pg,
          },
        ]
      : []),
    ...(theme === "light"
      ? [
          { name: "email · tx body on cd card", fg: tok(map, "--tx"), bg: cd },
          { name: "email · t2 kicker/meta/footer on cd card", fg: tok(map, "--t2"), bg: cd },
          { name: "email · ac eyebrow + auth code on cd card", fg: ac, bg: cd },
          { name: "email · tx footer name on pg", fg: tok(map, "--tx"), bg: pg },
          { name: "email · t2 footer lines + links on pg", fg: tok(map, "--t2"), bg: pg },
          { name: "email · t3 honest reason line on pg", fg: tok(map, "--t3"), bg: pg },
          {
            name: "email · t3 slip labels + kitchen notes on cd slip",
            fg: tok(map, "--t3"),
            bg: cd,
          },
          { name: "email · warn refunded line on cd slip", fg: tok(map, "--warn"), bg: cd },
          { name: "email · oa on the ink CTA fill", fg: tok(map, "--oa"), bg: tok(map, "--ink") },
        ]
      : []),
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
          // W22d — `--ac2` is the gradient's SECOND stop, never a text colour. In light it scores
          // 3.25 on --pg, so a future call site reaching for it as text would look plausible and
          // fail AA. Dark is deliberately absent: there `--ac2` IS the legible bright gold (11.69),
          // so a negative assertion would be false — the same reason the other three are light-only.
          { name: "plain ac2 on pg", fg: tok(map, "--ac2"), bg: pg },
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
