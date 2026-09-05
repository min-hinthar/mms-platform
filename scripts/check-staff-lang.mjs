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
const COOKIE_CONSTANT = "STAFF_LANG_COOKIE";
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

/**
 * The dictionary entry points. A string reaching the DOM through one of these is authored copy in
 * the device language; anything else in a JSX child is data or Latin punctuation.
 */
const DICT_CALLS = ["ts", "tf", "frozenBoardCopy"];

/**
 * Does this subtree CALL one of `names`?
 *
 * ⚠️ Written as an AST walk rather than `text.includes("ts(")` on purpose, and the substring form is
 * the exact defect it replaces: `includes("ts(")` matches `formats(`, `getStats(` and every other
 * identifier ENDING in `ts`, and it matches the same text inside a comment. Only a CallExpression
 * whose callee is the bare identifier counts.
 */
function callsAny(node, names) {
  let hit = false;
  function visit(n) {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      names.includes(n.expression.text)
    )
      hit = true;
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  }
  visit(node);
  return hit;
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
const constantHomes = [];
/**
 * The scan set. `apps/qr`'s ROOT modules are in it deliberately: `proxy.ts` is where the retired
 * `mms_locale` cookie was read, so it is the single likeliest place for the next inline
 * `cookies().get("mms_staff_lang")` to be written, and the first cut of this rule did not look
 * there at all. `readdirSync` at the root rather than `walkFiles` so `node_modules`/`.next` and the
 * three directories already listed are not walked twice.
 */
const RULE2_FILES = [
  ...walkFiles(join(QR, "lib")),
  ...walkFiles(join(QR, "app")),
  ...walkFiles(join(QR, "components")),
  ...readdirSync(QR)
    .map((n) => join(QR, n))
    .filter((f) => EXTS.some((e) => f.endsWith(e)) && statSync(f).isFile()),
];
for (const file of RULE2_FILES) {
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
  let sf;
  try {
    sf = parse(file);
  } catch {
    continue;
  }
  let found = false;
  let usesConstant = false;
  function visit(node) {
    // A StringLiteral or a no-substitution template — never a comment, which is not an AST node.
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text === COOKIE_LITERAL
    )
      found = true;
    // …and the same name reached through the EXPORTED constant, which carries no literal for the
    // check above to see. `staff-lang.ts` is pure and must stay importable from anywhere, so rule 1
    // cannot guard it — a diner server component importing STAFF_LANG_COOKIE and calling
    // `cookies().get()` with it would have passed both rules.
    if (ts.isIdentifier(node) && node.text === COOKIE_CONSTANT) usesConstant = true;
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
  if (found) literalHomes.push(file);
  if (usesConstant) constantHomes.push(file);
}

const CONSTANT_HOMES = [COOKIE_HOME, ...GUARDED];
const strayConstant = constantHomes.filter((f) => !CONSTANT_HOMES.includes(f));
if (strayConstant.length) {
  failures.push(
    `rule 2: ${COOKIE_CONSTANT} may only be referenced by ${CONSTANT_HOMES.map((f) => relative(ROOT, f)).join(", ")}.\n      Found in: ${strayConstant.map((f) => relative(ROOT, f)).join(", ")}\n      Reading the staff cookie through the constant bypasses the literal check above.`,
  );
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
const CONTROL_TAGS = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "summary",
  "label",
  // `next/link` renders an `<a>`, and this console navigates by pill-shaped Links with visible text
  // — ten of them in `/staff`'s tool nav alone. Without this entry `sx()` on one of those pills
  // passes the check below while bypassing the {visible, aria} pair, which is the same bypass the
  // check exists to refuse; the lowercase `a` never matches because the JSX tag reads `Link`.
  // STATED LIMIT: a control rendered through a polymorphic wrapper (`<Card as={Link}>`) still reads
  // as its wrapper's tag here and is not covered.
  "Link",
]);

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

/**
 * The functions that can produce a localized accessible name. `al()` pairs it with the visible
 * label (2.5.3 containment); `sx()` is the aria-only form; the three dictionary calls cover a name
 * assembled from more than one key.
 */
const NAME_CALLS = [...DICT_CALLS, "al", "sx"];

