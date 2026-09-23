#!/usr/bin/env node
/**
 * Phase 0 — the STYLE-LITERAL RATCHET. `pnpm check:style-literals` (CI fast lane).
 *
 * The type scale, the weight scale and the tracking scale are tokens (`packages/ui/src/tokens.css`).
 * Before Phase 0 the stylesheet carried 267 literal font-weights (none tokenized), 162 literal px
 * font-sizes and 60 literal letter-spacings, plus 316 inline `fontWeight` numbers — which is how
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
 * Red-first, each induced and watched fail, restored: a `font-weight: 700` added to globals.css; a
 * `fontWeight: 800` added to a component; a `letterSpacing: "0.04em"` in a conditional branch; a
 * literal INSIDE a comment (must stay green); a deleted literal (must ask for `--update`).
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
const CSS_FILES = ["apps/qr/app/globals.css", "packages/ui/src/primitives.css"];
const TSX_ROOTS = ["apps/qr/app", "apps/qr/components", "apps/qr/lib", "packages/ui/src"];
const EXCLUDE = /(\.test\.|__tests__|[/\\](opengraph-image|twitter-image|apple-icon|icon)\.tsx$)/;

const PROPS_CSS = { "font-weight": "weight", "font-size": "size", "letter-spacing": "tracking" };
const PROPS_TS = { fontWeight: "weight", fontSize: "size", letterSpacing: "tracking" };

/** A value is a LITERAL when it carries a bare number/length and no token. Keywords (normal,
 *  inherit, bold) and functions over tokens (`var(…)`, `calc(var(…) …)`) are not literals; a
 *  `clamp(14px, …)` IS (a board tier written in numbers is exactly the debt this counts). */
function isLiteral(value) {
  const v = String(value).trim();
  if (/var\(/.test(v) && !/\d(px|rem|em)\b/.test(v.replace(/var\([^)]*\)/g, ""))) return false;
  return /(^|[\s(,])-?\d*\.?\d+(px|rem|em|%)?(?=$|[\s),])/.test(v);
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
        if (kind && isLiteral(value))
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

function walkFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, acc);
    else if (/\.tsx?$/.test(name) && !EXCLUDE.test(p)) acc.push(p);
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
      ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && isLiteral(n.text))
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
    ...CSS_FILES.flatMap(cssLiterals),
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
