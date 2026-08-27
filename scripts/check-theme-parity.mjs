#!/usr/bin/env node
/**
 * W22d — the tokens that ESCAPE the token system, and the guard that pins them to it.
 *
 * `contrast-audit.test.ts` parses `tokens.css` and checks every text×surface pair, so a token edit
 * is caught automatically. But SIX surfaces cannot read a CSS custom property at all, and each one
 * therefore carries a hand-copied hex that nothing had ever cross-checked. (5 and 6 were added after
 * this list was first written; the number was bumped without them being listed, which is its own
 * small instance of the drift below.)
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
 *   5. `apps/qr/app/opengraph-image.tsx` — Satori renders the card to PNG at build time and resolves
 *      no custom properties, so its palette is literal; the file's own comment said "keep in sync",
 *      which is the prose-with-no-enforcement pattern this script replaces.
 *   6. `apps/qr/emails/*` — five React Email templates. Email clients load no external CSS at all.
 *      The biggest of the six by value count, and the last to be covered (M83).
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
import { readFileSync, readdirSync } from "node:fs";
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

/**
 * Follow `var(--x)` chains inside a block, the way `contrast-audit.test.ts`'s `tok()` does and the
 * way a browser does — so a token's VALUE is compared, never the alias text that stands for it.
 *
 * ⚠️ Codex round 2 on #235 supplied the scenario and it reproduces exactly: define
 * `--vellum-ground: #faf7ef`, alias `--sf: var(--vellum-ground)`, mirror that alias in the print
 * re-pin, and the whole script reports CLEAN — while light `--surface-vellum` now renders identical
 * to `--sf`, i.e. the staleness the exemption exists to catch. Two separate reads went wrong at
 * once: the staleness comparison read `--sf` as unparseable and treated that as "not stale", and
 * the print re-pin compared the alias STRING to itself and called it a match. Aliases are not
 * hypothetical here — `.dark` already ships `--ac-strong: var(--ac)`, `--gold-strong: var(--gold)`.
 *
 * `.dark` overrides `:root` rather than replacing it, so a chain may cross blocks; the fallback map
 * models that. Non-`var()` values pass through untouched (`--bd` is an rgba in both blocks).
 */
function resolve(map, value, fallback = light, depth = 0) {
  const v = (value ?? "").trim();
  if (depth > 5 || !v.startsWith("var(")) return v;
  const ref = v.slice(4, -1).trim().split(",")[0].trim();
  const next = map[ref] ?? fallback[ref];
  if (next === undefined) return v;
  return resolve(map, next, fallback, depth + 1);
}

const failures = [];
const checked = [];