/** Does this binding pattern bind `name`? Recurses through object/array destructuring. */
function bindsName(binding, name) {
  if (ts.isIdentifier(binding)) return binding.text === name;
  if (ts.isObjectBindingPattern(binding) || ts.isArrayBindingPattern(binding))
    return binding.elements.some((el) => ts.isBindingElement(el) && bindsName(el.name, name));
  return false;
}

/**
 * Where in an enclosing scope is `name` declared, and does that declaration reach a localized name?
 *
 * `const { visible, aria } = al(lang, {…})` is the SHAPE the pair is meant to be consumed in — the
 * control has ten fields and inlining the call at the attribute would bury it — so a bare
 * `aria-label={aria}` has to be readable as localized. Walking to the declaration and asking whether
 * ITS initializer calls a name function keeps that legible without weakening the rule: a
 * `const a11yName = \`Table ${x}, ${status}\`` declaration answers no, which is exactly the
 * OPEN-ITEMS P2g defect (a hand-built name in a local const, invisible to the first cut of rule 3).
 *
 * Scope-walked rather than file-scanned: two functions in one file may each declare `aria`, and the
 * nearest enclosing declaration is the one the browser would see.
 */
function localBindingIsLocalized(id) {
  for (let n = id.parent; n; n = n.parent) {
    const stmts = n.statements;
    if (!stmts) continue;
    for (const st of stmts) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (d.initializer && bindsName(d.name, id.text)) return callsAny(d.initializer, NAME_CALLS);
      }
    }
  }
  return null; // no declaration found in any enclosing scope
}

/**
 * Is this identifier a PARAMETER of an enclosing function — a name handed IN rather than built here?
 *
 * `StaggerList` is the shape: a generic `role="list"` wrapper whose `aria-label={ariaLabel}` is pure
 * plumbing, and whose callers supply the localized string. That is not a name this file authored, so
 * the rule has nothing to hold. A LOCAL `const` is the opposite case and stays governed — `TableCard`
 * built its whole name in one, interpolating a raw status key the screen never showed (OPEN-ITEMS
 * P2g), and an exemption for "any identifier" would have hidden exactly that.
 */
function isEnclosingParam(id) {
  for (let n = id.parent; n; n = n.parent) {
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n) ||
      ts.isMethodDeclaration(n)
    ) {
      if (n.parameters.some((p) => bindsName(p.name, id.text))) return true;
    }
  }
  return false;
}

/**
 * Authored text spliced into a name OUTSIDE any dictionary call: `` `${label} — bag for ${callOut}` ``,
 * `x ? "Deactivate" : "Reactivate"`, `ts(lang, k) + " request"`. Subtrees rooted at a NAME_CALLS call
 * are skipped, so a dictionary KEY (`sx(lang, "reg.a11y.open")`) is never mistaken for copy. Joiner
 * punctuation (`" — "`, `", "`) carries no letter or digit and is left alone in any script.
 */
function splicedText(node, sf) {
  const speakable = /[\p{L}\p{N}]/u;
  let hit = null;
  function visit(n) {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      NAME_CALLS.includes(n.expression.text)
    )
      return; // a localized name — its arguments are keys and values, not copy
    if (
      (ts.isStringLiteral(n) ||
        ts.isNoSubstitutionTemplateLiteral(n) ||
        n.kind === ts.SyntaxKind.TemplateHead ||
        n.kind === ts.SyntaxKind.TemplateMiddle ||
        n.kind === ts.SyntaxKind.TemplateTail) &&
      speakable.test(n.text) &&
      hit === null
    )
      hit = n.text;
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  }
  visit(node);
  return hit;
}

/**
 * Every rule-3 violation in one file. Rule 3 reports these for a CONVERTED file; rule 3b reads the
 * SAME function to decide whether a still-to-convert file has in fact been converted. Two predicates
 * would let a file be clean for the ratchet and dirty for the rule at the same time — which is how a
 * TODO entry becomes a permanent exemption for work that only looks finished.
 */
