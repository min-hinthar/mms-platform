#!/usr/bin/env node
/**
 * Phase 0 — the STYLE-LITERAL RATCHET. `pnpm check:style-literals` (CI fast lane).
 *
 * The type scale, the weight scale and the tracking scale are tokens (`packages/ui/src/tokens.css`).
 * Before Phase 0 the stylesheet carried 267 literal font-weights (none tokenized), 162 literal px
 * font-sizes and 60 literal letter-spacings, plus 323 inline `fontWeight` numbers — which is how
 * "bold" came to mean 600, 700 or 800 depending on who wrote the rule. The codemod took the exact
 * matches; what is left is real design debt (a 10px, a 0.18em) that a person has to decide.
 *
 * This guard does not demand zero. It holds every count to its recorded BASELINE: a count may FALL
 * (then re-record it with `--update`, so the gain is locked in) but never RISE. Ratchet, not wall.
 *
 * It PARSES, it never scans (LEARNINGS #60):
 *   · CSS — comments stripped FIRST (a comment naming `font-weight: 700` is prose, not a rule), then
 *     every `prop: value` is bound to the block it sits in; custom-property DEFINITIONS (`--x: 12px`)
 *     are the token layer and are not counted. tokens.css is the definition file and is excluded.
 *   · TSX/TS — the TypeScript AST: a `fontWeight` / `fontSize` / `letterSpacing` PROPERTY whose value
 *     contains a literal leaf (`800`, `"0.04em"`, `on ? 700 : 600`). Comments are not AST nodes, so a
 *     commented-out style cannot satisfy or trip it. Tests, Satori image routes (which cannot read
 *     CSS variables) and emails (mail clients cannot either) are excluded.
 *
 * NOT covered, stated rather than implied: a value reached through an identifier or a shorthand
 * property (`fontWeight: W`, `{ fontWeight }`) — the AST cannot know it without type evaluation.
 * Numeric inline weights are also banned outright by ESLint; the rest is review's job.
 *
 * Red-first, each induced and watched fail, restored: a `font-weight: 700` added to globals.css; a
 * `fontWeight: 800` added to a component; a `letterSpacing: "0.04em"` in a conditional branch; a
 * literal INSIDE a comment (must stay green); a deleted literal (must ask for `--update`); and the
 * blind pass's four evasions — `var(--nope, 13px)`, `font-weight: bold`, a THIRD stylesheet, and a
 * literal in `packages/ui/src/icon.tsx` — each now raises a count.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require(
  require.resolve("typescript", { paths: [join(import.meta.dirname, "..", "apps", "qr")] }),
);

const ROOT = join(import.meta.dirname, "..");
const BASELINE = join(ROOT, "scripts", "style-literals.baseline.json");
// EVERY stylesheet under the app and the package (blind pass: a two-file list let a third sheet
// ship literals unseen). tokens.css is the definition layer and the only exclusion.
const CSS_ROOTS = ["apps/qr/app", "apps/qr/components", "packages/ui/src"];
const CSS_EXCLUDE = /[/\\]tokens\.css$/;
const TSX_ROOTS = ["apps/qr/app", "apps/qr/components", "apps/qr/lib", "packages/ui/src"];
// The Satori image routes live under apps/qr/app ONLY — an `icon.tsx` anywhere else (the shared
// `packages/ui/src/icon.tsx`) is ordinary UI and is counted (blind pass: a bare basename match
// silently excluded it).
const EXCLUDE =
  /(\.test\.|__tests__|apps[/\\]qr[/\\]app[/\\](?:.*[/\\])?(opengraph-image|twitter-image|apple-icon|icon)\.tsx$)/;

const PROPS_CSS = { "font-weight": "weight", "font-size": "size", "letter-spacing": "tracking" };
const PROPS_TS = { fontWeight: "weight", fontSize: "size", letterSpacing: "tracking" };

/** A value is a LITERAL when it carries a bare number/length and no token. Keywords (normal,
 *  inherit, bold) and functions over tokens (`var(…)`, `calc(var(…) …)`) are not literals; a
 *  `clamp(14px, …)` IS (a board tier written in numbers is exactly the debt this counts). */
function isLiteral(value, kind) {
  const v = String(value).trim();
  // A keyword weight IS a hardcoded weight (`bold` is 700 by another name).
  if (kind === "weight" && /^(bold|bolder|lighter|normal)$/i.test(v)) return true;
  // Strip only a BARE token reference. A fallback (`var(--nope, 13px)`) still ships its number
  // whenever the token is missing, so it stays in the string and is counted (blind pass).
  const rest = v.replace(/var\(\s*--[\w-]+\s*\)/g, "").trim();
  // A bare number is a literal for every property (`800`, `0.3`). Inside an expression only a LENGTH
  // is: `calc(var(--x) * 0.62)` scales a token and ships no hardcoded size.
  if (/^-?\d*\.?\d+$/.test(rest)) return true;
  return /(^|[\s(,])-?\d*\.?\d+(px|rem|em|%)(?=$|[\s),])/.test(rest);
}

