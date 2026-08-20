#!/usr/bin/env node
/**
 * W22d — the tokens that ESCAPE the token system, and the guard that pins them to it.
 *
 * `contrast-audit.test.ts` parses `tokens.css` and checks every text×surface pair, so a token edit
 * is caught automatically. But three surfaces cannot read a CSS custom property at all, and each one
 * therefore carries a hand-copied hex that nothing has ever cross-checked:
 *
 *   1. `apps/qr/sw/sw.ts` — the offline shell is a STRING baked into the service worker. It ships
 *      before any stylesheet exists, so it cannot use `var()`. It had ALREADY drifted when this
 *      guard was written: `#1d1a2e` / `#f3effa` against a `--tx` of `#1b1714` / `#f3ecdf`. Nobody
 *      noticed, because the only way to see it is to go offline in both themes and compare by eye.
 *   2. `apps/qr/app/layout.tsx` — `viewport.themeColor` is metadata, consumed by the browser chrome
 *      before the page paints. Its own comment already says these MUST match `--pg` or the
 *      address-bar seam over the Night purple comes back (audit U-Q5) — a rule stated in prose and
 *      enforced by nothing.
 *
 * These are the "green for the wrong reason" class one step out: the audit is rigorous about the
 * values it can see, which makes it easy to believe the whole palette is covered. It is not.
 *
 * The check is deliberately a grep rather than a test: it spans `packages/ui` and `apps/qr`, and
 * `apps/qr`'s vitest is `environment: "node"` with no DOM, while `packages/ui`'s suite cannot reach
 * into the app. Neither runner owns this seam.
 *
 * Red-first: change any pinned value on either side and watch this go red before trusting it.
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

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

// ── The source of truth: the same file, parsed the same way, as the contrast audit ──────────────
const TOKENS = "packages/ui/src/tokens.css";
const tokensCss = read(TOKENS);

function parseBlock(selector) {
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`);
  const body = (re.exec(tokensCss)?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const map = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
}
const light = parseBlock(":root");
const dark = parseBlock(".dark");

const failures = [];
const checked = [];

function expectHex(label, actual, expected, where) {
  const a = (actual ?? "").toLowerCase();
  const e = (expected ?? "").toLowerCase();
  if (!e.startsWith("#")) {
    failures.push(`${label}: could not resolve the token from ${TOKENS} (got "${expected}")`);
    return;
  }
  if (a !== e)
    failures.push(`${label}: ${where} has ${actual ?? "(not found)"}, tokens.css says ${expected}`);
  else checked.push(`${label} ${expected}`);
}

// ── 1. The service worker's offline shell ───────────────────────────────────────────────────────
// It is one <style> string; the light values live in the `body {}` rule and the dark ones in the
// `prefers-color-scheme: dark` override. Matched structurally rather than by line number so the
// guard survives the shell being re-indented.
const SW = "apps/qr/sw/sw.ts";
const swSrc = read(SW);
const swLight =
  /body\s*\{[^}]*?background:\s*(#[0-9a-fA-F]{3,8})\s*;\s*color:\s*(#[0-9a-fA-F]{3,8})\s*;/.exec(
    swSrc,
  );
const swDark =
  /prefers-color-scheme:\s*dark\s*\)\s*\{\s*body\s*\{\s*background:\s*(#[0-9a-fA-F]{3,8})\s*;\s*color:\s*(#[0-9a-fA-F]{3,8})\s*;/.exec(
    swSrc,
  );

if (!swLight)
  failures.push(
    `${SW}: could not find the offline shell's light \`body { background; color; }\` rule`,
  );
else {
  expectHex("sw offline shell · light background", swLight[1], light["--pg"], SW);
  expectHex("sw offline shell · light text", swLight[2], light["--tx"], SW);
}
if (!swDark)
  failures.push(
    `${SW}: could not find the offline shell's \`prefers-color-scheme: dark\` override`,
  );
else {
  expectHex("sw offline shell · dark background", swDark[1], dark["--pg"], SW);
  expectHex("sw offline shell · dark text", swDark[2], dark["--tx"], SW);
}

// ── 2. viewport.themeColor ──────────────────────────────────────────────────────────────────────
// The browser paints its own chrome with these BEFORE the page renders, so a mismatch with --pg is
// a visible seam at the top of every screen — worst over the Night ground, which is why U-Q5 filed
// it in the first place.
const LAYOUT = "apps/qr/app/layout.tsx";
const layoutSrc = read(LAYOUT);
const themeColorBlock = /themeColor:\s*\[([\s\S]*?)\]/.exec(layoutSrc);
if (!themeColorBlock) failures.push(`${LAYOUT}: could not find the \`themeColor\` array`);
else {
  const body = themeColorBlock[1];
  const pick = (scheme) =>
    new RegExp(
      `prefers-color-scheme:\\s*${scheme}\\s*\\)"[^}]*?color:\\s*"(#[0-9a-fA-F]{3,8})"`,
    ).exec(body)?.[1];
  expectHex("viewport.themeColor · light", pick("light"), light["--pg"], LAYOUT);
  expectHex("viewport.themeColor · dark", pick("dark"), dark["--pg"], LAYOUT);
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log(c.green("clean") + c.dim(` — ${checked.length} out-of-token values match ${TOKENS}`));
  for (const ok of checked) console.log(c.dim(`    ${ok}`));
  process.exit(0);
}

console.error(c.red(c.bold("\n✗ values that escaped the token system and drifted:\n")));
for (const f of failures) console.error(`    ${f}`);
console.error(
  c.dim(
    "\n  These surfaces cannot read a CSS custom property — the service worker's offline shell ships\n" +
      "  before any stylesheet, and themeColor is consumed by browser chrome before first paint. So\n" +
      "  the hex is copied by hand, and the only way to SEE a drift is to go offline, or to look at\n" +
      "  the address bar, in both themes. Update the copy to match tokens.css.\n",
  ),
);
process.exit(1);
