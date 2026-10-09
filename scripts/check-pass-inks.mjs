#!/usr/bin/env node
/**
 * Codex round 2 on #331 — the PASS IS CONSTANT PAPER, so what sits ON it reads the pass's inks.
 *
 * `CounterPass` (packages/ui) paints `--pass-paper` in BOTH themes (PATH_DESIGN round 3: "constant
 * paper with constant inks, never redefined in Night"). A host that styles its own content inside
 * the pass with a THEME token inherits Night's value on that paper: `--tx` becomes `#f3ecdf` on
 * `#fffdf8`, and the counter pass's total — the one number the register reads — all but vanished.
 *
 * The rule, PARSED (LEARNINGS #60 — a CSS guard cannot use a JS parser, so it constrains the scan):
 *   · tokens.css, comments stripped: the THEME-CHANGING set is every custom property the `.dark`
 *     block declares (read, never listed here, so a token Night starts redefining joins it);
 *   · each app stylesheet, comments stripped, walked block by block (nested `@media` included);
 *   · a rule is IN THE PASS when its selector names an in-pass class (`IN_PASS` below — the host
 *     classes that render inside a `CounterPass`; page furniture beside the pass is named apart);
 *   · no declaration VALUE in such a rule may read a theme-changing token (`var(--tx)`, a fallback
 *     `var(--pass-ink, var(--tx))` included). A custom-property DEFINITION is checked the same way:
 *     remapping `--tx: var(--pass-ink)` for a hosted subtree is the sanctioned shape.
 *
 * ⚠️ AND THE FOCUS RING (the blind pass on #331). A GLOBAL `:focus-visible` rule reaches inside the
 * pass with no in-pass selector at all — Night's `--ac` #e7a53a on the paper is ≈2.1:1, under the
 * 3:1 non-text bar. So: when any rule outside the pass draws a focus outline from a theme token, an
 * in-pass `:focus-visible` rule must draw it on a `--pass-*` ink (it out-specifies the global one).
 *
 * Red-first, induced and watched: the global ring with no in-pass override; the shipped PD2 rules (`--tx` on `.counter-pass-amount`, `--t2` /
 * `--t3` / `--bd` on the label, the dot and the disclosure); a theme token inside a nested `@media`;
 * one inside a selector LIST where only one selector is in the pass; a fallback chain. A theme token
 * in a COMMENT stays clean.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const TOKENS = "packages/ui/src/tokens.css";
const SHEETS = ["apps/qr/app/globals.css"];
/** Host classes rendered INSIDE a CounterPass (a class token, matched whole). */
const IN_PASS = /\.counter-pass(?:-[\w-]+)?(?![\w-])/;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** Yield every leaf rule `{ selector, body, line }` — blocks whose body holds no nested block. */
function* rules(css) {
  const stack = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      stack.push({ prelude: css.slice(start, i).trim(), open: i, nested: false });
      if (stack.length > 1) stack[stack.length - 2].nested = true;
      start = i + 1;
    } else if (ch === "}") {
      const b = stack.pop();
      if (!b) throw new Error("unbalanced braces");
      if (!b.nested) {
        const line = css.slice(0, b.open).split("\n").length;
        yield { selector: b.prelude, body: css.slice(b.open + 1, i), line };
      }
      start = i + 1;
    } else if (ch === ";" && stack.length === 0) {
      start = i + 1; // an at-rule statement (`@import …;`) at the top level
    }
  }
  if (stack.length) throw new Error("unbalanced braces");
}

const tokensCss = stripComments(readFileSync(join(ROOT, TOKENS), "utf8"));
const themed = new Set();
for (const r of rules(tokensCss)) {
  if (r.selector.trim() !== ".dark") continue;
  for (const m of r.body.matchAll(/(--[\w-]+)\s*:/g)) themed.add(m[1]);
}
if (themed.size === 0) {
  console.error(
    `pass inks … ✗ — no \`.dark\` block found in ${TOKENS}: the guard cannot know the theme.`,
  );
  process.exit(1);
}

const bad = [];
let inPass = 0;
const focusLeaks = [];
let passFocus = 0;
const PASS_ROOT_FOCUS = /^\.counter-pass\s+\*?:focus-visible$/;
const UNIVERSAL_FOCUS = /^(\*|:where\([^)]*\)\s*)?:focus(-visible)?$/;
const OUTLINE = /^\s*outline(-color)?\s*:/;
const readsThemed = (value) =>
  [...value.matchAll(/var\(\s*(--[\w-]+)/g)].some((m) => themed.has(m[1]));
for (const file of SHEETS) {
  const css = stripComments(readFileSync(join(ROOT, file), "utf8"));
  for (const r of rules(css)) {
    if (r.selector.startsWith("@")) continue;
    const sels = r.selector.split(",");
    const outlines = r.body.split(";").filter((d) => OUTLINE.test(d));
    // A ring that reaches EVERY element — a bare `:focus-visible` (or `*:focus-visible`) — reaches
    // inside the pass; a class-scoped one reaches only its own class.
    if (sels.some((sel) => UNIVERSAL_FOCUS.test(sel.trim()))) {
      for (const d of outlines)
        if (readsThemed(d.slice(d.indexOf(":") + 1)))
          focusLeaks.push(`${file}:${r.line} \`${r.selector.replace(/\s+/g, " ")}\` — ${d.trim()}`);
    }
    if (!sels.some((sel) => IN_PASS.test(sel))) continue;
    inPass++;
    if (
      // The override must cover EVERY focusable descendant of the pass host — the root class over a
      // universal `:focus-visible` — not one class that happens to sit inside it.
      sels.some((sel) => PASS_ROOT_FOCUS.test(sel.trim())) &&
      outlines.some((d) => /var\(\s*--pass-/.test(d) && !readsThemed(d.slice(d.indexOf(":") + 1)))
    )
      passFocus++;
    for (const decl of r.body.split(";")) {
      const value = decl.slice(decl.indexOf(":") + 1);
      if (decl.indexOf(":") < 0) continue;
      for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (themed.has(m[1]))
          bad.push(
            `${file}:${r.line} \`${r.selector.replace(/\s+/g, " ")}\` reads ${m[1]} — ${decl.trim()}`,
          );
      }
    }
  }
}
if (inPass === 0) {
  console.error(
    "pass inks … ✗ — no in-pass rule found: the guard matched nothing (renamed classes?).",
  );
  process.exit(1);
}
if (focusLeaks.length && passFocus === 0)
  bad.push(
    ...focusLeaks.map(
      (l) =>
        `${l}\n      reaches inside the pass, and no in-pass \`:focus-visible\` rule draws the ring on a --pass-* ink`,
    ),
  );
if (bad.length) {
  console.error(
    `pass inks — content on the constant paper reads the pass's inks … \x1b[31m✗\x1b[0m\n\n  ` +
      bad.join("\n  ") +
      `\n\n  The pass is constant paper in BOTH themes; a theme token here takes Night's value on it.\n` +
      `  Read --pass-ink / --pass-ink-2 / --pass-ink-3 / --pass-edge, or remap the theme token for a\n` +
      `  hosted subtree (\`--tx: var(--pass-ink)\`).\n`,
  );
  process.exit(1);
}
console.log(
  `pass inks — content on the constant paper reads the pass's inks … \x1b[32mclean\x1b[0m\x1b[2m (${inPass} in-pass rules, ${themed.size} theme tokens)\x1b[0m`,
);