function expectHex(label, actual, expected, where) {
  // Normalised so `rgba(58, 35, 23, 0.1)` and `rgba(58,35,23,.1)` compare equal — `--bd` is an rgba
  // in both blocks, so this cannot be hex-only. Whitespace is the only thing collapsed; a real value
  // difference still fails.
  // ⚠️ RESOLVED before comparison. Comparing the raw text let `var(--x)` match `var(--x)` and call
  // it agreement without either side ever being reduced to a colour (Codex round 2) — so a mirrored
  // alias satisfied the print re-pin while saying nothing about what actually prints.
  const norm = (v) =>
    resolve(light, v ?? "", light)
      .toLowerCase()
      .replace(/\s+/g, "");
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
const swFile = read(SW);
// ⚠️ ANCHOR INSIDE THE SHELL LITERAL. The first version searched the whole file, and an adversarial
// pass proved two failure modes: a second `body { … }` rule anywhere earlier in the file made the
// real shell drift SILENTLY PASS, and inserting one declaration between `background` and `color`
// made the light regex fall through to the dark rule and report a confident wrong answer. A grep
// guard that can match the wrong thing is worse than none — it reports on a file it never read.
const shell = /const OFFLINE_HTML = `([\s\S]*?)`;/.exec(swFile);
if (!shell) failures.push(`${SW}: could not find the \`OFFLINE_HTML\` template literal`);
const swSrc = shell?.[1] ?? "";
// The light rule must come BEFORE the dark override, so the light search is bounded to the text
// preceding it — that is what stops a fall-through from silently answering with dark's values.
const darkAt = swSrc.search(/@media\s*\(\s*prefers-color-scheme:\s*dark/);
const swLightRegion = darkAt === -1 ? swSrc : swSrc.slice(0, darkAt);
const swLight =
  /body\s*\{[^}]*?background:\s*(#[0-9a-fA-F]{3,8})\s*;[^}]*?color:\s*(#[0-9a-fA-F]{3,8})\s*;/.exec(
    swLightRegion,
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

// ── 5. The OpenGraph card ───────────────────────────────────────────────────────────────────────
// Satori renders this PNG at build time and cannot resolve CSS custom properties, so the palette is
// literal — and the file's own comment already says "Keep in sync if the tokens change", which is
// the prose-with-no-enforcement pattern this whole script exists to replace. The values are named in
// that comment, so they are read from it rather than from the JSX (the JSX spreads them across
// nested style objects, and matching a colour to a ROLE there would be guesswork).
const OG = "apps/qr/app/opengraph-image.tsx";
const ogSrc = read(OG);
for (const [hex, token] of [...ogSrc.matchAll(/(#[0-9a-fA-F]{6})\s*=\s*(--[\w-]+)/g)].map((m) => [
  m[1],
  m[2],
])) {
  expectHex(`opengraph palette · ${token}`, hex, light[token], OG);
}

// ── 6. The email templates (M83) ────────────────────────────────────────────────────────────────
// The largest surface of all, and the one that went uncovered longest: five React Email templates
// carrying 48 hand-copied hex literals. Email clients load no external CSS and resolve no custom
// properties, so `var(--tx)` renders blank — the values MUST be baked. What was missing was the link
// back, and the consequence is not hypothetical: three of these had already drifted to values
// matching no token at all (`#9b8f82` was failing AA at 3.00:1 on the body when W22d-1 found it;
// `#e8e2d9` and a lone `rgba(58,35,23,0.12)` were inventions that survived until this pass).
//
// They now come from ONE table, `apps/qr/emails/palette.ts`, where each entry names the light token
// it mirrors in its own doc comment. Two assertions, because either alone is insufficient:
//   (a) every entry equals its token, so a token edit reddens rather than splitting the emails off;
//   (b) NO raw colour exists anywhere else under `apps/qr/emails/`, so a new template cannot
//       reintroduce the drift by simply not using the table. A guard on the table alone would have
//       passed on all five templates the day before this ran.
const PALETTE = "apps/qr/emails/palette.ts";
const paletteSrc = read(PALETTE);

/** `rgba(r, g, b, a)` composited over an opaque hex — sRGB, which is what a mail client does. */
function flatten(rgba, overHex) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(rgba ?? "");
  const base = /^#([0-9a-fA-F]{6})$/.exec((overHex ?? "").trim());
  if (!m || !base) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  const bg = [0, 2, 4].map((i) => parseInt(base[1].slice(i, i + 2), 16));
  return (
    "#" +
    [1, 2, 3]
      .map((i) =>
        Math.round(a * Number(m[i]) + (1 - a) * bg[i - 1])
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

// ⚠️ ANCHOR INSIDE THE TABLE, and bind each marker to ITS OWN key. The first version searched the
// whole file for `= --token` and then skipped ahead to the next `key: "#…"`, so the header's own
// prose ("Do not add a key without a `= --token` marker") matched first and bound a token named
// `--token` to the key `pg`. One entry parsed, nine silently unchecked. Same failure the offline
// shell taught: a grep that can match the wrong thing reports on text nobody renders.
const table = /export const EMAIL = \{([\s\S]*?)\n\} as const;/.exec(paletteSrc);
if (!table) failures.push(`${PALETTE}: could not find the \`export const EMAIL = { … }\` table`);
const tableBody = table?.[1] ?? "";

// Each entry is a doc comment IMMEDIATELY followed by its key — `/** = --tx · … */ tx: "#…"` — or,
// for the one DERIVED value, `= --bd over --cd`. Pairing them in a single match is what stops a
// marker from being read against a different key than the one it documents.
const paletteEntries = [
  ...tableBody.matchAll(/\/\*\*([\s\S]*?)\*\/\s*(\w+):\s*"(#[0-9a-fA-F]{3,8})"/g),
];
if (paletteEntries.length === 0)
  failures.push(`${PALETTE}: found no documented entries — the table cannot be checked`);
for (const [, doc, key, hex] of paletteEntries) {
  const marker = /=\s*(--[\w-]+)(?:\s+over\s+(--[\w-]+))?/.exec(doc);
  if (!marker) {
    failures.push(`email palette · ${key}: no \`= --token\` marker in its doc comment`);
    continue;
  }
  const [, token, overToken] = marker;
  if (overToken) {
    const want = flatten(light[token], light[overToken]);
    if (!want)
      failures.push(
        `email palette · ${key}: could not composite ${token} over ${overToken} from ${TOKENS}`,
      );
    else expectHex(`email palette · ${key} (${token} over ${overToken})`, hex, want, PALETTE);
  } else {
    expectHex(`email palette · ${key}`, hex, light[token], PALETTE);
  }
}

// Every string-valued key in the table must have been reached above.
//
// ⚠️ This deliberately does NOT require the value to start with `#`. The first version did, and an
// adversarial pass demonstrated the hole in one line: add `shade: "rgba(58,35,23,0.4)"` with no doc
// comment, use it in a template, and every guard stayed green — the completeness check could not see
// a non-hex value, `paletteEntries` never matched it, and the render sweep waved it through because
// it was in `Object.values(EMAIL)`. An unpinned colour shipping with all three guards green is
// exactly the failure surface 6 exists to prevent, and `--bd` proves non-hex entries are not
// hypothetical. The indentation anchor is gone for the same reason (a nested object at four spaces
// was invisible too); `paletteEntries` still requires a hex, so a documented non-hex entry now fails
// LOUDLY rather than silently.
const declaredKeys = [...tableBody.matchAll(/^\s*(\w+):\s*"/gm)].map((m) => m[1]);
const checkedKeys = new Set(paletteEntries.map((m) => m[2]));
for (const key of declaredKeys)
  if (!checkedKeys.has(key))
    failures.push(`email palette · ${key}: declared with no doc comment, so nothing checks it`);

// (b) — the sweep, over EVERY source file under the directory.
//
// ⚠️ RECURSIVE, and `.ts` as well as `.tsx`. The first version read the top level and matched `.tsx`
// only, so `emails/extra-styles.ts` and `emails/parts/Badge.tsx` could both carry raw colour with the
// guard green — while the commit message claimed "no raw colour exists anywhere under
// `apps/qr/emails/`". A guard whose scope is narrower than its stated claim is the claim being wrong.
//
// Comments are stripped first, because the templates legitimately discuss `#196` and the `#ffffff`
// they used to carry, and a guard that matches prose reports on text nobody renders. ⚠️ But a
// blanket `//[^\n]*` also deletes from any `//` INSIDE A STRING to end of line, so one
// `backgroundImage: "url(https://…)"` blinded the rest of its line — demonstrated with a raw
// `#ff0000` sailing straight through. The strip meant to stop false positives was manufacturing
// false negatives. A `//` preceded by `:` is a URL scheme, never a comment, so it is left alone.
const EMAIL_DIR = "apps/qr/emails";
for (const file of readdirSync(path.join(ROOT, EMAIL_DIR), { recursive: true })) {
  const name = String(file);
  if (!/\.tsx?$/.test(name)) continue;
  // `palette.ts` IS the table (checked above); a test file's fixtures are not shipped markup.
  if (name === "palette.ts" || /\.test\.tsx?$/.test(name)) continue;
  const rel = `${EMAIL_DIR}/${name}`;
  const code = read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const m of code.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g))
    failures.push(
      `${rel}: raw colour \`${m[0]}\` — every email colour must come from \`emails/palette.ts\`, ` +
        `which is the only thing this guard can pin to tokens.css`,
    );
  if (!failures.length) checked.push(`${rel} — no raw colour`);
}

// ── 7. The translucent surfaces, which cannot reference the token they ARE (W22d/PR A) ─────────
// `--surface-glass` and `--surface-vellum` are the frosted forms of `--cd` and `--sf`. CSS gives no
// way to say so: `rgba()` takes raw channels and there is no `rgba(var(--cd), 0.9)`, so each one
// hand-copies three numbers out of another token in the SAME file. That is this script's subject
// exactly — a value that escaped the token system — and it had no coverage, which is why re-hueing
// the Night ground meant editing four values in lockstep by hand and trusting the author to notice.
//
// ⚠️ ONE PAIR DOES NOT TRACK, and it is named rather than skipped. Light `--surface-vellum` is
// `rgba(250, 247, 239, …)` = #faf7ef, which is neither `--sf` (#f2efe7) nor `--pg` (#faf9f5): a
// hand-authored warm vellum that predates this check. Asserting the relationship there would be
// asserting something false, and quietly omitting it would leave a hole of the kind the header
// above keeps cataloguing — so it is listed with its reason and deliberately not compared.
/**
 * `rgba(r, g, b, a)` or `#rrggbb` → `[r, g, b]`, or null when it is neither.
 *
 * Shared by the exempt and asserted paths so a value written in EITHER form compares correctly and,
 * more importantly, so "cannot be read" is a single answer both paths must handle rather than
 * something one of them silently treats as agreement.
 */
function channels(value, map = light) {
  const v = resolve(map, value, light);
  // ⚠️ ANCHORED AT BOTH ENDS, closing paren and alpha included. The first version matched a PREFIX,
  // so `rgba(250, 247, 239, nope)` yielded three happy channels and `check:theme` reported clean —
  // Codex round 2 on #235. A custom property accepts an arbitrary token stream at parse time and
  // only fails when it is substituted into `background`, so the vellum consumers would have lost
  // their fill with every gate green. A guard that accepts a prefix is reporting on a value that
  // does not exist.
  const rgba =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:\d*\.?\d+%?)\s*)?\)$/.exec(v);
  if (rgba) {
    const ch = [1, 2, 3].map((i) => Number(rgba[i]));
    return ch.every((n) => n <= 255) ? ch : null;
  }
  const hex = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  return null;
}

const SURFACE_BASE = [
  { theme: "light", block: light, surface: "--surface-glass", base: "--cd" },
  {
    theme: "light",
    block: light,
    surface: "--surface-vellum",
    base: null,
    why: "a hand-authored warm vellum (#faf7ef) matching neither --sf nor --pg",
    // The exemption is itself checked: if light's vellum is ever brought onto one of the bases its
    // rationale says it does NOT match, the reason stops being true and this stops being an
    // exemption — it becomes an unasserted relationship that LOOKS covered because it is listed
    // here. A skip that outlives its reason is the quietest hole in this file's whole catalogue.
    //
    // ⚠️ BOTH bases from the rationale, not just one, and the check FAILS CLOSED. The first version
    // named only `--sf` and short-circuited to the green branch whenever the declaration would not
    // parse as `rgba()` — so rewriting the exempt value as `#f2efe7` (i.e. exactly `--sf`, the stale
    // condition itself) or as `var(--sf)` left the guard GREEN, and the commit message claimed a
    // non-`rgba()` value had been tested when only the NON-exempt path had been. An exemption that
    // cannot be evaluated must be a failure, never a pass: the whole point of listing it is that
    // someone checks it.
    staleIfMatches: ["--sf", "--pg"],
  },
  { theme: "dark", block: dark, surface: "--surface-glass", base: "--cd" },
  { theme: "dark", block: dark, surface: "--surface-vellum", base: "--sf" },
];
for (const { theme, block: blk, surface, base, why, staleIfMatches } of SURFACE_BASE) {
  const decl = blk[surface];
  if (!decl) {
    failures.push(`translucent surface · ${theme} ${surface}: not declared in ${TOKENS}`);
    continue;
  }
  if (!base) {
    const mine = channels(decl);
    if (!mine) {
      failures.push(
        `translucent surface · ${theme} ${surface}: exempt, but its value \`${decl}\` is neither ` +
          `an \`rgba(r, g, b, a)\` nor a 6-digit hex, so the exemption cannot be evaluated at all. ` +
          `An exemption that cannot be checked is not an exemption — state the value in a form this ` +
          `can read, or give it a \`base\` and let it be asserted.`,
      );
      continue;
    }
    // ⚠️ An unevaluable base is a FAILURE, never "not stale" — the same fail-open shape as the
    // unparseable exempt value above, one read further out (Codex round 2). If `--sf` cannot be
    // reduced to channels there is no evidence either way, and a guard must not read absence of
    // evidence as evidence of absence.
    const unresolved = staleIfMatches.filter((b) => !channels(blk[b] ?? "", blk));
    if (unresolved.length) {
      failures.push(
        `translucent surface · ${theme} ${surface}: exempt, but its rationale names ` +
          `${unresolved.join(" and ")}, which cannot be reduced to channels ` +
          `(${unresolved.map((b) => `${b}: ${blk[b] ?? "(absent)"}`).join(", ")}). The exemption ` +
          `cannot be shown to still hold, so it is not one.`,
      );
      continue;
    }
    const stale = staleIfMatches.filter((b) => {
      const want = channels(blk[b] ?? "", blk);
      return want && want.join() === mine.join();
    });
    if (stale.length)
      failures.push(
        `translucent surface · ${theme} ${surface}: the exemption is STALE — it now equals ` +
          `${stale.join(" and ")}, which its own rationale says it does not. Give it ` +
          `\`base: "${stale[0]}"\` and let it be asserted.`,
      );
    else checked.push(`${theme} ${surface} — exempt: ${why}`);
    continue;
  }
  // Same reader as the exempt path, so both inherit the anchoring and the alias resolution — the
  // duplicate prefix-matcher that used to live here had the identical `rgba(…, nope)` hole.
  const mine = channels(decl, blk);
  if (!mine) {
    failures.push(
      `translucent surface · ${theme} ${surface}: expected a complete \`rgba(r, g, b, a)\` or ` +
        `6-digit hex, got \`${decl}\``,
    );
    continue;
  }
  const want = channels(blk[base] ?? "", blk);
  if (!want) {
    failures.push(
      `translucent surface · ${theme} ${surface}: ${base} (\`${blk[base] ?? "(absent)"}\`) cannot ` +
        `be reduced to channels, so there is nothing to compare against`,
    );
    continue;
  }
  if (want.join() !== mine.join())
    failures.push(
      `translucent surface · ${theme} ${surface}: rgb(${mine.join(", ")}) but ${base} is ` +
        `rgb(${want.join(", ")}) — the frosted surface must BE its opaque base, re-hued with it`,
    );
  else checked.push(`${theme} ${surface} = ${base} rgb(${want.join(", ")})`);
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
