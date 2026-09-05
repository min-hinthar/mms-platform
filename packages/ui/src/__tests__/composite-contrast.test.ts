import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * M126 — the contrast the main audit CANNOT see.
 *
 * `contrast-audit.test.ts` is rigorous about every pair it can name, and structurally blind to
 * three things this milestone introduced:
 *
 *   1. GLASS. A translucent pane's real background is `--glass-chrome` composited over whatever
 *      happens to be behind it. The audit reads a hex; a pane has no hex.
 *   2. THE ROOM. The page ambient is three stacked layers of `color-mix(… , transparent)` over
 *      `--pg`, with a blended grain on top. The audit reads `--pg` as a flat value and none of it.
 *   3. THE MOMENTS' LIGHT BANDS. The rake and the print head paint a wash ACROSS a surface that
 *      carries text, changing the ground under it for the duration.
 *
 * All three are "green for the wrong reason" shapes: a wrong-but-plausible alpha passes every gate
 * in the repo and shows up as unreadable text on a real phone. This file computes the composite and
 * asserts the floor, so the numbers in the tokens' own comments cannot rot.
 *
 * RED-FIRST — five mutations, each watched go red, each restored md5-identical afterwards. The
 * numbers are this guard's own output, not a hand calculation pasted in:
 *   --glass-chrome        90% -> 86%          "glass floor · --t3"        4.8309 -> 4.2167  FAIL
 *   .dark --pa-far-op     0.62 -> 0.80        "room · Night worst pixel"  4.8443 -> 4.3989  FAIL
 *   --print-head          0.08 -> var(--sheen) (0.11 in Night)  "print head"  4.6172 -> 4.1830  FAIL
 *   :root --pa-grain-op   0.04 -> 0.10        "room · light worst pixel"  4.6428 -> 4.2601  FAIL
 *   light --glass-chrome  opaque -> 90%       "light chrome is OPAQUE"    1 -> 0.9         FAIL
 *
 * The compositing here is straight-alpha in sRGB, which is what a painted layer does, and it is
 * the same model `flattenAlpha` in the main audit uses. `color-mix(in oklab, X N%, transparent)`
 * is premultiplied, so it composites identically to X at alpha N — the main audit's own docblock
 * records the same equivalence.
 *
 * ⚠️ THIS GUARD DOES NOT ROUND TO 8 BITS, and a browser does. So it reports ratios up to ~0.03
 * TIGHTER than what actually renders, and a hand calculation on hex values will not reproduce it
 * exactly. That is the safe direction, and it is deliberate — but it means the guard's number, not
 * the hand one, is the number a token comment should quote.
 */

const css = readFileSync(fileURLToPath(new URL("../tokens.css", import.meta.url)), "utf8");

function parseBlock(selector: string): Record<string, string> {
  const re = new RegExp(`(?<![\\w\\]"])${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`);
  const body = (re.exec(css)?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const map: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const name = m[1];
    const val = m[2];
    if (name && val) map[name] = val.trim();
  }
  return map;
}
const light = parseBlock(":root");
// `.dark` OVERRIDES `:root`, it does not replace it — same merge the main audit does.
const dark = { ...light, ...parseBlock(".dark") };

function raw(map: Record<string, string>, name: string): string {
  let v = map[name] ?? "";
  for (let i = 0; i < 5 && v.startsWith("var(") && v.endsWith(")"); i++) {
    const next = map[v.slice(4, -1).trim()];
    if (next === undefined) break;
    v = next.trim();
  }
  if (!v) throw new Error(`tokens.css: ${name} is not declared`);
  return v;
}

type Rgba = { r: number; g: number; b: number; a: number };

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * Resolve a token to a colour + alpha. Handles the three forms the M126 tokens actually use: a
 * hex, an `rgba(...)`, and `color-mix(in oklab, <colour> N%, transparent)` — the last of which is
 * PREMULTIPLIED, hence equivalent to the colour at alpha N. Anything else throws rather than
 * guessing, because a silently-misparsed token is how a decorative layer passes a contrast test it
 * should fail.
 */
