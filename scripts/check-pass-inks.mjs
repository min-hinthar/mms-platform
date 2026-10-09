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
 * ⚠️ AND THE FOCUS RING (the blind passes on #331). A focus rule whose SUBJECT carries no class or
 * id (`:focus-visible`, `*:focus-visible`, `.dark :focus-visible`, `html :focus-visible`,
 * `button:focus-visible`) can match an element inside the pass — Night's `--ac` #e7a53a on the paper
 * is ≈2.1:1, under the 3:1 non-text bar. When any such rule draws an outline from a theme token, THE
 * override must exist and WIN against it:
 *   · selector exactly the pass root over a universal ring (`.counter-pass :focus-visible`), so it
 *     covers every focusable descendant, not one class inside the pass;
 *   · its outline colour is exactly `var(--pass-ac)` — the ink contrast-audit.test.ts pins ≥ 3:1 on
 *     the paper; THIS guard is the pin that the ring IS that ink (any other `--pass-*` is refused);
 *   · in no at-rule (an override inside `@media print` does nothing on a screen);
 *   · higher specificity than every leaking rule, or equal and later in the sheet.
 *
 * Red-first, induced and watched: the shipped PD2 rules (`--tx` on `.counter-pass-amount`, `--t2` /
 * `--t3` / `--bd` on the label, the dot and the disclosure); a theme token inside a nested `@media`;
 * one inside a selector LIST where only one selector is in the pass; a fallback chain; the global
 * ring with no override; the override narrowed to one in-pass class; `*:focus-visible`; the override
 * on `var(--pass-paper)`; the override inside `@media print`; a later `.dark :focus-visible` (equal
 * specificity, later in the sheet); `.dark button:focus-visible` (higher specificity). Seen and
 * correctly beaten (clean): `html :focus-visible`, `button:focus-visible`. A theme token in a COMMENT
 * stays clean.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const TOKENS = "packages/ui/src/tokens.css";
const SHEETS = ["apps/qr/app/globals.css"];
/** Host classes rendered INSIDE a CounterPass (a class token, matched whole). */
const IN_PASS = /\.counter-pass(?:-[\w-]+)?(?![\w-])/;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** Yield every leaf rule `{ selector, body, line, at, order }` — blocks whose body holds no nested
 *  block; `at` lists the enclosing at-rule preludes, `order` is the rule's position in the sheet. */
function* rules(css) {
  let order = 0;
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
        const at = stack.map((a) => a.prelude);
        yield { selector: b.prelude, body: css.slice(b.open + 1, i), line, at, order: order++ };
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
const overrides = [];
const PASS_ROOT_FOCUS = /^\.counter-pass\s+\*?:focus-visible$/;
const OUTLINE = /^\s*outline(-color)?\s*:/;
/** The compound a selector's rule applies to: the part after the last combinator. */
const subjectOf = (sel) => {
  const t = sel.trim().replace(/:where\([^)]*\)/g, "");
  const parts = t.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
};
/** A focus rule that can reach an element INSIDE the pass: its subject is a focus pseudo with no
 *  class and no id to keep it out (a bare, universal, type or attribute subject). */
const reachesThePass = (sel) => {
  const subj = subjectOf(sel);
  return /:focus(-visible|-within)?\b/.test(subj) && !/[.#]/.test(subj);
};
/** Specificity [ids, classes|attrs|pseudo-classes, types|pseudo-elements] — `:where()` counts 0. */
const specificity = (sel) => {
  const t = sel.trim().replace(/:where\([^)]*\)/g, "");
  const ids = (t.match(/#[\w-]+/g) ?? []).length;
  const pseudoEls = (t.match(/::[\w-]+/g) ?? []).length;
  const classes =
    (t.match(/\.[\w-]+/g) ?? []).length +
    (t.match(/\[[^\]]*\]/g) ?? []).length +
    (t.replace(/::[\w-]+/g, "").match(/:[\w-]+/g) ?? []).length;
  const types = (t.replace(/::[\w-]+/g, "").match(/(^|[\s>+~])([a-zA-Z][\w-]*)/g) ?? []).length;
  return [ids, classes, types + pseudoEls];
};
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const readsThemed = (value) =>
  [...value.matchAll(/var\(\s*(--[\w-]+)/g)].some((m) => themed.has(m[1]));
for (const file of SHEETS) {
  const css = stripComments(readFileSync(join(ROOT, file), "utf8"));
  for (const r of rules(css)) {
    if (r.selector.startsWith("@")) continue;
    const sels = r.selector.split(",");
    const outlines = r.body.split(";").filter((d) => OUTLINE.test(d));
    for (const sel of sels) {
      if (!reachesThePass(sel)) continue;
      for (const d of outlines)
        if (readsThemed(d.slice(d.indexOf(":") + 1)))
          focusLeaks.push({
            where: `${file}:${r.line} \`${sel.trim()}\`${r.at.length ? ` in ${r.at.join(" › ")}` : ""} — ${d.trim()}`,
            spec: specificity(sel),
            order: r.order,
          });
    }
    if (!sels.some((sel) => IN_PASS.test(sel))) continue;
    inPass++;
    // THE override: the pass root over a universal ring, in no at-rule, its outline colour exactly
    // `var(--pass-ac)` and nothing else.
    const root = sels.find((sel) => PASS_ROOT_FOCUS.test(sel.trim()));
    if (
      root &&
      r.at.length === 0 &&
      outlines.length > 0 &&
      outlines.every((d) => {
        const refs = [...d.slice(d.indexOf(":") + 1).matchAll(/var\(\s*(--[\w-]+)/g)].map(
          (m) => m[1],
        );
        return refs.length > 0 && refs.every((x) => x === "--pass-ac");
      })
    )
      overrides.push({ spec: specificity(root), order: r.order });
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
for (const leak of focusLeaks) {
  const beaten = overrides.some((o) => {
    const c = cmp(o.spec, leak.spec);
    return c > 0 || (c === 0 && o.order > leak.order);
  });
  if (!beaten)
    bad.push(
      `${leak.where}\n      reaches inside the pass, and no \`.counter-pass :focus-visible { outline-color: var(--pass-ac) }\`\n      (in no at-rule) out-specifies it — the paper's ring would be the theme's`,
    );
}
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
  `pass inks — content on the constant paper reads the pass's inks … \x1b[32mclean\x1b[0m\x1b[2m (${inPass} in-pass rules, ${themed.size} theme tokens, ${focusLeaks.length} theme focus ring(s) reaching the pass, each out-specified by the --pass-ac override)\x1b[0m`,
);
