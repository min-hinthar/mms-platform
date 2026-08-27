#!/usr/bin/env node
/**
 * W22d/PR A — the gap between "the palette is AA" and "the SCREEN is AA".
 *
 * `contrast-audit.test.ts` asserts TOKEN pairs: this text token on that surface token clears 4.5.
 * It is rigorous, and it cannot see a call site. Its own light-theme negative guards say the vivid
 * hues must STAY below 4.5 as text — that is the whole reason the `-strong` variants exist — and
 * that guard has now been violated by real CSS twice, with nothing connecting the two facts:
 *
 *   1. W22d-1 — `.lend-banner-back` and `.wb-method` both shipped `color: var(--ac)` on an accent
 *      tint over `--sf`, scoring 3.53 and 3.70 in light. The negative guard `plain ac on sf` had
 *      declared exactly that impossible, and stayed green while two live pills failed AA.
 *   2. This pass — `.orb-col-ready h2`, the ORDER-READY column heading on the wall board, shipped
 *      `color: var(--gold)` on `--pg`: **1.97:1 in light**, under even the 3:1 large-text bar. Found
 *      by hand while sweeping the diff, not by any guard.
 *
 * So this script asks the question the audit structurally cannot: *which token is used as text?*
 *
 * SCOPE, deliberately narrow. It bans only the hues that are NEVER a legitimate light text colour on
 * any ground the app paints — measured, not assumed:
 *
 *   --gold  #e8a83c → 1.97 on --pg, 1.97 on --cd, 2.10 on --sf   (--gold-strong #8a5a00 → 5.63)
 *   --ac2   #f6d9a8 → the gradient's SECOND stop, 3.25 on --pg; the audit already guards it
 *
 * `--ac` is deliberately NOT banned: the audit asserts `ac on pg` and `ac on cd` as PASSING pairs
 * (4.67 / 4.71 in light), so plain `--ac` is legitimate as text on a solid page or card and a
 * blanket ban would be false. Its real rule is surface-dependent — `--ac` on `--sf` or on a tint is
 * what fails — and that needs the computed background, which a grep does not have. Filed rather than
 * faked (M87): a full text×surface sweep is a project, not a regex.
 *
 * Red-first: this script was written BEFORE the `.orb-col-ready h2` fix and watched reporting it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Hue → the variant a call site should reach for instead, plus what that swap costs in DARK.
 *
 * ⚠️ The dark note is per-hue and NOT templated, because the templated version was wrong and said so
 * confidently. It read "…aliases ${hue} in dark so Night is unchanged", which is true of
 * `--gold-strong` (declared `var(--gold)` in `.dark`) and FALSE of `--ac-strong` when the offending
 * token is `--ac2`: `--ac-strong` aliases `--ac` (#e7a53a), while `--ac2` is #f4c879, so that swap
 * does move Night. A guard that hands the next reader a fabricated reassurance is worse than one
 * that says nothing — the diagnosis is the part they act on.
 */
const NOT_TEXT = {
  "--gold": {
    strong: "--gold-strong",
    dark: "--gold-strong aliases --gold in .dark, so Night is byte-identical",
  },
  "--ac2": {
    strong: "--ac-strong",
    dark: "⚠️ this DOES change Night — --ac-strong aliases --ac (#e7a53a), not --ac2 (#f4c879)",
  },
};

/**
 * Files swept. `globals.css` is where the app's own CSS lives; `packages/ui` components carry their
 * colours inline in TSX, which is why `badge.tsx` is read here too — it is the one UI file that maps
 * a tone to a text colour, and it is where a wrong `-strong` would be least visible.
 */
const FILES = ["apps/qr/app/globals.css", "packages/ui/src/badge.tsx"];

/**
 * ⚠️ `border-color:`, `background-color:`, `accent-color:`, `outline-color:` and friends ALL end in
 * `color:`. A naive /color:\s*var\(--gold\)/ matches every one of them — the first version of this
 * sweep reported `border-color: var(--jade)` and `accent-color: var(--jade)` as text uses and would
 * have "found" two defects that do not exist. The preceding character must therefore be checked: a
 * `-` before `color` means it is some other property.
 *
 * `fill:` and `stroke:` are NOT swept. They paint SVG, and the one hit that matters
 * (`.home-hero-mark`, the brand star, `fill: currentColor` off `color: var(--gold)`) is a logotype —
 * WCAG 1.4.11 exempts brand marks from contrast entirely, and repainting one is a brand decision and
 * not a guard's. It is filed for the owner (M88) rather than silently "fixed" here.
 */