function resolve(map: Record<string, string>, name: string): Rgba {
  const v = raw(map, name);
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) {
    const [r, g, b] = hexToRgb(v);
    return { r, g, b, a: 1 };
  }
  const rgba = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(
    v,
  );
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  const mix = /^color-mix\(\s*in oklab\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/.exec(v);
  if (mix) {
    const inner = mix[1] as string;
    const pct = Number(mix[2]) / 100;
    const ref = /^var\((--[\w-]+)\)$/.exec(inner);
    const base = ref ? resolve(map, ref[1] as string) : { ...toRgba(inner), a: 1 };
    return { ...base, a: base.a * pct };
  }
  throw new Error(`tokens.css: ${name} = "${v}" is not a form this guard can composite`);
}
function toRgba(hex: string): Rgba {
  const [r, g, b] = hexToRgb(hex);
  return { r, g, b, a: 1 };
}

/** Paint `src` over `dst`. Straight alpha, sRGB — what a background layer does. */
function over(src: Rgba, dst: Rgba): Rgba {
  const a = src.a + dst.a * (1 - src.a);
  const f = (s: number, d: number) => (s * src.a + d * dst.a * (1 - src.a)) / (a || 1);
  return { r: f(src.r, dst.r), g: f(src.g, dst.g), b: f(src.b, dst.b), a };
}
/** Paint a stack, FIRST entry topmost — CSS `background-image` order. */
function stack(layers: Rgba[], ground: Rgba): Rgba {
  return layers.reduceRight((acc, l) => over(l, acc), ground);
}
/** A whole layer's `opacity`, applied to an already-composited group. */
function fade(c: Rgba, opacity: number): Rgba {
  return { ...c, a: c.a * opacity };
}

const OVERLAY = (b: number, s: number) => (b < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s));
/**
 * The grain plane. Its tile is clamped to [0.34, 0.66] around mid-grey by the feComponentTransfer
 * in globals.css, so `s` is the peak excursion in whichever direction hurts the theme's text.
 */
function grain(bg: Rgba, s: number, opacity: number, blend: "normal" | "overlay"): Rgba {
  const ch = (v: number) => {
    const b = v / 255;
    const out = blend === "overlay" ? OVERLAY(b, s) : s;
    return 255 * (opacity * out + (1 - opacity) * b);
  };
  return { r: ch(bg.r), g: ch(bg.g), b: ch(bg.b), a: 1 };
}

function luminance(c: Rgba): number {
  const [r, g, b] = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg: Rgba, bg: Rgba): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const AA = 4.5;

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const t = (map: Record<string, string>, n: string) => resolve(map, n);

describe("glass floor — the frosted chrome over its worst possible backdrop", () => {
  /**
   * `saturate()` preserves luma and clamps at 255, so no backdrop can composite BRIGHTER than
   * white. That is what makes this a bound and not a sample: white is the worst case that
   * physically exists (a blown highlight in a dish photo), and every Night text token has to clear
   * AA on it. The pane is deliberately tinted with --sf, not --pg, so chrome sits below cards.
   * ⚠️ This bound dies the moment anything adds `brightness()` above 1 to a text-bearing pane.
   */
  const pane = over(t(dark, "--glass-chrome"), WHITE);
  for (const token of ["--tx", "--t2", "--ac", "--jade-strong", "--ruby-strong", "--t3"]) {
    it(`glass floor · ${token} on frosted chrome over white`, () => {
      expect(ratio(t(dark, token), pane)).toBeGreaterThanOrEqual(AA);
    });
  }
  it("light chrome is OPAQUE — no alpha rescues dark-on-light glass", () => {
    // The measurement that made light's chrome opaque: at 0.90 over black, --t3 lands 3.806. This
    // asserts the DECISION, so a future edit cannot quietly reintroduce a translucent light pane.
    expect(t(light, "--glass-chrome").a).toBe(1);
  });
});

