import { describe, expect, it } from "vitest";
import {
  PASS_CSS,
  contrastRatio,
  cssDeclarations,
  members,
  mixSrgb,
  tokHex,
  tokenBlock,
  varRefs,
} from "./css-rules";

/**
 * PATH_DESIGN round 3 — the pass is CONSTANT PAPER and the track's colour is the stage. This suite
 * parses `pass.css` and `tokens.css` (never transcribes a value) and pins:
 *   · ink constancy — every colour the pass reads is a `--pass-*` token (or `--pass-hole`, the
 *     host's ground); the one theme token allowed is `--sh-paper`, the shadow it casts; the track's
 *     `theme` surface block is the only place a theme colour appears; no colour literal anywhere;
 *   · Night contrast — `.dark` never redeclares a pass token, so the paper's pairs measure the same
 *     in Night, and each clears its bar (text 4.5:1, non-text 3:1);
 *   · the stage → segment-count and stage → ink mapping (and that gold/accent are never used);
 *   · the three figure tiers and the four track sizes, as the vocabulary states them;
 *   · the reduced-motion escort names every animated selector, and every keyframe ends at rest.
 */
const DECLS = cssDeclarations(PASS_CSS);
const RM = "@media (prefers-reduced-motion: reduce)";
const FORCED = "@media (forced-colors: active)";
const THEME_RULE = '.ui-track[data-surface="theme"]';
/** The paper rule carries the never-nested guard in its selector (see the nesting test). */
const PAPER = ".ui-pass:where(:not(.ui-pass .ui-pass)) > .ui-pass-paper";
const light = tokenBlock(":root");
const darkOnly = tokenBlock(".dark");
const dark = { ...light, ...darkOnly };

const find = (selector: string, prop: string, media: string | null = null) =>
  DECLS.filter(
    (d) => d.media === media && d.prop === prop && members(d.selector).includes(selector),
  );
const one = (selector: string, prop: string, media: string | null = null) => {
  const hits = find(selector, prop, media);
  expect(hits, `${selector} { ${prop} } under ${media ?? "no media"}`).toHaveLength(1);
  return hits[0]!.value;
};