function ariaFindings(file) {
  const out = [];
  let sf;
  try {
    sf = parse(file);
  } catch {
    return out;
  }
  const rel = relative(ROOT, file);
  function visit(node) {
    // `aria-label` on a DOM element, and `ariaLabel` — the camelCase PROP a wrapper takes and then
    // spreads onto its own element.
    //
    // ⚠️ THE SECOND NAME IS NOT DECORATION. `StaggerList` takes `ariaLabel` and writes it straight
    // onto its `<ul role="list">`; inside that file the write is a bare parameter, correctly
    // exempted as passthrough — so the CALLER is the only place the rule can apply, and the caller
    // spells it camelCase. Matching only the hyphenated form meant `ApprovalsBoard`'s
    // `ariaLabel="Pending approval requests"` produced no finding at all: convert that file's one
    // hyphenated site and `ariaFindings` empties, rule 3b then REQUIRES deleting its ratchet entry,
    // and the English literal leaves the guard's reach permanently. A ratchet that can be emptied
    // while a violation remains is worse than no ratchet.
    const attrName =
      ts.isJsxAttribute(node) && ["aria-label", "ariaLabel"].includes(node.name.getText(sf))
        ? node.name.getText(sf)
        : null;
    if (attrName) {
      const init = node.initializer;
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      // `aria-label="x"` is a bare StringLiteral; `aria-label={…}` wraps its expression.
      const expr = init && ts.isJsxExpression(init) ? init.expression : init;
      if (!expr) {
        out.push(`rule 3: ${rel}:${line} — an aria-label with no value.`);
      } else if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
        out.push(
          `rule 3: ${rel}:${line} — a LITERAL aria-label. Use al() for a control with a visible label, or sx() for one without.`,
        );
      } else if (ts.isIdentifier(expr) && isEnclosingParam(expr)) {
        // A name passed in as a prop. The CALLER is where the rule applies.
      } else if (ts.isIdentifier(expr) && localBindingIsLocalized(expr) === true) {
        // `const { aria } = al(lang, …)` one line up — localized, just not inlined.
      } else if (!callsAny(expr, NAME_CALLS)) {
        out.push(
          `rule 3: ${rel}:${line} — a hand-built aria-label (${expr.getText(sf).replace(/\s+/g, " ").slice(0, 70)}). Names come from lib/staff-labels.ts — al() for a control with a visible label, sx() for one without.`,
        );
      } else {
        const spliced = splicedText(expr, sf);
        if (spliced !== null)
          out.push(
            `rule 3: ${rel}:${line} — authored text "${spliced.trim()}" spliced into a localized name. Every word a person hears comes from the dictionary; only punctuation joins them.`,
          );
      }
      // The sx()-on-a-labelled-control evasion: it compiles, reads as localized, and bypasses the
      // {visible, aria} containment pair at every call site. Only checkable on the DOM attribute —
      // where the name is a PROP, the element it lands on is inside the callee.
      if (attrName === "aria-label" && expr && callsAny(expr, ["sx"])) {
        const owner = node.parent?.parent;
        if (owner && (ts.isJsxElement(owner) || ts.isJsxOpeningElement(owner))) {
          const el = ts.isJsxOpeningElement(owner) ? owner.parent : owner;
          if (isLabelledControl(el, sf))
            out.push(
              `rule 3: ${rel}:${line} — sx() on an element that HAS visible text. That bypasses the {visible, aria} pair; use al().`,
            );
        }
      }
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
  return out;
}

for (const file of ARIA_FILES) failures.push(...ariaFindings(file));

/**
 * RULE 3c — the `verb` control's label and its NAME are one key, checked AT THE CALL SITE.
 *
 * `al()`'s value test can prove that `aria` contains `visible`; it cannot prove that the BUTTON
 * renders `visible`. Nothing stops a call site from taking the name from `al(lang, { kind: "verb",
 * verb: "floor.verb.deactivate", … }).aria` while its children render a different key, or English,
 * or a dish name — and then the button reads one thing and announces another, which is the whole of
 * WCAG 2.5.3 and the whole of OPEN-ITEMS P2g one file over.
 *
 * So: an element whose accessible name comes from a `verb` control must ALSO render that same key in
 * its own children — as `<Chrome k="…">` or as `ts(_, "…")`. That is a real constraint on how the
 * call site is written, and it is the point: the two halves become one edit.
 *
 * The verb key must be a string LITERAL. A computed key would make the label unfindable from here,
 * and "the guard cannot see it" is not a licence — pick the key with a ternary over two whole
 * `al()` calls instead, the way the comp/void card does.
 */
function verbLabelFindings(file) {
  const out = [];
  let sf;
  try {
    sf = parse(file);
  } catch {
    return out;
  }
  const rel = relative(ROOT, file);

  /** The `verb:` property of an `al(_, { kind: "verb", … })` call, or null. */
  function verbKeyOf(node) {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return null;
    if (node.expression.text !== "al") return null;
    const arg = node.arguments[1];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return null;
    const kind = arg.properties.find(
      (pr) => ts.isPropertyAssignment(pr) && pr.name.getText(sf) === "kind",
    );
    if (
      !kind ||
      !ts.isPropertyAssignment(kind) ||
      !ts.isStringLiteral(kind.initializer) ||
      kind.initializer.text !== "verb"
    )
      return null;
    const verb = arg.properties.find(
      (pr) => ts.isPropertyAssignment(pr) && pr.name.getText(sf) === "verb",
    );
    if (!verb || !ts.isPropertyAssignment(verb)) return { key: null };
    return ts.isStringLiteral(verb.initializer) ? { key: verb.initializer.text } : { key: null };
  }

  /** Does this subtree RENDER `key` — `<Chrome … k="key">` or `ts(_, "key")`? */
  function rendersKey(node, key) {
    let hit = false;
    function visit(n) {
      if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
        if (n.tagName.getText(sf) === "Chrome") {
          const k = n.attributes.properties.find(
            (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "k",
          );
          const init = k && ts.isJsxAttribute(k) ? k.initializer : undefined;
          const lit =
            init && ts.isStringLiteral(init)
              ? init
              : init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)
                ? init.expression
                : null;
          if (lit && lit.text === key) hit = true;
        }
      }
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        DICT_CALLS.includes(n.expression.text)
      ) {
        const a = n.arguments[1];
        if (a && ts.isStringLiteral(a) && a.text === key) hit = true;
      }
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    }
    visit(node);
    return hit;
  }

  function visit(node) {
    if (
      ts.isJsxAttribute(node) &&
      ["aria-label", "ariaLabel"].includes(node.name.getText(sf)) &&
      node.initializer
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      let found = null;
      function findAl(n) {
        const v = verbKeyOf(n);
        if (v && found === null) found = v;
        ts.forEachChild(n, (c) => {
          findAl(c);
        });
      }
      findAl(node.initializer);
      if (found) {
        if (found.key === null) {
          out.push(
            `rule 3c: ${rel}:${line} — a \`verb\` control whose \`verb:\` is not a string literal. The guard cannot then find the label it must contain; pick the key with a ternary over two al() calls instead.`,
          );
        } else {
          // The element this name sits on: attribute → JsxAttributes → opening element.
          const owner = node.parent?.parent;
          const el = owner && ts.isJsxOpeningElement(owner) ? owner.parent : owner;
          if (!el || !rendersKey(el, found.key))
            out.push(
              `rule 3c: ${rel}:${line} — the control announces \`${found.key}\` but never renders it. WCAG 2.5.3 asks the NAME to contain the VISIBLE label; render the same key in this element's children, through <Chrome k="${found.key}" /> or ts(lang, "${found.key}").`,
            );
        }
      }
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
  return out;
}

for (const file of ARIA_ALL) failures.push(...verbLabelFindings(file));


// ── Rule 4 — every staff page reaches the language control ──────────────────────────────────────
// A staff surface that cannot switch language is a surface one of the two readers is locked out of.
// The switch is mounted PER SURFACE rather than by the layout (a layout strip would steal height
// from the KDS's measured `min-height: 100dvh`), so this is what makes "per surface" safe.
//
// ⚠️ THIS RULE WAS DECORATIVE IN ITS FIRST CUT AND THAT IS WHY IT LOOKS LIKE THIS NOW. It accepted
// `<StaffOutageShell>` as evidence that a page "owns" a switch. The shell mounts NOTHING — it is the
// full-page takeover shown when the auth answer is unknowable — and 14 of the 15 staff pages render
// it, so the rule passed green over 13 pages with no control at all while its own comment claimed to
// prove "no staff page forgets it". A guard satisfied by a TAG NAME rather than by the behaviour it
// names is LEARNINGS #60 exactly, written by the session that had just read #60.
//
// So: the only accepted evidence is a live `<StaffLangSwitch>`, found in the page's own JSX or in a
// component the page transitively imports (the KDS mounts it inside `KdsBoard`, not in
// `kitchen/page.tsx`). And the 13 pages that genuinely have no control are a RATCHET, not a pass.
//
// ⚠️ STATED LIMIT, because a guard that overclaims is worse than none: this is a PRESENCE check over
// the JSX a module returns, excluding the enumerated literal-dead shapes below. It is liveness
// against a PARKED DEAD COPY, not a reachability proof — a page whose only mount sits behind a
// runtime-false condition passes here, and the preview a11y tick is what covers that shape.
const staffPages = walkFiles(join(APP, "staff")).filter((f) => f.endsWith("/page.tsx"));
if (staffPages.length < 10)
  failures.push(
    `rule 4 DID NOT RUN: found only ${staffPages.length} staff pages — the discovery is broken, not the codebase.`,
  );

/**
 * ⚠️ A RATCHET, not a whitelist — same contract as ARIA_TODO. P2 PR A converts `/staff/login` and
 * the KDS; PR B takes the rest (OPEN-ITEMS P2c). A page may only ever LEAVE this list, and the
 * self-check below fails if a listed page HAS a switch — so a finished conversion cannot sit here
 * as a permanent exemption.
 */
const SWITCH_TODO = new Set(
  [
    "app/staff/approvals/page.tsx",
    "app/staff/expo/page.tsx",
    "app/staff/feedback/page.tsx",
    "app/staff/lock/page.tsx",
    "app/staff/menu/page.tsx",
    "app/staff/orders/page.tsx",
    "app/staff/page.tsx",
    "app/staff/profile/page.tsx",
    "app/staff/register/page.tsx",
    "app/staff/table/[id]/add/page.tsx",
    "app/staff/table/[id]/page.tsx",
    "app/staff/team/page.tsx",
    "app/staff/tips/page.tsx",
  ].map((f) => join(QR, f)),
);

/** Does this module's own JSX mount a live `<StaffLangSwitch>`? */
function mountsSwitchHere(file) {
  let sf;
  let src;
  try {
    src = readFileSync(file, "utf8");
    sf = parse(file);
  } catch {
    return false;
  }
  let found = false;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (node.tagName.getText(sf) === "StaffLangSwitch") {
        // Exclude the literal-dead shapes: `{false && <X/>}` and `{0 && <X/>}`.
        const before = src.slice(Math.max(0, node.getStart(sf) - 40), node.getStart(sf));
        if (!/\{\s*(false|0)\s*&&\s*$/.test(before)) found = true;
      }
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
  return found;
}

/**
 * ⚠️ NOT FOLLOWED by the walk below, and this is the single most load-bearing line in rule 4.
 *
 * `StaffOutageShell` MOUNTS the control as of P2 PR B (OPEN-ITEMS P2h) — it is the surface with the
 * strongest claim on it, because it replaces the page during an outage and takes the page's own
 * control with it. Every staff page imports the shell for its unknowable-gate branch. So a walk that
 * followed this import would answer "yes, reachable" for all fifteen pages the moment the shell was
 * converted, and rule 4 would go green over every page that has NO control in its normal render —
 * re-opening, in a new form, the exact hole the rule was rewritten to close (it used to accept the
 * shell's TAG as evidence while the shell mounted nothing).
 *
 * The shell is a DIFFERENT SURFACE, not this page's chrome. Rule 4 asks whether the person can
 * change the language on the page they are looking at; an answer that only holds while the ordering
 * system is unreachable is not an answer.
 */
const SWITCH_WALK_EXCLUDED = new Set([join(QR, "components/staff/StaffOutageShell.tsx")]);

/** …or does any module it transitively imports, within apps/qr, other than the excluded surfaces? */
function reachesSwitch(root) {
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const file = queue.shift();
    if (mountsSwitchHere(file)) return true;
    for (const dep of importsOf(file)) {
      if (!seen.has(dep) && dep.startsWith(QR) && !SWITCH_WALK_EXCLUDED.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  return false;
}

// Self-check: the exclusion is only meaningful while the excluded module ACTUALLY mounts a switch.
// If the shell ever stops mounting one, this set is silently hiding nothing and the next reader
// would trust a comment that has stopped being true.
for (const f of SWITCH_WALK_EXCLUDED)
  if (!mountsSwitchHere(f))
    failures.push(
      `rule 4: ${relative(ROOT, f)} is excluded from the switch walk but no longer mounts <StaffLangSwitch>. Delete the exclusion, or restore the mount.`,
    );

for (const file of staffPages) {
  const listed = SWITCH_TODO.has(file);
  const reaches = reachesSwitch(file);
  if (!listed && !reaches)
    failures.push(
      `rule 4: ${relative(ROOT, file)} never reaches <StaffLangSwitch>. One of the two people who read this console cannot change its language here.`,
    );
  if (listed && reaches)
    failures.push(
      `rule 4: ${relative(ROOT, file)} now reaches <StaffLangSwitch> — it is converted. Delete its SWITCH_TODO entry so the guard starts holding it.`,
    );
}
for (const file of SWITCH_TODO) {
  if (!staffPages.includes(file))
    failures.push(
      `rule 4: ${relative(ROOT, file)} is on the still-to-convert list but is not a staff page. Delete the entry.`,
    );
}

// ── Rule 3b — the ratchet only turns one way ─────────────────────────────────────────────────────
// A file listed as still-to-convert that rule 3 no longer has anything to say about HAS been
// converted, and its entry must be deleted — otherwise the list silently becomes a permanent
// exemption for finished work, which is how a TODO turns into a hole.
//
// It reads `ariaFindings` — the SAME predicate rule 3 enforces — rather than a second, looser one.
// The first cut asked only "is there a literal left?", which is a WEAKER question than rule 3 asks:
// a file whose names had been rewritten as hand-built templates would have satisfied 3b (no
// literals), left the list, and then failed rule 3 — or, with the ratchet entry deleted first,
// passed both while announcing English.
for (const file of ARIA_TODO) {
  try {
    parse(file);
  } catch {
    failures.push(
      `rule 3b: ${relative(ROOT, file)} is on the still-to-convert list but does not exist. Delete the entry.`,
    );
    continue;
  }
  if (ariaFindings(file).length === 0)
    failures.push(
      `rule 3b: ${relative(ROOT, file)} has no hand-written aria-label left — it is converted. Delete its ARIA_TODO entry so the guard starts holding it.`,
    );
}

// ── Rule 5 — a Burmese run that reaches the DOM must be MARKED ──────────────────────────────────
// THE DEFECT THIS EXISTS FOR, in the words of the audit that found it: the console's chrome went
// through `ts(lang, …)` into bare JSX children, and those elements — `.kds-stat span`, `.kds-badge`,
// `.kds-line-tag`, the board's live region — declare `letter-spacing: 0.07em` and
// `text-transform: uppercase` and NO `font-family`. So under a Burmese device the labels rendered in
// HANKEN, tracked apart from their own diacritics, at Latin leading. The dictionary was translated
// and the typography was not, and nothing in the build could tell.
//
// The rule: a dictionary call in a JSX CHILD position must sit inside an element carrying a `lang`
// attribute, which is what `.stx-root [lang="my"]` / `.orb-root [lang="my"]` in globals.css style.
// `<Chrome>` and `<OutageText>` mark their own output, so a call inside their props is exempt —
// they ARE the mark.
//
// EXEMPT BY DESIGN: attribute positions. An `aria-label` is a flat string that carries no markup at
// all; that trade-off is argued in `lib/staff-labels.ts` and rule 3 is what governs those.
//
// ⚠️ WHAT SATISFIES THIS MATCHER WITHOUT SHIPPING THE BEHAVIOUR, and what is done about each:
// • an identifier ending in `ts` — `callsAny` matches the CALLEE, not a substring;
// • the same call inside a comment — comments are not AST nodes;
// • `lang={undefined}` / `lang=""` — an initializer that is literally `undefined` or empty does not
//   count as a mark;
// • the mark on a DIFFERENT element than the one that renders — the walk stops at the nearest
//   enclosing JSX element chain within the file, which is the chain the browser inherits down.
const MARK_FILES = [
  ...ARIA_DIRS.flatMap((d) => {
    try {
      return walkFiles(d);
    } catch {
      return [];
    }
  }),
  join(QR, "components/ReadyBoard.tsx"),
].filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));

/** Components that mark their own output — a dictionary call in their props needs no outer mark. */
const SELF_MARKING = new Set(["Chrome", "OutageText"]);

/** A usable `lang=` — present, with an initializer that is neither `undefined` nor the empty string. */
function hasLangMark(el, sf) {
  const opening = ts.isJsxElement(el) ? el.openingElement : el;
  if (!opening.attributes) return false;
  return opening.attributes.properties.some((a) => {
    if (!ts.isJsxAttribute(a) || a.name.getText(sf) !== "lang") return false;
    const init = a.initializer;
    if (!init) return false;
    if (ts.isStringLiteral(init)) return init.text.length > 0;
    if (ts.isJsxExpression(init) && init.expression)
      return init.expression.getText(sf).trim() !== "undefined";
    return false;
  });
}

/** Is this node lexically inside ANY JSX at all? A call outside JSX never renders directly. */
function isInsideJsx(node) {
  for (let n = node.parent; n; n = n.parent)
    if (
      ts.isJsxElement(n) ||
      ts.isJsxSelfClosingElement(n) ||
      ts.isJsxFragment(n) ||
      ts.isJsxExpression(n)
    )
      return true;
  return false;
}

let marked = 0;
for (const file of MARK_FILES) {
  let sf;
  try {
    sf = parse(file);
  } catch {
    continue;
  }
  const rel = relative(ROOT, file);
  function visit(node) {
    // Iterate over the CALLS, never over the JSX expressions that contain them. The first cut did
    // the reverse and flagged five correctly-marked sites: `{failed && (<span lang="my">{ts(…)}</span>)}`
    // has an OUTER expression whose parent is an unmarked `<header>`, and a subtree search from
    // there finds the call and blames the wrong element. Starting at the call and walking OUT is
    // the only direction that identifies the element the text actually lands in.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      DICT_CALLS.includes(node.expression.text)
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      let el = node.parent;
      let verdict = null; // "marked" | "attribute" | null (= not in JSX at all)
      while (el) {
        // An attribute value: a flat string with no markup. rule 3 governs those.
        if (ts.isJsxAttribute(el)) {
          verdict = "attribute";
          break;
        }
        if (ts.isJsxElement(el) || ts.isJsxSelfClosingElement(el)) {
          const tag = (ts.isJsxElement(el) ? el.openingElement : el).tagName.getText(sf);
          if (SELF_MARKING.has(tag) || hasLangMark(el, sf)) {
            verdict = "marked";
            break;
          }
        }
        el = el.parent;
      }
      if (verdict === "marked") marked++;
      else if (verdict === null && !isInsideJsx(node))
        // Not rendered from JSX at all — a string handed to `setNotice`/`onError`, which lands in a
        // live region this rule cannot follow. STATED LIMIT: those regions are marked by hand and
        // `KdsBoard`'s is asserted in its own suite.
        void 0;
      else if (verdict === null)
        failures.push(
          `rule 5: ${rel}:${line} — a dictionary string reaches the DOM with no lang mark on any enclosing element. Under Burmese it renders in the Latin face, tracked and uppercased. Add lang={lang}, or render it through <Chrome>.`,
        );
    }
    // …and the same call handed to a component PROP that renders as text. Only the two EmptyState
    // slots exist today; both take a ReactNode, so both must carry <Chrome>, not a bare string.
    if (
      ts.isJsxAttribute(node) &&
      ["title", "subtitle"].includes(node.name.getText(sf)) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      callsAny(node.initializer.expression, DICT_CALLS)
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      failures.push(
        `rule 5: ${rel}:${line} — a dictionary string passed as a bare \`${node.name.getText(sf)}\` prop. The slot takes a ReactNode; pass <Chrome> so the Burmese arrives marked.`,
      );
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
}

// Self-check: a rule that finds nothing to hold is not passing, it is not running.
if (marked < 10)
  failures.push(
    `rule 5 DID NOT RUN: found only ${marked} marked dictionary renders across ${MARK_FILES.length} staff components — the discovery is broken, not the codebase.`,
  );

// ── Report ──────────────────────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error("staff locale isolation … \x1b[31mFAILED\x1b[0m");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.error(
  `staff locale isolation … \x1b[32mclean\x1b[0m\x1b[2m (${routeRoots.length} non-staff roots walked · cookie name in 1 file · ${ARIA_FILES.length} staff files aria-clean, ${ARIA_TODO.size} still to convert · ${staffPages.length - SWITCH_TODO.size}/${staffPages.length} staff pages reach the language control, ${SWITCH_TODO.size} still to convert · ${marked} marked dictionary renders)\x1b[0m`,
);
