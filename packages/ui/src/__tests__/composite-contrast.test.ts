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
   * a lit grid lip, and the grain's peak overlay excursion. Light's worst is its DARKEST: no blobs
   * and no pool (both lighten, which helps dark text), just a groove crossing under the grain's
   * minimum. Same composition, opposite binding direction — which is the whole reason the two
   * themes carry different `--pa-*` alphas rather than one shared set.
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
  function lightWorst(): Rgba {
    const groove = t(light, "--pa-groove");
    const crossing = fade(
      stack([groove, groove], { r: 0, g: 0, b: 0, a: 0 }),
      Number(raw(light, "--pa-mid-op")),
    );
    return grain(
      over(crossing, t(light, "--pg")),
      0.34,
      Number(raw(light, "--pa-grain-op")),
      "normal",
    );
  }
  it("room · Night worst pixel keeps --t3 above AA", () => {
    expect(ratio(t(dark, "--t3"), nightWorst())).toBeGreaterThanOrEqual(AA);
  });
  it("room · Night worst pixel keeps --t2 above AA", () => {
    expect(ratio(t(dark, "--t2"), nightWorst())).toBeGreaterThanOrEqual(AA);
  });
  it("room · light worst pixel keeps --t3 above AA", () => {
    expect(ratio(t(light, "--t3"), lightWorst())).toBeGreaterThanOrEqual(AA);
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