describe("the room — the worst pixel of the page ambient, both themes", () => {
  /**
   * Night's worst pixel is its BRIGHTEST: all four far-plane blob cores coincident, the warm pool,
   * a lit grid lip, and the grain's peak overlay excursion. Light's worst is its DARKEST — and the
   * first version of this file got that composition WRONG in a way that hid two live AA failures.
   *
   * It excluded the blobs and the pool "because both lighten, which helps dark text". That is
   * FALSE. Every light ambient source is darker than light `--pg` #faf9f5: `--sf` Y 0.86380,
   * `--warnb` 0.83472, `--gold` 0.45487, `--jade` 0.12344, `--ruby` 0.12598, against the ground's
   * 0.94668. So the model excluded precisely the layers that darken, reported 4.6056, and the real
   * worst pixel was 4.4813 with motion and 4.3764 under reduced motion. Light's `--pa-far-op` and
   * all four `--pa-blob-*` were asserted by nothing at all, in either direction.
   *
   * The light model below stacks what actually darkens — four blob cores, the warm pool, a groove
   * crossing — and omits only `--pa-lip`, which lightens and so cannot be the worst case. Both
   * motion states are computed, because `--pa-groove-still` is a different alpha and reduced motion
   * is the TIGHTER of the two in this theme, not the looser one.
   */
  function nightWorst(): Rgba {
    const far = fade(
      stack(
        (["--pa-blob-1", "--pa-blob-2", "--pa-blob-3", "--pa-blob-4"] as const).map((n) =>
          t(dark, n),
        ),
        { r: 0, g: 0, b: 0, a: 0 },
      ),
      Number(raw(dark, "--pa-far-op")),
    );
    const ground = over(far, t(dark, "--pg"));
    const mid = fade(
      stack([t(dark, "--pa-pool"), t(dark, "--pa-lip")], { r: 0, g: 0, b: 0, a: 0 }),
      Number(raw(dark, "--pa-mid-op")),
    );
    return grain(over(mid, ground), 0.66, Number(raw(dark, "--pa-grain-op")), "overlay");
  }
  /** @param grooveToken `--pa-groove` (motion) or `--pa-groove-still` (reduced motion). */
  function lightWorst(grooveToken: "--pa-groove" | "--pa-groove-still"): Rgba {
    const pg = t(light, "--pg");
    const far = fade(
      stack(
        (["--pa-blob-1", "--pa-blob-2", "--pa-blob-3", "--pa-blob-4"] as const).map((n) =>
          t(light, n),
        ),
        { r: 0, g: 0, b: 0, a: 0 },
      ),
      Number(raw(light, "--pa-far-op")),
    );
    const ground = over(far, pg);
    const groove = t(light, grooveToken);
    // The pool and a groove CROSSING (both grid axes paint at an intersection). No `--pa-lip`: it
    // lightens, so including it would model something easier than the worst case.
    const mid = fade(
      stack([t(light, "--pa-pool"), groove, groove], { r: 0, g: 0, b: 0, a: 0 }),
      Number(raw(light, "--pa-mid-op")),
    );
    return grain(over(mid, ground), 0.34, Number(raw(light, "--pa-grain-op")), "normal");
  }
  it("room · Night worst pixel keeps --t3 above AA", () => {
    expect(ratio(t(dark, "--t3"), nightWorst())).toBeGreaterThanOrEqual(AA);
  });
  it("room · Night worst pixel keeps --t2 above AA", () => {
    expect(ratio(t(dark, "--t2"), nightWorst())).toBeGreaterThanOrEqual(AA);
  });
  it("room · light worst pixel keeps --t3 above AA", () => {
    expect(ratio(t(light, "--t3"), lightWorst("--pa-groove"))).toBeGreaterThanOrEqual(AA);
  });
  it("room · light REDUCED-MOTION worst pixel keeps --t3 above AA", () => {
    // `--pa-groove-still` deepens the cut, and the token's comment calls that "the safer
    // composition". It is — in NIGHT, where a darker groove darkens the ground under LIGHT text.
    // Light is dark-on-light, so the same move spends contrast instead of buying it, which makes
    // this the TIGHTER of the theme's two states rather than the looser one.
    expect(ratio(t(light, "--t3"), lightWorst("--pa-groove-still"))).toBeGreaterThanOrEqual(AA);
  });
});

/**
 * OKLab mixing, for the ONE gradient whose stops are a `color-mix` of two real tokens. The main
 * audit carries the same helper for tint recipes; this file needs it because `resolve()` above only
 * understands mixing with `transparent`, and a stop mixed with another COLOUR is a different sum.
 */
