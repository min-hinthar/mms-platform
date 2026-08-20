#!/usr/bin/env node
/**
 * W22d — the tokens that ESCAPE the token system, and the guard that pins them to it.
 *
 * `contrast-audit.test.ts` parses `tokens.css` and checks every text×surface pair, so a token edit
 * is caught automatically. But FOUR surfaces cannot read a CSS custom property at all, and each one
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
 *   3. `apps/qr/app/globals.css`'s `@media print { html.dark { … } }` re-pin — Night tokens forced
 *      back to their light values so a dark-mode diner's printout is not white-on-white. It is a
 *      hand-copied duplicate of `:root`, and it drifted IN THE SAME COMMIT that added this guard:
 *      `--gold-strong` was pasted from `--ac-strong` and `--jade-strong` was a value that existed
 *      nowhere in the repo. The lesson is the guard's own: prose saying "values = the light theme's
 *      own" is not enforcement, and the author of the rule is not exempt from it.
 *   4. `apps/qr/lib/stripe-client.ts`'s `FALLBACK` map — the appearance values Stripe's iframe gets
 *      when a custom property is read before the stylesheet applies. Another hand-copied set, whose
 *      comment claimed this script pinned it before this script actually did.
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
  // Normalised so `rgba(58, 35, 23, 0.1)` and `rgba(58,35,23,.1)` compare equal — `--bd` is an rgba
  // in both blocks, so this cannot be hex-only. Whitespace is the only thing collapsed; a real value
  // difference still fails.
  const norm = (v) => (v ?? "").toLowerCase().replace(/\s+/g, "");
  const a = norm(actual);
  const e = norm(expected);
  if (!e) {
    failures.push(`${label}: could not resolve the token from ${TOKENS}`);
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

// ── 3. The print re-pin ─────────────────────────────────────────────────────────────────────────
// `@media print { html.dark { … } }` forces every Night token back to its light value. Each one must
// BE the light value: a printout is paper, and paper has no theme.
const CSS = "apps/qr/app/globals.css";
const cssSrc = read(CSS);
const printBlock = /@media print\s*\{[\s\S]*?html\.dark\s*\{([\s\S]*?)\}/.exec(cssSrc);
if (!printBlock)
  failures.push(`${CSS}: could not find the \`@media print\` → \`html.dark\` re-pin block`);
else {
  const body = printBlock[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const decls = [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)];
  if (decls.length === 0) failures.push(`${CSS}: the print re-pin block declares no tokens`);
  for (const [, name, value] of decls) {
    // Only hex is comparable; `--bd` is an rgba() the light block also states as rgba, so compare
    // textually for anything that is not a hex triple.
    const want = light[name];
    if (want === undefined) {
      failures.push(`print re-pin · ${name}: re-pinned but absent from :root — nothing to match`);
      continue;
    }
    expectHex(`print re-pin · ${name}`, value.trim(), want, CSS);
  }
}

// ── 4. Stripe appearance fallbacks ──────────────────────────────────────────────────────────────
// These paint the Payment Element when `getPropertyValue` comes back empty (a custom property read
// before the stylesheet applies — a cold load on a slow connection). They are per-theme, so each set
// must match its own block.
const STRIPE = "apps/qr/lib/stripe-client.ts";
const stripeSrc = read(STRIPE);
const TOKEN_FOR = { ac: "--ac", cd: "--cd", tx: "--tx", t2: "--t2", warn: "--warn" };
for (const [theme, map] of [
  ["light", light],
  ["dark", dark],
]) {
  const block = new RegExp(`${theme}:\\s*\\{([^}]*)\\}`).exec(stripeSrc);
  if (!block) {
    failures.push(`${STRIPE}: could not find the \`${theme}\` FALLBACK block`);
    continue;
  }
  for (const [key, token] of Object.entries(TOKEN_FOR)) {
    const got = new RegExp(`${key}:\\s*"(#[0-9a-fA-F]{3,8})"`).exec(block[1])?.[1];
    expectHex(`stripe fallback · ${theme} ${key}`, got, map[token], STRIPE);
  }
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
    "\n  None of these can read a CSS custom property: the offline shell ships before any stylesheet,\n" +
      "  themeColor is consumed by browser chrome before first paint, the print block exists to FORCE\n" +
      "  tokens off their theme, and Stripe's fallbacks fire when a property read returns empty. So\n" +
      "  each one carries hand-copied hex, and the only way to SEE a drift is to go offline, print\n" +
      "  from Night, or watch a card form on a cold load. Update the copy to match tokens.css.\n",
  ),
);
process.exit(1);
