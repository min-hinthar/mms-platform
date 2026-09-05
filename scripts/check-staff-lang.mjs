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

// ── Rule 3 — no LITERAL aria-label on a staff surface ───────────────────────────────────────────
// A hand-written English `aria-label` is invisible to every other guard and is exactly how WCAG
// 2.5.3 breaks once the visible label is Burmese: the button reads ပြီးပြီ and announces "Bump".
// Names must come from `lib/staff-labels.ts` — `al()` for a control that HAS a visible label (the
// pair asserts containment), or `sx()` for one that does not.
//
// ⚠️ THE EVASION THIS IS SHAPED AROUND: `aria-label={sx(lang, "…")}` on a button that DOES have
// visible text. That compiles, reads as localized, and silently bypasses the containment pair at
// every call site. So `sx()` is permitted ONLY on an element with no visible text of its own.
const ARIA_DIRS = [join(QR, "components/staff"), join(APP, "staff"), join(APP, "board")];
/**
 * ⚠️ A RATCHET, not a whitelist. These staff surfaces still carry hand-written English names; P2
 * PR A converts the KDS, `/board` and the shared shell, and PR B takes the rest (OPEN-ITEMS P2c).
 * A file may only ever LEAVE this list. The self-check below fails if a listed file has no literal
 * left — meaning it was cleaned and the entry must be deleted, so the list cannot quietly become a
 * permanent exemption for work that was actually finished.
 */
const ARIA_TODO = new Set(
  [
    "app/staff/approvals/page.tsx",
    "app/staff/feedback/page.tsx",
    "app/staff/page.tsx",
    "app/staff/register/page.tsx",
    "app/staff/tips/page.tsx",
    "components/staff/ApprovalsBoard.tsx",
    "components/staff/CashSettleButton.tsx",
    "components/staff/ClearTableButton.tsx",
    "components/staff/CloseSecureTabButton.tsx",
    "components/staff/FloorDetailLive.tsx",
    "components/staff/LossActionSheet.tsx",
    "components/staff/MenuPriceEditor.tsx",
    "components/staff/MergeTableButton.tsx",
    "components/staff/RegisterStart.tsx",
    "components/staff/StaffLineEditor.tsx",
    "components/staff/StaffMenuBrowser.tsx",
    "components/staff/StaffModSheet.tsx",
    "components/staff/TeamManager.tsx",
    "components/staff/TerminalSettle.tsx",
  ].map((f) => join(QR, f)),
);

const ARIA_ALL = [
  ...ARIA_DIRS.flatMap((d) => {
    try {
      return walkFiles(d);
    } catch {
      return [];
    }
  }),
  join(QR, "components/ReadyBoard.tsx"),
].filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));

const ARIA_FILES = ARIA_ALL.filter((f) => !ARIA_TODO.has(f));

/**
 * WCAG 2.5.3 governs "user interface components with labels" — a CONTROL whose visible text is its
 * label. It does not govern a landmark or a list that merely CONTAINS content: `<ul aria-label=…>`
 * of tickets and `<nav aria-label=…>` of pager arrows have children but no visible label, and
 * naming them with `sx()` is exactly right. The first cut of this rule conflated "has children"
 * with "has a label" and flagged all eight of the KDS's legitimate region names.
 */
const CONTROL_TAGS = new Set(["button", "a", "input", "select", "textarea", "summary", "label"]);

/** A CONTROL with visible text of its own — the only shape where sx() would bypass the pair. */
function isLabelledControl(el, sf) {
  if (!ts.isJsxElement(el)) return false;
  if (!CONTROL_TAGS.has(el.openingElement.tagName.getText(sf))) return false;
  // A LABEL is text a person would speak. A bare directional or decorative glyph is not: the pager's
  // `‹` and `›` buttons, an `×` close, a `✦` mark. Those are exactly the controls `sx()` exists for,
  // and requiring a visible-label pair on them would force inventing a label the screen never shows.
  // So visible text counts only when it contains a letter or a digit, in ANY script.
  const speakable = /[\p{L}\p{N}]/u;
  return el.children.some(
    (c) =>
      (ts.isJsxText(c) && speakable.test(c.text)) ||
      ts.isJsxElement(c) ||
      ts.isJsxSelfClosingElement(c) ||
      ts.isJsxExpression(c),
  );
}