function srgbToLin(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function linToSrgb(c: number) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return v * 255;
}
function toOklab([r, g, b]: [number, number, number]) {
  const R = srgbToLin(r);
  const G = srgbToLin(g);
  const B = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ] as [number, number, number];
}
function fromOklab([L2, a, b]: [number, number, number]): Rgba {
  const l = (L2 + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L2 - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L2 - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: 1,
  };
}
function mixOklab(x: Rgba, weight: number, y: Rgba): Rgba {
  const A = toOklab([x.r, x.g, x.b]);
  const B = toOklab([y.r, y.g, y.b]);
  return fromOklab(
    [0, 1, 2].map((i) => A[i]! * weight + B[i]! * (1 - weight)) as [number, number, number],
  );
}

describe("the gold chip's ink — a bright fill needs the CONSTANT ink, not the on-accent one", () => {
  /**
   * M131 found this SHIPPED: `.start-here-rank-top` (the #1 seal on the Start-here band, the most
   * prominent numeral there) wore `color: var(--oa)` on a GOLD gradient. `--oa` is on-ACCENT ink —
   * in light it is #fffdf8, sized for the dark amber `--ac` fill — and on `--gold` it measures
   * 2.0458:1. Unreadable, in the default theme, since W20.
   *
   * ⚠️ THAT SELECTOR NO LONGER EXISTS — M135 deleted the rank seals outright (the owner asked for
   * the sales data "instead of ranking them or numbering"), so do not go looking for it. The rule
   * stayed because the FILL did: `.arrival-table` (globals.css) is the live consumer today, same
   * gradient, and it is the one this guard protects. The bound is on the tokens, so it covers the
   * next chip to reach for that gradient as well as this one.
   *
   * The whole class is invisible to the main audit for a structural reason worth stating: that
   * audit asserts PAIRS OF TOKENS, and nothing there knows which fill a given ink is painted on.
   * `--oa` on `--ac` is fine and asserted; `--oa` on `--gold` is a different pair that no rule
   * named. So this guards the FILL itself, across every share the gradient actually paints.
   *
   * `.kds-new-pill` has the same pair and is deliberately NOT included: it renders inside
   * `.kds-root.dark`, a Night-forced wall board, where `--oa` on `--gold` clears comfortably —
   * 10.2712:1 at the gradient's WORST pixel (12.1235 at its best; quote the worst, it is the one
   * that has to hold).
   *
   * RED-FIRST: reverting the chip to `--oa` is a CSS change this file cannot see, so the guard
   * is on the TOKENS — putting `--oa` where `--ink` is asserted turns LIGHT red (the first sampled
   * share reports 3.2229, the worst 2.0458) while Night stays green at 10.2712, which is the honest
   * shape of the defect: `--oa` on gold is a light-theme failure only.
   *
   * The painted range, read off the rule itself:
   *   background: linear-gradient(160deg, var(--gold), color-mix(in oklab, var(--gold) 45%, var(--ac)))
   * so every pixel is an oklab blend of `--gold` and `--ac` whose GOLD share runs from 100% (the
   * near stop) down to 45% (the far stop) — and no further. Pure `--ac` is NOT on this chip, which
   * matters: `--ink` on bare light `--ac` is 3.6173, so asserting a stop the rule never paints
   * would fail the guard over a pixel that does not exist. Sampled densely rather than at the two
   * endpoints, because "the worst point is an endpoint" is an assumption about oklab interpolation
   * and this costs nothing to not assume.
   */
  const GOLD_SHARE = Array.from({ length: 12 }, (_, k) => 0.45 + (k * (1 - 0.45)) / 11);
  for (const theme of ["light", "dark"] as const) {
    const map = theme === "dark" ? dark : light;
    it(`${theme} · --ink clears AA across the whole painted gradient`, () => {
      const gold = t(map, "--gold");
      const ac = t(map, "--ac");
      const ink = t(map, "--ink");
      for (const w of GOLD_SHARE) {
        expect(ratio(ink, mixOklab(gold, w, ac))).toBeGreaterThanOrEqual(AA);
      }
    });
  }
  it("light · --oa is NOT that ink, and this is why the rule exists", () => {
    // A negative guard, the same shape the main audit uses for `plain ac on sf`: it pins the
    // REASON. If a future palette change ever made --oa legible on gold, this fails and the comment
    // above stops being true — which is exactly when someone should re-read it.
    expect(ratio(t(light, "--oa"), t(light, "--gold"))).toBeLessThan(AA);
  });
});