it("parsed pass.css and tokens.css", () => {
  expect(DECLS.length).toBeGreaterThan(100);
  expect(tokHex(light, "--pass-paper")).toMatch(/^#/);
  expect(Object.keys(darkOnly).length).toBeGreaterThan(20);
});

describe("ink constancy — the pass reads no theme token and no colour literal", () => {
  // The theme-flipping set is whatever `.dark` redeclares — read, never listed.
  const THEME_TOKENS = new Set(Object.keys(darkOnly));
  const ALLOWED_THEME = new Set(["--sh-paper"]);
  // Every variable the pass's own rules declare (`--pass-edge`, `--trk-*`, `--seg-*`, …) is local.
  const LOCAL = new Set(DECLS.filter((d) => d.prop.startsWith("--")).map((d) => d.prop));

  it("the `.dark` set is real and `--sh-paper` is in it (the allow-list names a theme token)", () => {
    expect(THEME_TOKENS.has("--tx")).toBe(true);
    expect(THEME_TOKENS.has("--sh-paper")).toBe(true);
    expect(THEME_TOKENS.has("--pass-ink")).toBe(false);
  });

  it("outside the track's theme block, every token read is --pass-*, local, or non-colour", () => {
    const offenders: string[] = [];
    for (const d of DECLS) {
      if (d.media === FORCED) continue;
      if (members(d.selector).includes(THEME_RULE)) continue;
      for (const ref of varRefs(d.value)) {
        if (ref.startsWith("--pass-") || LOCAL.has(ref)) continue;
        if (THEME_TOKENS.has(ref) && !ALLOWED_THEME.has(ref))
          offenders.push(`${d.selector} { ${d.prop}: ${d.value} } reads ${ref}`);
      }
    }
    // MUTATION: `color: var(--tx)` on `.ui-pass-figure` — red, naming the rule.
    expect(offenders).toEqual([]);
  });

  it("every --pass-* token the sheet reads is DECLARED — in tokens.css's :root or by the sheet itself", () => {
    const declared = new Set([
      ...Object.keys(light).filter((k) => k.startsWith("--pass-")),
      ...LOCAL,
    ]);
    const undeclared = new Set<string>();
    for (const d of DECLS)
      for (const ref of varRefs(d.value))
        if (ref.startsWith("--pass-") && !declared.has(ref))
          undeclared.add(`${ref} in ${d.selector} { ${d.prop} }`);
    // MUTATION: `var(--pass-seam-width)` (a typo) — a dotted rule silently gone; red, naming it.
    expect([...undeclared]).toEqual([]);
    expect(declared.has("--pass-paper")).toBe(true);
  });

  it("a pass never nests: the paper rule refuses a pass inside a pass", () => {
    const paper = DECLS.filter((d) => d.prop === "background" && d.value === "var(--pass-paper)" && d.selector.endsWith(".ui-pass-paper")); // prettier-ignore
    expect(paper).toHaveLength(1);
    expect(paper[0]!.selector).toBe(".ui-pass:where(:not(.ui-pass .ui-pass)) > .ui-pass-paper");
  });

  it("the track's theme block reads exactly the theme's own stage inks, and nothing gold or accent", () => {
    const refs = DECLS.filter((d) => members(d.selector).includes(THEME_RULE)).flatMap((d) =>
      varRefs(d.value),
    );
    expect(refs.sort()).toEqual(["--bd", "--ok", "--t2", "--tx"]);
  });

  it("no rule, on any surface, reads a gold or accent token (never a progress colour)", () => {
    const bad = DECLS.filter((d) =>
      varRefs(d.value).some((r) => /^--(gold|ac|jade|warn|pass-ac)\b/.test(r)),
    );
    // `--pass-ac` exists for a host's "now" mark; the primitives themselves never spend it.
    expect(bad.map((d) => `${d.selector} { ${d.prop}: ${d.value} }`)).toEqual([]);
  });

  it("no colour literal in any value but the forced-colours block (system colours live there)", () => {
    const LITERAL = [
      /#[0-9a-fA-F]{3,8}\b/,
      /\b(rgba?|hsla?|oklch|oklab|hwb|lab|lch)\(/,
      /\b(white|black|red|green|blue|gray|grey|cream|gold|silver|orange|purple)\b/i,
      /\b(Canvas|CanvasText|Highlight|GrayText)\b/,
    ];
    const offenders = DECLS.filter(
      (d) => d.media !== FORCED && LITERAL.some((re) => re.test(d.value)),
    ).map((d) => `${d.selector} { ${d.prop}: ${d.value} }`);
    // MUTATION: `background: #fffdf8` on the paper — red, naming the rule. `transparent` and
    // `currentColor` (the tear's alpha mask) are the only colour keywords left.
    expect(offenders).toEqual([]);
    // And the forced-colours block exists and reads system colours only.
    const forced = DECLS.filter((d) => d.media === FORCED);
    expect(forced.length).toBeGreaterThan(5);
    for (const d of forced) expect(varRefs(d.value), `${d.selector} { ${d.prop} }`).toEqual([]);
  });

  it("the paper's edge and the stub's ground are mixes of the pass inks, not tenth tokens", () => {
    expect(one(".ui-pass", "--pass-edge")).toMatch(
      /^color-mix\(in srgb, var\(--pass-ink\) \d+%, transparent\)$/,
    );
    expect(one(".ui-pass", "--pass-stub-ground")).toMatch(
      /^color-mix\(in srgb, var\(--pass-ink\) \d+%, var\(--pass-paper\)\)$/,
    );
    expect(one(".ui-pass-notch", "background")).toBe("var(--pass-hole)");
    expect(one(PAPER, "background")).toBe("var(--pass-paper)");
    expect(one(PAPER, "box-shadow")).toBe("var(--sh-paper)");
  });
});

describe("Night contrast on the paper — measured from tokens.css", () => {
  it("`.dark` redeclares no --pass-* token: the paper's inks are the same in Night", () => {
    // MUTATION: `--pass-ink: #f3ecdf` added to `.dark` — red.
    expect(Object.keys(darkOnly).filter((k) => k.startsWith("--pass-"))).toEqual([]);
    for (const name of ["--pass-paper", "--pass-ink", "--pass-ink-2", "--pass-ink-3", "--pass-ok", "--pass-okb", "--pass-ac", "--pass-unlit"]) // prettier-ignore
      expect(tokHex(dark, name)).toBe(tokHex(light, name));
  });

  it("the notches show the HOST's ground: --pass-hole is --pg in both themes", () => {
    expect(light["--pass-hole"]).toBe("var(--pg)");
    expect(tokHex(dark, "--pass-hole")).toBe(tokHex(dark, "--pg"));
    expect(tokHex(dark, "--pass-hole")).not.toBe(tokHex(light, "--pass-hole"));
  });

  for (const [theme, map] of [
    ["light", light],
    ["Night", dark],
  ] as const) {
    it(`${theme}: text inks clear 4.5:1 on the paper and the stub grounds`, () => {
      const paper = tokHex(map, "--pass-paper");
      const pct = Number(
        /var\(--pass-ink\) (\d+)%/.exec(one(".ui-pass", "--pass-stub-ground"))![1],
      );
      const stub = mixSrgb(tokHex(map, "--pass-ink"), pct, paper);
      const okb = tokHex(map, "--pass-okb");
      const text: Array<[string, string, string]> = [
        ["--pass-ink", "figure, label, rows", paper],
        ["--pass-ink-2", "Sent word, the English label", paper],
        ["--pass-ink-3", "the stub's small fields", stub],
        ["--pass-ok", "Served word", paper],
        ["--pass-ac", "a host's now mark", paper],
        ["--pass-ink", "the stamped stub's code", okb],
        ["--pass-ok", "the pickup kicker", okb],
        ["--pass-ink-2", "the English label on the stub ground", stub],
      ];
      for (const [ink, what, ground] of text) {
        const ratio = contrastRatio(tokHex(map, ink), ground);
        expect(ratio, `${theme}: ${ink} (${what}) on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${theme}: the lit segments and the stamp ring clear 3:1 (non-text) on their grounds`, () => {
      const paper = tokHex(map, "--pass-paper");
      for (const ink of ["--pass-ink-2", "--pass-ink", "--pass-ok"])
        expect(contrastRatio(tokHex(map, ink), paper), ink).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(tokHex(map, "--pass-ok"), tokHex(map, "--pass-okb"))).toBeGreaterThanOrEqual(3); // prettier-ignore
    });
  }
});

describe("the ONE KITCHEN TRACK — colour is the stage, length is progress", () => {
  const stageInk = (stage: string) => {
    const role = one(`.ui-track[data-stage="${stage}"]`, "--trk-ink");
    const m = /^var\((--trk-[0-3])\)$/.exec(role);
    expect(m, `${stage} ink role`).not.toBeNull();
    return m![1]!;
  };
  const onPass = (role: string) => one('.ui-track[data-surface="pass"]', role);
  const onTheme = (role: string) => one(THEME_RULE, role);

  it("Sent is ink-2, Cooking ink, Served ok — on the paper and on a themed surface alike", () => {
    // MUTATION: `.ui-track[data-stage="cooking"] { --trk-ink: var(--trk-3) }` — red.
    expect(onPass(stageInk("sent"))).toBe("var(--pass-ink-2)");
    expect(onPass(stageInk("cooking"))).toBe("var(--pass-ink)");
    expect(onPass(stageInk("served"))).toBe("var(--pass-ok)");
    expect(onTheme(stageInk("sent"))).toBe("var(--t2)");
    expect(onTheme(stageInk("cooking"))).toBe("var(--tx)");
    expect(onTheme(stageInk("served"))).toBe("var(--ok)");
    // The ring and the dashed grace take the Sent ink, never a colour of their own.
    expect(stageInk("unsent")).toBe(stageInk("sent"));
    expect(stageInk("sending")).toBe(stageInk("sent"));
    // The pass's Served ink IS the light theme's --ok, and its Sent ink the light --t2: one green.
    expect(tokHex(light, "--pass-ok")).toBe(tokHex(light, "--ok"));
    expect(tokHex(light, "--pass-ink-2")).toBe(tokHex(light, "--t2"));
  });

  it("a lit segment, the dashed grace, the ring and the word all take the stage's ink", () => {
    expect(one(".ui-track-seg[data-lit]", "background")).toBe("var(--trk-ink)");
    expect(one(".ui-track-seg[data-dashed]", "border")).toMatch(/dashed var\(--trk-ink\)$/);
    expect(one(".ui-track-seg[data-dashed]", "background")).toBe("transparent");
    expect(one(".ui-track-ring", "border")).toMatch(/solid var\(--trk-ink\)$/);
    expect(one(".ui-track-word", "color")).toBe("var(--trk-ink)");
    expect(one(".ui-track-seg", "background")).toBe("var(--trk-0)");
    expect(onPass("--trk-0")).toBe("var(--pass-unlit)");
  });

  it("the four sizes are 14×5 · 28×6 · 36×8 · 16×6, never a fifth", () => {
    const size = (s: string) =>
      `${one(`.ui-track[data-size="${s}"]`, "--seg-w")}×${one(`.ui-track[data-size="${s}"]`, "--seg-h")}`;
    expect(size("glyph")).toBe("14px×5px");
    expect(size("row")).toBe("28px×6px");
    expect(size("tv")).toBe("36px×8px");
    expect(size("stub")).toBe("16px×6px");
    const sizes = new Set(
      DECLS.filter((d) => /^\.ui-track\[data-size=/.test(d.selector)).map((d) => d.selector),
    );
    expect(sizes.size).toBe(4);
  });

  it("FILL scales the landed segment from its inline start over --dur-slow, once", () => {
    expect(one(".ui-track[data-filling] .ui-track-seg[data-landing]", "animation")).toBe(
      "uiTrackFill var(--dur-slow) var(--ease-out) both",
    );
    expect(one(".ui-track-seg", "transform-origin")).toBe("0 50%");
    expect(one("from", "transform", "@keyframes uiTrackFill")).toBe("scaleX(0)");
  });
});

describe("the three figure tiers — 40 · 88 · 54, from the tokens, never a fourth", () => {
  const px = (rem: string) => {
    const m = /^([\d.]+)rem$/.exec(rem);
    expect(m, `${rem} is a rem length`).not.toBeNull();
    return Number(m![1]) * 16;
  };
  it("holder = the shipped 40px code face; counter = --fs-pass (88); the TV's code row = 54", () => {
    expect(one('.ui-pass[data-tier="holder"] .ui-pass-figure', "font-size")).toBe("var(--pass-fs-holder)"); // prettier-ignore
    expect(px(one(".ui-pass", "--pass-fs-holder"))).toBe(40);
    expect(one('.ui-pass[data-tier="counter"] .ui-pass-figure', "font-size")).toBe(
      "var(--fs-pass)",
    );
    expect(one('.ui-pass[data-tier="tv"] .ui-pass-figure-table', "font-size")).toBe(
      "var(--fs-pass)",
    );
    expect(px(light["--fs-pass"]!)).toBe(88);
    expect(one('.ui-pass[data-tier="tv"] .ui-pass-figure-code', "font-size")).toBe("var(--pass-fs-tv)"); // prettier-ignore
    expect(px(one(".ui-pass", "--pass-fs-tv"))).toBe(54);
    // The TV and counter figures are PINNED: their tier rules read `--fs-pass` and nothing else,
    // and resolving every figure font-size through tokens.css, only the documented step-down
    // (`[data-figure-long]`, `--fs-display`) may land on a clamp — `var(--fs-display)` IS one.
    const figureSizes = DECLS.filter((d) => d.selector.includes("ui-pass-figure") && d.prop === "font-size"); // prettier-ignore
    // Four declarations: the holder's, the counter + TV-table list, the TV code, the step-down list.
    expect(figureSizes.length).toBe(4);
    for (const d of figureSizes) {
      expect(d.value, d.selector).not.toContain("clamp(");
      const resolved = varRefs(d.value).map((r) => light[r] ?? one(".ui-pass", r));
      expect(resolved.length, d.selector).toBe(1);
      const isClamp = /clamp\(/.test(resolved[0]!);
      expect(isClamp, `${d.selector} resolves to ${resolved[0]}`).toBe(d.selector.includes("[data-figure-long]")); // prettier-ignore
    }
    for (const sel of ['.ui-pass[data-tier="tv"] .ui-pass-figure-table', '.ui-pass[data-tier="counter"] .ui-pass-figure']) // prettier-ignore
      expect(one(sel, "font-size")).toBe("var(--fs-pass)");
  });

  it("a table is Fraunces 600 tabular; a code is the Hanken 800 code face", () => {
    expect(one(".ui-pass-figure-table", "font-family")).toBe("var(--font-display)");
    expect(one(".ui-pass-figure-table", "font-weight")).toBe("var(--fw-semibold)");
    expect(light["--fw-semibold"]).toBe("600");
    expect(one(".ui-pass-figure-code", "font-family")).toBe("var(--font-body)");
    expect(one(".ui-pass-figure-code", "font-weight")).toBe("var(--fw-heavy)");
    expect(light["--fw-heavy"]).toBe("800");
    expect(one(".ui-pass-figure-code", "letter-spacing")).toBe("var(--track-wide)");
    expect(one(".ui-pass-figure", "font-variant-numeric")).toBe("tabular-nums");
    expect(one(".ui-pass-figure", "white-space")).toBe("nowrap");
    expect(one(".ui-pass[data-figure-long] .ui-pass-figure-table", "font-size")).toBe("var(--fs-display)"); // prettier-ignore
  });

  it("the Burmese label is full ink at the counter's --fs-h2; the seam is dotted, 2px or 4px", () => {
    expect(one(".ui-pass-label-my", "color")).toBe("var(--pass-ink)");
    expect(one('.ui-pass[data-tier="counter"] .ui-pass-label-my', "font-size")).toBe(
      "var(--fs-h2)",
    );
    expect(one(".ui-pass", "--pass-seam-w")).toBe("2px");
    expect(one('.ui-pass[data-seam="4px"]', "--pass-seam-w")).toBe("4px");
    expect(one(".ui-pass-seam-rule", "border-top")).toBe(
      "var(--pass-seam-w) dotted var(--pass-seam)",
    );
    expect(one(".ui-pass-stub", "border-left")).toBe("var(--pass-seam-w) dotted var(--pass-seam)");
  });
});

describe("the escorts — reduced motion names every animated selector; every keyframe ends at rest", () => {
  const animated = DECLS.filter((d) => d.media === null && d.prop === "animation");

  it("every base `animation` has its exact selector under `animation: none` in the RM block", () => {
    expect(animated.length).toBeGreaterThanOrEqual(7);
    const escorted = new Set(
      DECLS.filter((d) => d.media === RM && d.prop === "animation" && d.value === "none").flatMap(
        (d) => members(d.selector),
      ),
    );
    // MUTATION: drop one selector from the RM list — red, naming it.
    for (const d of animated)
      for (const sel of members(d.selector)) expect(escorted.has(sel), sel).toBe(true);
  });

  it("every animation names a keyframe this file defines, and its last frame IS the element's own base", () => {
    const frames = new Map<string, Record<string, string>>();
    for (const d of DECLS) {
      const m = /^@keyframes (\S+)$/.exec(d.media ?? "");
      if (!m) continue;
      const key = `${m[1]}|${d.selector}`;
      frames.set(key, { ...(frames.get(key) ?? {}), [d.prop]: d.value });
    }
    // The CSS initial value of each animated property — what an element has when its base rule
    // says nothing. A `to` frame must equal the base DECLARATION where one exists, else this.
    const INITIAL: Record<string, string> = {
      transform: "none",
      "clip-path": "none",
      "stroke-dashoffset": "0",
      opacity: "1",
    };
    /** The animated selector's element: its last compound, attributes stripped
     *  (`.ui-pass[data-stamping] .ui-pass-tail` → `.ui-pass-tail`;
     *   `.ui-track[data-filling] .ui-track-seg[data-landing]` → `.ui-track-seg`). */
    const element = (selector: string) =>
      selector
        .split(/\s+/)
        .pop()!
        .replace(/\[[^\]]*\]/g, "");
    const base = (el: string, prop: string) => {
      const hits = DECLS.filter(
        (d) =>
          d.media === null &&
          d.prop === prop &&
          members(d.selector).some((m) => m === el || m.endsWith(` > ${el}`)),
      );
      expect(hits.length, `${el} { ${prop} } declared at most once`).toBeLessThanOrEqual(1);
      return hits[0]?.value ?? INITIAL[prop];
    };
    for (const d of animated) {
      const name = d.value.split(/\s+/)[0]!;
      const last = frames.get(`${name}|to`) ?? frames.get(`${name}|100%`);
      expect(last, `${name} has a to/100% frame`).toBeDefined();
      const el = element(d.selector);
      for (const [prop, value] of Object.entries(last!)) {
        if (prop === "animation-timing-function") continue;
        expect(Object.keys(INITIAL), `${name}: ${prop} is an animatable property this suite knows`).toContain(prop); // prettier-ignore
        // MUTATION: `uiPassPrint` ending at `inset(0)` while `.ui-pass-tail` rests unclipped (the
        // notches' overhang shaved after every print) — red, naming the frame.
        expect(value, `${name} → ${el} { ${prop} } ends at the element's base`).toBe(
          base(el, prop),
        );
      }
    }
    // The stamp's base is fully drawn, so turning the animation off IS the escort.
    expect(one(".ui-pass-stamp-mark", "stroke-dashoffset")).toBe("0");
    // The print's rest clip is ONE value, read by the tail, the tear and both keyframes.
    expect(one(".ui-pass", "--pass-print-rest")).toMatch(/^inset\(-\d+px\)$/);
    expect(one(".ui-pass-tear", "clip-path")).toBe("var(--pass-print-rest)");
  });

  it("TURN's perspective sits on each turning element's OWN parent (the head for the main, the identity for the figure)", () => {
    expect(one(".ui-pass-head", "perspective")).toBe("600px");
    expect(one(".ui-pass-identity", "perspective")).toBe("600px");
  });

  it("TURN is two --dur-base halves, ease-in then --ease-out, and nothing on a pass loops", () => {
    expect(one('.ui-pass[data-turning="head"] .ui-pass-main', "animation")).toBe(
      "uiPassTurnX calc(var(--dur-base) * 2) both",
    );
    expect(one("0%", "animation-timing-function", "@keyframes uiPassTurnX")).toBe("ease-in");
    expect(one("50.01%", "animation-timing-function", "@keyframes uiPassTurnX")).toBe("var(--ease-out)"); // prettier-ignore
    for (const d of animated) expect(d.value, d.selector).not.toMatch(/infinite|alternate/);
  });

  it("STAMP then PRINT: the print starts after the stamp, and the torn foot after the body", () => {
    expect(one(".ui-pass", "--pass-print-delay")).toBe("640ms");
    expect(one(".ui-pass", "--pass-print-dur")).toBe("1.05s");
    expect(one(".ui-pass[data-stamping] .ui-pass-tail", "animation")).toMatch(
      /^uiPassPrint var\(--pass-print-dur\) cubic-bezier\([^)]*\) var\(--pass-print-delay\) both$/,
    );
    expect(one(".ui-pass[data-stamping] .ui-pass-tear", "animation")).toContain(
      "calc(var(--pass-print-delay) + var(--pass-print-dur))",
    );
  });

  it("forced colours: the notches hide and the perforations stay dotted", () => {
    expect(one(".ui-pass-notch", "display", FORCED)).toBe("none");
    expect(one(".ui-pass-seam-rule", "border-color", FORCED)).toBe("CanvasText");
    expect(one(".ui-track-seg[data-dashed]", "border-style", FORCED)).toBe("dashed");
  });
});