function cssLiterals(file) {
  const code = readFileSync(join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let line = 1;
  let buf = "";
  let bufLine = 1;
  for (const ch of code) {
    if (ch === "{" || ch === "}" || ch === ";") {
      const text = buf.trim();
      const colon = text.indexOf(":");
      if (ch !== "{" && colon > 0) {
        const prop = text.slice(0, colon).trim();
        const value = text
          .slice(colon + 1)
          .replace(/!important/, "")
          .trim();
        const kind = PROPS_CSS[prop];
        if (kind && isLiteral(value, kind))
          out.push({ kind: `css-${kind}`, at: `${file}:${bufLine}`, value });
      }
      buf = "";
      bufLine = line;
    } else {
      if (!buf.trim() && ch !== "\n") bufLine = line;
      buf += ch;
    }
    if (ch === "\n") line++;
  }
  return out;
}

function walkFiles(dir, acc = [], match = /\.tsx?$/) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, acc, match);
    else if (match.test(name) && !EXCLUDE.test(p)) acc.push(p);
  }
  return acc;
}

function tsLiterals(path) {
  const src = readFileSync(path, "utf8");
  const sf = ts.createSourceFile(
    path,
    src,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out = [];
  const rel = relative(ROOT, path).split(sep).join("/");
  const leaves = (n, kind) => {
    if (
      ts.isNumericLiteral(n) ||
      ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
        isLiteral(n.text, kind)) ||
      // `${n}px` builds a length from a number — a literal by construction.
      (ts.isTemplateExpression(n) && /(px|rem|em)\b/.test(n.getText(sf)))
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      out.push({ kind: `tsx-${kind}`, at: `${rel}:${line + 1}`, value: n.getText(sf) });
      return;
    }
    // Only descend through expressions that SELECT a value (a ternary, a ??, parentheses) — never
    // into a call, whose numeric arguments are not the property's value.
    if (ts.isConditionalExpression(n)) {
      leaves(n.whenTrue, kind);
      leaves(n.whenFalse, kind);
    } else if (ts.isBinaryExpression(n)) {
      leaves(n.left, kind);
      leaves(n.right, kind);
    } else if (
      ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isSatisfiesExpression(n)
    ) {
      leaves(n.expression, kind);
    }
  };
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))) {
      const kind = PROPS_TS[n.name.text];
      if (kind) leaves(n.initializer, kind);
    }
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(sf);
  return out;
}

export function measure() {
  const sites = [
    ...CSS_ROOTS.flatMap((r) => walkFiles(join(ROOT, r), [], /\.css$/))
      .filter((p) => !CSS_EXCLUDE.test(p))
      .map((p) => relative(ROOT, p).split(sep).join("/"))
      .flatMap(cssLiterals),
    ...TSX_ROOTS.flatMap((r) => walkFiles(join(ROOT, r))).flatMap(tsLiterals),
  ];
  const counts = {};
  for (const k of [
    "css-weight",
    "css-size",
    "css-tracking",
    "tsx-weight",
    "tsx-size",
    "tsx-tracking",
  ])
    counts[k] = 0;
  for (const s of sites) counts[s.kind]++;
  return { counts, sites };
}

const { counts, sites } = measure();

if (process.argv.includes("--update")) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n");
  console.log("check:style-literals — baseline recorded:", counts);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
let failed = false;
for (const [kind, n] of Object.entries(counts)) {
  const was = baseline[kind] ?? 0;
  if (n > was) {
    failed = true;
    console.error(
      `✗ ${kind}: ${n} literal(s), baseline ${was} — a NEW hardcoded value. Use a token:`,
    );
    console.error(
      "  weights --fw-* · sizes --fs-* (or --kfs-* on the KDS) · tracking --track-* (tokens.css)",
    );
    for (const s of sites.filter((x) => x.kind === kind).slice(-12))
      console.error(`    ${s.at}  ${s.value}`);
  } else if (n < was) {
    failed = true;
    console.error(
      `✗ ${kind}: ${n} literal(s), baseline ${was} — the debt FELL. Lock the gain in: node scripts/check-style-literals.mjs --update`,
    );
  }
}
if (failed) process.exit(1);
console.log("✓ check:style-literals — no new hardcoded weight/size/tracking:", counts);