describe("M131's tinted grounds — two color-mix surfaces that carry text", () => {
  /**
   * Both are `color-mix(… , <surface>)` fills, so `contrast-audit.test.ts` cannot name either: it
   * asserts token PAIRS, and neither ground is a token. Both are also thin in the LIGHT theme,
   * which is the whole reason they are here rather than trusted:
   *
   *   .taste-why            --t2 on `--gold` 9%  + `--sf`   (the honesty chip on a taste card)
   *   .arrival-exit-link:hover  --t2 on `--ac` 5% + `--sf`  (the exit door's promise line, hovered)
   *
   * The second one caught a live defect while it was being written: the tile's note was `--t3` over
   * a 7% `--ac` tint, which measures 4.3708 — under AA, in the default theme, on the line that
   * tells a diner their table stays open. `--t3` on bare light `--sf` is only 4.7595 to begin with,
   * so ANY darkening tint is enough to sink it; the fix was the ink and the tint together.
   *
   * RED-FIRST, and the second mutation corrected the first draft of this note: `--t2` → `--t3`
   * fails at 4.4795 (the ink is genuinely pinned). Raising the hover tint 5% → 9% does NOT fail —
   * `--t2` still measures above AA there — so the tint is bounded, but loosely: light `--t2` crosses
   * AA between 10% (4.5060) and 11% (4.4501). Worth stating rather than implying a tighter bound
   * than exists: what this guard actually guarantees is the INK, plus a ceiling on the tint that a
   * doubling would not reach.
   */
  const GROUNDS = [
    { name: ".taste-why", fill: "--gold", pct: 0.09 },
    { name: ".arrival-exit-link:hover", fill: "--ac", pct: 0.05 },
  ] as const;
  for (const theme of ["light", "dark"] as const) {
    const map = theme === "dark" ? dark : light;
    for (const g of GROUNDS) {
      it(`${theme} · --t2 clears AA on ${g.name}`, () => {
        const ground = mixOklab(t(map, g.fill), g.pct, t(map, "--sf"));
        expect(ratio(t(map, "--t2"), ground)).toBeGreaterThanOrEqual(AA);
      });
    }
  }
  it("light · --t3 does NOT clear the hovered exit tile — this is why the note is --t2", () => {
    // A REASON guard, not a bound: raising the tint only pushes this further below AA, so it never
    // trips on that. It exists so the day a palette change makes `--t3` legible here, this fails
    // and someone re-reads the note above instead of inheriting a rule whose reason has expired.
    const ground = mixOklab(t(light, "--ac"), 0.05, t(light, "--sf"));
    expect(ratio(t(light, "--t3"), ground)).toBeLessThan(AA);
  });
});