for (const file of ARIA_FILES) {
  let sf;
  try {
    sf = parse(file);
  } catch {
    continue;
  }
  const rel = relative(ROOT, file);
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "aria-label") {
      const init = node.initializer;
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      if (init && ts.isStringLiteral(init)) {
        failures.push(
          `rule 3: ${rel}:${line} — a LITERAL aria-label. Use al() for a control with a visible label, or sx() for one without.`,
        );
      } else if (init && ts.isJsxExpression(init) && init.expression) {
        const expr = init.expression;
        const text = expr.getText(sf);
        if (ts.isTemplateExpression(expr) && !text.includes("ts(") && !text.includes("al(")) {
          failures.push(
            `rule 3: ${rel}:${line} — a hand-built template aria-label. Names come from lib/staff-labels.ts.`,
          );
        }
        // The sx()-on-a-labelled-control evasion.
        if (/\bsx\(/.test(text)) {
          const owner = node.parent?.parent;
          if (owner && (ts.isJsxElement(owner) || ts.isJsxOpeningElement(owner))) {
            const el = ts.isJsxOpeningElement(owner) ? owner.parent : owner;
            if (isLabelledControl(el, sf)) {
              failures.push(
                `rule 3: ${rel}:${line} — sx() on an element that HAS visible text. That bypasses the {visible, aria} pair; use al().`,
              );
            }
          }
        }
      }
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
}

// ── Rule 4 — every staff page mounts the language control ────────────────────────────────────────
// A staff surface that cannot switch language is a surface one of the two readers is locked out of.
// The switch is mounted PER PAGE rather than by the layout (a layout strip would steal height from
// the KDS's measured `min-height: 100dvh`), so this is what makes "per page" safe.
//
// ⚠️ STATED LIMIT, because a guard that overclaims is worse than none: this is a PRESENCE check over
// the JSX a page returns, excluding the enumerated literal-dead shapes below. It is liveness against
// a PARKED DEAD COPY, not a reachability proof — a page whose only mount sits behind a runtime-false
// condition passes here, and the preview a11y tick is what covers that shape.
const staffPages = walkFiles(join(APP, "staff")).filter((f) => f.endsWith("/page.tsx"));
if (staffPages.length < 10)
  failures.push(
    `rule 4 DID NOT RUN: found only ${staffPages.length} staff pages — the discovery is broken, not the codebase.`,
  );

for (const file of staffPages) {
  const src = readFileSync(file, "utf8");
  let sf;
  try {
    sf = parse(file);
  } catch {
    continue;
  }
  let mounts = false;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(sf);
      if (tag === "StaffLangSwitch" || tag === "StaffOutageShell") {
        // Exclude the literal-dead shapes: `{false && <X/>}` and `{0 && <X/>}`.
        const text = node.getText(sf);
        const before = src.slice(Math.max(0, node.getStart(sf) - 40), node.getStart(sf));
        if (!/\{\s*(false|0)\s*&&\s*$/.test(before) && text.length > 0) mounts = true;
      }
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
  if (!mounts)
    failures.push(
      `rule 4: ${relative(ROOT, file)} mounts neither <StaffLangSwitch> nor <StaffOutageShell> (which owns one). One of the two people who read this console cannot change its language here.`,
    );
}

// ── Rule 3b — the ratchet only turns one way ─────────────────────────────────────────────────────
// A file listed as still-to-convert that no longer carries a literal name HAS been converted, and
// its entry must be deleted — otherwise the list silently becomes a permanent exemption for finished
// work, which is how a TODO turns into a hole.
for (const file of ARIA_TODO) {
  let sf;
  try {
    sf = parse(file);
  } catch {
    failures.push(
      `rule 3b: ${relative(ROOT, file)} is on the still-to-convert list but does not exist. Delete the entry.`,
    );
    continue;
  }
  let hasLiteral = false;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "aria-label") {
      const init = node.initializer;
      if (init && ts.isStringLiteral(init)) hasLiteral = true;
      if (init && ts.isJsxExpression(init) && init.expression) {
        const t = init.expression.getText(sf);
        if (ts.isTemplateExpression(init.expression) && !t.includes("al(") && !t.includes("ts("))
          hasLiteral = true;
      }
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
  if (!hasLiteral)
    failures.push(
      `rule 3b: ${relative(ROOT, file)} has no literal aria-label left — it is converted. Delete its ARIA_TODO entry so the guard starts holding it.`,
    );
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error("staff locale isolation … \x1b[31mFAILED\x1b[0m");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.error(
  `staff locale isolation … \x1b[32mclean\x1b[0m\x1b[2m (${routeRoots.length} non-staff roots walked · cookie name in 1 file · ${ARIA_FILES.length} staff files aria-clean, ${ARIA_TODO.size} still to convert · ${staffPages.length} staff pages mount the control)\x1b[0m`,
);
