#!/usr/bin/env node
/**
 * P2 — the staff-locale isolation guard. Two rules, both PARSED (LEARNINGS #60), both in the CI
 * fast lane: file-read-only, seconds, no build and no DB.
 *
 * The claim being defended is in `lib/staff-lang.ts`'s docblock: the staff device cookie is read on
 * `/staff/*` and `/board` ONLY, never by a diner route. W16b retired the app-wide locale toggle by
 * owner directive, and "we added a cookie back, but only for staff" is worth exactly as much as the
 * mechanism that proves it.
 *
 * RULE 1 — transitive unreachability. Walk the import graph from every non-staff, non-board route
 * root and assert the two reader modules are unreachable at ANY depth. A membership check ("is this
 * file under app/staff?") would pass a diner page that imports a shared component that imports the
 * reader, which is the realistic way this breaks.
 *
 * RULE 2 — literal uniqueness. The cookie NAME may appear in exactly one file. This closes the
 * evasion rule 1 structurally cannot see: `cookies().get("mms_staff_lang")` written inline in a
 * diner server component, with no import to walk. A literal inside dead code still counts — the
 * guard errs red, because a parked copy is the next reader's template.
 *
 * Both rules parse with the TypeScript compiler, so a mention inside a comment or a string of prose
 * is not a match. `ts.forEachChild` is a SEARCH primitive — a visitor returning a truthy value
 * aborts the walk — so every visitor here is written `(c) => { visit(c); }`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const QR = join(ROOT, "apps/qr");
const APP = join(QR, "app");

const COOKIE_LITERAL = "mms_staff_lang";
const COOKIE_HOME = join(QR, "lib/staff-lang.ts");
const GUARDED = [join(QR, "lib/staff-lang-server.ts"), join(QR, "lib/staff-lang-actions.ts")];

/** Directories whose route roots are ALLOWED to reach the readers. */
const STAFF_AREAS = [join(APP, "staff"), join(APP, "board")];

const failures = [];
const EXTS = [".ts", ".tsx", ".mjs", ".js"];

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else if (EXTS.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

function parse(file) {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** Resolve a module specifier to a file on disk, or null when it is a package. */
function resolveSpecifier(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(QR, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;

  for (const candidate of [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => join(base, "index" + e)),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not on disk under this candidate — try the next extension.
    }
  }
  return null;
}

/** Every module specifier this file imports: static, dynamic `import()`, and `require()`. */
function specifiersOf(sourceFile) {
  const specs = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specs.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const arg = node.arguments[0];
      if ((isDynamic || isRequire) && arg && ts.isStringLiteral(arg)) specs.push(arg.text);
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sourceFile);
  return specs;
}

// ── Rule 1 — the readers are unreachable from every non-staff route root ─────────────────────────
const routeRoots = walkFiles(APP).filter(
  (f) =>
    /\/(page|layout|route|error|loading|template|default)\.(ts|tsx)$/.test(f) &&
    !STAFF_AREAS.some((area) => f.startsWith(area + "/")),
);

// Self-check: if the discovery ever returns nothing, the guard reports that it did not run rather
// than reporting success over an empty set.
if (routeRoots.length < 20)
  failures.push(
    `rule 1 DID NOT RUN: found only ${routeRoots.length} non-staff route roots under app/ — the discovery is broken, not the codebase.`,
  );

const graph = new Map();
function importsOf(file) {
  if (!graph.has(file)) {
    let specs = [];
    try {
      specs = specifiersOf(parse(file));
    } catch {
      specs = [];
    }
    graph.set(
      file,
      specs.map((s) => resolveSpecifier(s, file)).filter((f) => f !== null),
    );
  }
  return graph.get(file);
}

for (const root of routeRoots) {
  const seen = new Set([root]);
  const queue = [[root, [root]]];
  while (queue.length) {
    const [file, path] = queue.shift();
    for (const dep of importsOf(file)) {
      if (GUARDED.includes(dep)) {
        const chain = [...path, dep].map((f) => relative(ROOT, f)).join("\n      → ");
        failures.push(
          `rule 1: a NON-STAFF route reaches the staff-locale reader.\n      ${chain}\n      The staff device cookie is for /staff and /board only.`,
        );
        queue.length = 0;
        break;
      }
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push([dep, [...path, dep]]);
      }
    }
  }
}

// ── Rule 2 — the cookie name literal lives in exactly one file ───────────────────────────────────
const literalHomes = [];
for (const file of [
  ...walkFiles(join(QR, "lib")),
  ...walkFiles(join(QR, "app")),
  ...walkFiles(join(QR, "components")),
]) {
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
  let sf;
  try {
    sf = parse(file);
  } catch {
    continue;
  }
  let found = false;
  function visit(node) {
    // A StringLiteral or a no-substitution template — never a comment, which is not an AST node.
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text === COOKIE_LITERAL
    )
      found = true;
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
  if (found) literalHomes.push(file);
}

if (literalHomes.length !== 1 || literalHomes[0] !== COOKIE_HOME) {
  failures.push(
    `rule 2: the cookie name "${COOKIE_LITERAL}" must appear in exactly one file (${relative(ROOT, COOKIE_HOME)}).\n      Found in: ${literalHomes.map((f) => relative(ROOT, f)).join(", ") || "(nowhere)"}\n      An inline cookies().get() elsewhere has no import for rule 1 to walk.`,
  );
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error("staff locale isolation … \x1b[31mFAILED\x1b[0m");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.error(
  `staff locale isolation … \x1b[32mclean\x1b[0m\x1b[2m (${routeRoots.length} non-staff route roots walked; cookie name in 1 file)\x1b[0m`,
);