describe("--grad — the one ornament gradient nothing else pins", () => {
  /**
   * M127 records that four tokens this milestone moves are held by review alone: nothing in the
   * repo compares `--grad`'s stops to anything, and the contrast audit only ever asserts `>= 4.5`,
   * which a wrong-but-legible value satisfies. That is how M126 nearly shipped a real inversion —
   * raising `--surface-elevated` put the chrome ABOVE `--grad`'s light stop, so the brightest small
   * ornament in the app would have rendered DIMMER than the chrome behind it, and no gate could
   * have said so. This closes the half of M127 that this PR actually touched.
   *
   * RED-FIRST: restoring the pre-fix `#3a2a4d` light stop fails with 0.0207 vs 0.0386. Restored.
   */
  function stops(map: Record<string, string>): Rgba[] {
    const decl = raw(map, "--grad");
    const hexes = decl.match(/#[0-9a-fA-F]{6}/g) ?? [];
    expect(hexes.length).toBe(2); // a floor: a re-authored --grad must not pass by matching nothing
    return hexes.map((h) => {
      const [r, g, b] = hexToRgb(h);
      return { r, g, b, a: 1 };
    });
  }
  it("Night's light stop stays ABOVE the chrome it ornaments", () => {
    const [lit] = stops(dark) as [Rgba, Rgba];
    expect(luminance(lit)).toBeGreaterThan(luminance(t(dark, "--surface-elevated")));
  });
  it("each theme's gradient actually runs in its own direction", () => {
    // Night lights UP from its ground, light darkens DOWN from its paper. A stop pair that lost its
    // direction would still be legible and still pass every other gate in the repo.
    const [dLit, dDark] = stops(dark) as [Rgba, Rgba];
    expect(luminance(dLit)).toBeGreaterThan(luminance(dDark));
    const [lDark, lLit] = stops(light) as [Rgba, Rgba];
    expect(luminance(lLit)).toBeGreaterThan(luminance(lDark));
  });
});

describe("chrome — the surface the header's own text sits on", () => {
  /**
   * `.app-header-rewards` renders BARE `--ac`, which is legible on a narrow set of surfaces: the
   * main audit's `plain ac on sf` is a NEGATIVE guard asserting that pair sits UNDER 4.5, precisely
   * so call sites take `--ac-strong` instead. Pointing light's chrome at `--sf` put the header on
   * that forbidden ground at 4.2843, and nothing in the repo could see it — the surface is a token
   * indirection (`--glass-chrome`) that a hex-reading audit never follows.
   */
  it("light chrome carries bare --ac at AA", () => {
    expect(ratio(t(light, "--ac"), t(light, "--glass-chrome"))).toBeGreaterThanOrEqual(AA);
  });
  it("light chrome carries --t2 at AA", () => {
    expect(ratio(t(light, "--t2"), t(light, "--glass-chrome"))).toBeGreaterThanOrEqual(AA);
  });
  it("the opaque fallback every filter-off path reads is legible in both themes", () => {
    for (const map of [light, dark]) {
      expect(ratio(t(map, "--t2"), t(map, "--glass-chrome-opaque"))).toBeGreaterThanOrEqual(AA);
    }
    // Light's is the one that carries bare --ac; Night's is covered by the glass floor above.
    expect(ratio(t(light, "--ac"), t(light, "--glass-chrome-opaque"))).toBeGreaterThanOrEqual(AA);
  });
});

describe("the moments' light bands — a wash across a surface that carries text", () => {
  /**
   * --print-head is NOT --sheen, and this pair of assertions is why the token exists: at --sheen's
   * 0.11 the head's core strip drops --t3 on --cd to 4.2088, an AA failure on a receipt that the
   * main audit cannot see. A bevel value and a light-band value are different budgets.
   */
  for (const [name, band, surface] of [
    ["print head", "--print-head", "--cd"],
    ["print cast", "--print-cast", "--cd"],
    ["sheet rake", "--rake-peak", "--cd-raised"],
  ] as const) {
    for (const theme of ["light", "dark"] as const) {
      const map = theme === "dark" ? dark : light;
      it(`${name} · ${theme} · --t3 survives the band`, () => {
        expect(ratio(t(map, "--t3"), over(t(map, band), t(map, surface)))).toBeGreaterThanOrEqual(
          AA,
        );
      });
    }
  }
});

describe("the reward shimmer — a light band that crosses TEXT, not an edge", () => {
  /**
   * M150(a), found by Codex on #238 and RE-found on #242 after I wrongly closed it as
   * unreproducible. The finding named `--print-head`; the actual consumer is
   * `.checkout-reward-applied::after`, which sweeps a band across the reward card while
   * `RewardField` renders `--t2` Burmese and reward-shortfall text on top. I searched for the
   * token the finding named instead of looking at the element it named, and closed a live defect.
   *
   * The card's own background is `linear-gradient(color-mix(--gold 14%, --cd), color-mix(--gold
   * 7%, --cd))`, so the band's worst backdrop is the 14% stop — that is the pair asserted here.
   * At --sheen's Night 0.11 this measured 3.8745; `--reward-shine` is 0.05.
   *
   * Reduced-motion sets `content: none` on the pseudo-element, so the band exists only on the
   * motion path — which is most people, and is why this is a floor rather than a note.
   */
  /**
   * ⚠️ THE TOKEN IS READ OUT OF THE SELECTOR, not named here (Codex P2 on #242 round 2).
   *
   * The first version of this suite measured `--reward-shine` directly and never checked that
   * anything USES it. Swapping `.checkout-reward-applied::after` back to `var(--sheen)` left all 35
   * assertions green — including the negative one asserting --sheen fails — while restoring the
   * 3.8745:1 defect in production. A guard that measures a token nothing consumes is measuring a
   * constant, and this repo has now shipped that shape four times in one session.
   *
   * So the band's token is DERIVED from the shipped rule. If the selector changes to a different
   * token, these assertions follow it there and fail on its real value; if the rule disappears or
   * stops carrying a `var()`, the extraction throws rather than passing vacuously.
   */
  const BAND_TOKEN = (() => {
    const globals = readFileSync(
      fileURLToPath(new URL("../../../../apps/qr/app/globals.css", import.meta.url)),
      "utf8",
    );
    // Comments stripped FIRST, and ambiguity refused (Codex P2 on #242 round 3). Matching the first
    // textual occurrence would pick a commented-out copy of the rule sitting above the live one —
    // the same "found a string that is not the shipped thing" mistake the fx-boot extraction made
    // twice. Blanked rather than deleted so nothing shifts under a future offset-based read.
    const live = globals.replace(/\/\*[\s\S]*?\*\//g, "");

    // The selector legitimately appears TWICE — the rule that paints the band, and the
    // reduced-motion override that sets `content: none` to remove it. So identify the PAINTING one
    // structurally (it is the one declaring a `background`) rather than by position, and still
    // refuse ambiguity if a second painting rule ever appears.
    const painting = [...live.matchAll(/\.checkout-reward-applied::after\s*\{([^}]*)\}/g)]
      .map((m) => m[1]!)
      .filter((body) => /background:\s*[^;]*;/i.test(body));
    if (painting.length !== 1) {
      throw new Error(
        `globals.css has ${painting.length} live \`.checkout-reward-applied::after\` rules that paint ` +
          "a background. This suite asserts a contrast floor for that band, so exactly one rule has " +
          "to own it — zero means the shimmer moved, two means it is ambiguous which one a diner sees.",
      );
    }

    const decl = /background:\s*([^;]*);/i.exec(painting[0]!)!;

    // EVERY custom property in the declaration, not the first — a gradient that grows a second
    // `var()` before the centre stop would otherwise silently re-point these assertions at it.
    const vars = [...decl[1]!.matchAll(/var\((--[a-z0-9-]+)\)/gi)].map((m) => m[1]!);
    const unique = [...new Set(vars)];
    if (unique.length !== 1) {
      throw new Error(
        `the shimmer's background names ${unique.length} custom properties (${unique.join(", ") || "none"}). ` +
          "This suite asserts a contrast floor for the BAND, so it must be unambiguous which token " +
          "paints it — name the band's colour in one property, or teach this extraction which stop " +
          "carries it.",
      );
    }
    return unique[0]!;
  })();

  const stop = (map: Record<string, string>, pct: number) =>
    mixOklab(t(map, "--gold"), pct, t(map, "--cd"));

  for (const theme of ["light", "dark"] as const) {
    const map = theme === "dark" ? dark : light;
    // Labelled, not computed: `${0.14 * 100}` prints "14.000000000000002" in a test name.
    for (const [label, pct] of [
      ["14%", 0.14],
      ["7%", 0.07],
    ] as const) {
      it(`${theme} · --t2 survives the shimmer over the ${label} gold stop`, () => {
        const under = over(t(map, BAND_TOKEN), stop(map, pct));
        expect(ratio(t(map, "--t2"), under)).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it("is BOUNDED below --sheen in Night — the two are different budgets", () => {
    // Also pins the binding itself: if the selector were switched back to --sheen, BAND_TOKEN
    // would BE --sheen and the two ratios below would be equal, failing the strict inequality.
    // The regression this guards is someone collapsing the token back to --sheen because they
    // look alike. Asserting the ORDER rather than the literal keeps that from being a silent edit
    // without pinning a hex that a re-tune would have to fight.
    const worst = mixOklab(t(dark, "--gold"), 0.14, t(dark, "--cd"));
    const withShine = ratio(t(dark, "--t2"), over(t(dark, BAND_TOKEN), worst));
    const withSheen = ratio(t(dark, "--t2"), over(t(dark, "--sheen"), worst));
    expect(withSheen).toBeLessThan(AA); // the value this token replaced, still failing
    expect(withShine).toBeGreaterThan(withSheen);
  });
});

describe("the KDS held card — two stacked fades the hex audit cannot see (P1)", () => {
  /**
   * `.kds-ticket-held` fades the CARD and `.kds-line:disabled` fades the LINE, and a held line is
   * always disabled (`disabled={pending || held}`, KdsBoard). So the English echo under a Burmese
   * dish name (`.kds-line-en`, 21px/800) composites through BOTH: the line group over the card
   * face, then the card over the page. The design panel on P1 shipped one draft that set the echo in
   * --t2 and quoted the single-fade number (4.15:1) — the stacked one is 2.71:1, under the 3:1
   * large-text floor; --tx composites to 4.02:1.
   *
   * ⚠️ BOUND TO THE CSS THAT CONSUMES THE TOKENS (blind pass on #258): the first draft read only
   * tokens.css, so switching `.kds-line-en` back to --t2, or replacing either `opacity:
   * var(--kds-…-op)` with a literal, left it green. Now the echo's declared colour token and both
   * opacity declarations are parsed out of globals.css and the composite is computed for the colour
   * the rule actually ships. The --t2 number stays in this comment as the reason, not as an
   * assertion that would go red on a SAFE change (raising the fades until --t2 clears).
   */
  const globals = readFileSync(
    fileURLToPath(new URL("../../../../apps/qr/app/globals.css", import.meta.url)),
    "utf8",
  );
  const block = (selector: string) => {
    const re = new RegExp(selector.replace(/[.:[\]()]/g, "\\$&") + "\\s*\\{([^}]*)\\}");
    const m = re.exec(globals);
    if (!m) throw new Error(`globals.css: no \`${selector}\` block`);
    return m[1] as string;
  };
  const declared = (selector: string, prop: string) => {
    const m = new RegExp(`(?:^|;|\\n)\\s*${prop}\\s*:\\s*([^;]+)`).exec(block(selector));
    if (!m) throw new Error(`globals.css: \`${selector}\` declares no \`${prop}\``);
    return (m[1] as string).trim();
  };
  const tokenOf = (value: string) => {
    const m = /^var\((--[\w-]+)\)$/.exec(value);
    if (!m) throw new Error(`expected a token, got \`${value}\``);
    return m[1] as string;
  };
  const held = Number(raw(dark, tokenOf(declared(".kds-ticket-held", "opacity"))));
  const off = Number(raw(dark, tokenOf(declared(".kds-line:disabled", "opacity"))));
  const echoToken = tokenOf(declared(".kds-line-en", "color"));
  const LARGE = 3; // WCAG 1.4.3 large text (≥18.66px bold) floor — 21px/800 qualifies
  const stacked = (ink: Rgba) => {
    const cd = t(dark, "--cd");
    const pg = t(dark, "--pg");
    const line = over({ ...ink, a: off }, cd); // the disabled line group over the card face
    const text = over({ ...line, a: held }, pg); // the held card over the page
    const ground = over({ ...cd, a: held }, pg); // the same card, where there is no ink
    return ratio(text, ground);
  };
  it("both fades are tokens, not literals — or this guard reads a number the CSS does not ship", () => {
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThanOrEqual(1);
    expect(off).toBeGreaterThan(0);
    expect(off).toBeLessThanOrEqual(1);
  });
  it("Night · the colour .kds-line-en actually declares clears the large-text floor through both fades", () => {
    expect(stacked(t(dark, echoToken))).toBeGreaterThanOrEqual(LARGE);
  });
});