/**
 * The ONE exemption, named with its reason rather than skipped — the same discipline
 * `check-theme-parity.mjs`'s light-vellum carve-out uses, and for the same reason: a silent skip is
 * the quietest hole a guard can have.
 *
 * `.home-hero-mark` sets `color` purely to feed `fill: currentColor` on the brand star SVG beneath
 * it. WCAG 1.4.11 exempts logotypes and brand marks from contrast requirements outright, and what
 * colour the mark is painted is a BRAND decision — not something a lint script gets to make. It is
 * filed for the owner (M88) with its measured 1.97:1 on cream, and left alone here.
 *
 * The exemption is self-closing: if the selector is ever renamed or removed, this fails and asks for
 * re-triage rather than quietly covering nothing.
 */
const EXEMPT = [
  {
    selector: ".home-hero-mark",
    file: "apps/qr/app/globals.css",
    why: "brand star SVG (fill: currentColor) — WCAG 1.4.11 exempts logotypes; filed as M88",
  },
];

/** The selector heading the CSS rule a given line sits in — the nearest preceding line ending `{`. */
function ruleFor(lines, i) {
  for (let j = i; j >= 0; j--) {
    const m = /^\s*([^{}]*\S)\s*\{\s*$/.exec(lines[j]);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Comments are BLANKED, not deleted — line numbers have to survive, because every message this
 * script prints is a `file:line` a human is going to jump to.
 *
 * ⚠️ This is not optional tidiness, and the proof is this file's own history: the fix for
 * `.orb-col-ready h2` carries a comment explaining why it must be `--gold-strong`, and that comment
 * quotes the banned `color: var(--gold)` verbatim. Without this step the guard reported its own
 * documentation as the defect — green code, red guard, pointing at prose nobody renders. It is the
 * same lesson `check-theme-parity.mjs` learned twice, so the `//` half is copied from it deliberately:
 * a `//` preceded by `:` is a URL scheme, never a comment, and blanking from there to end of line
 * manufactures false NEGATIVES instead.
 */
function blankComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, pre) => pre + " ".repeat(m.length - pre.length));
}

const failures = [];
const checked = [];
for (const rel of FILES) {
  const src = blankComments(readFileSync(path.join(ROOT, rel), "utf8"));
  const lines = src.split("\n");
  for (const { selector, file, why } of EXEMPT) {
    if (file !== rel) continue;
    if (!lines.some((l) => ruleFor([l], 0) === selector || l.trim() === `${selector} {`))
      failures.push(
        `${rel}: the exemption for \`${selector}\` no longer matches any rule — it was granted ` +
          `because: ${why}. Re-triage it (has the mark moved? been repainted?) rather than ` +
          `leaving an exemption that covers nothing.`,
      );
  }
  for (const [hue, { strong, dark }] of Object.entries(NOT_TEXT)) {
    // Both the CSS form (`color: var(--gold)`) and the JSX form (`color: "var(--gold)"`).
    const re = new RegExp(`(^|[^-\\w])color:\\s*"?var\\(${hue}\\)`);
    let hits = 0;
    lines.forEach((line, i) => {
      if (!re.test(line)) return;
      const sel = ruleFor(lines, i);
      const ex = EXEMPT.find((e) => e.file === rel && e.selector === sel);
      if (ex) {
        checked.push(`${rel}:${i + 1} ${sel} — exempt: ${ex.why}`);
        return;
      }
      hits++;
      failures.push(
        `${rel}:${i + 1}${sel ? ` (${sel})` : ""}: \`color: var(${hue})\` — ${hue} is a FILL hue, ` +
          `never text (it does not clear 4.5:1 as light text on any ground the app paints). Use ` +
          `${strong}, which is defined for exactly this — ${dark}.`,
      );
    });
    if (hits === 0) checked.push(`${rel} — no unexempted \`color: var(${hue})\``);
  }
}

if (failures.length === 0) {
  console.log(
    c.green("clean") +
      c.dim(` — no fill-only hue is used as text (${checked.length} file×hue combinations swept)`),
  );
  for (const ok of checked) console.log(c.dim(`    ${ok}`));
  process.exit(0);
}

console.error(c.red(c.bold("\n✗ a fill-only hue is being used as text:\n")));
for (const f of failures) console.error(`    ${f}`);
console.error(
  c.dim(
    "\n  The contrast audit asserts TOKEN pairs and cannot see a call site, so a rule it states\n" +
      "  correctly can still be violated by real CSS with every test green — which has now happened\n" +
      "  twice (W22d-1's two accent pills, and the order-ready wall board's heading at 1.97:1).\n" +
      "  This sweep is the missing link between the two.\n",
  ),
);
process.exit(1);
