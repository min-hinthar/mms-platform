#!/usr/bin/env node
/**
 * P2 — the staff-locale guard. EIGHT rules now — 1 and 2 (cookie isolation), 3 · 3b · 3c · 3d (the
 * accessible names), 4 (every page reaches the language control) and 5 (a dictionary string reaches
 * the DOM marked) — all PARSED (LEARNINGS #60), all in the CI fast lane: file-read-only, seconds,
 * no build and no DB.
 *
 * ⚠️ THE COUNT IN THIS SENTENCE IS PART OF THE GUARD. It read "Two rules" while the file implemented
 * seven, because each rule was added without re-reading the header — and a blind audit reported the
 * header as a defect before it reported anything in the rules. If you add a rule, the number here
 * moves in the same commit.
 *
 * The claim being defended is in `lib/staff-lang.ts`'s docblock: the staff device cookie is read on
 * `/staff/*` and `/board` ONLY, never by a diner route. W16b retired the app-wide locale toggle by
 * owner directive, and "we added a cookie back, but only for staff" is worth exactly as much as the
 * mechanism that proves it.
 *
 * RULE 1 — transitive unreachability. Walk the import graph from every non-staff, non-board route
 * root and assert every staff-device cookie's reader and action modules are unreachable at ANY
 * depth (the language cookie's since P2, the door cookie's since P7). A membership check ("is this
 * file under app/staff?") would pass a diner page that imports a shared component that imports the
 * reader, which is the realistic way this breaks.
 *
 * RULE 2 — literal uniqueness. Each cookie's NAME may appear in exactly one file. This closes the
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

/**
 * The staff DEVICE cookies rules 1 and 2 defend. P7 added a second one beside the language — the
 * remembered door — with the same three-module shape (a pure carrier, a `server-only` reader, an
 * ungated action), so both rules run over a LIST rather than a second copy of themselves. A third
 * device cookie joins here, nowhere else.
 */
const COOKIES = [
  {
    literal: "mms_staff_lang",
    constant: "STAFF_LANG_COOKIE",
    home: join(QR, "lib/staff-lang.ts"),
    guarded: [join(QR, "lib/staff-lang-server.ts"), join(QR, "lib/staff-lang-actions.ts")],
  },
  {
    literal: "mms_staff_door",
    constant: "STAFF_DOOR_COOKIE",
    home: join(QR, "lib/staff-door.ts"),
    guarded: [join(QR, "lib/staff-door-server.ts"), join(QR, "lib/staff-door-actions.ts")],
  },
];
const GUARDED = COOKIES.flatMap((c) => c.guarded);

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

function parse(file, srcOverride) {
  return ts.createSourceFile(
    file,
    srcOverride ?? readFileSync(file, "utf8"),
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
          `rule 1: a NON-STAFF route reaches a staff-device cookie module (${relative(ROOT, dep)}).\n      ${chain}\n      The staff device cookies are for /staff and /board only.`,
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

// ── Rule 2 — each cookie's name literal lives in exactly one file ────────────────────────────────
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
// One parse per file; every cookie's literal and constant are looked for in the same walk.
const literalHomes = new Map(COOKIES.map((c) => [c.literal, []]));
const constantHomes = new Map(COOKIES.map((c) => [c.constant, []]));
for (const file of RULE2_FILES) {
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
  let sf;
  try {
    sf = parse(file);
  } catch {
    continue;
  }
  const foundLiterals = new Set();
  const usedConstants = new Set();
  function visit(node) {
    // A StringLiteral or a no-substitution template — never a comment, which is not an AST node.
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      literalHomes.has(node.text)
    )
      foundLiterals.add(node.text);
    // …and the same name reached through the EXPORTED constant, which carries no literal for the
    // check above to see. The carrier modules are pure and must stay importable from anywhere, so
    // rule 1 cannot guard them — a diner server component importing STAFF_LANG_COOKIE and calling
    // `cookies().get()` with it would have passed both rules.
    if (ts.isIdentifier(node) && constantHomes.has(node.text)) usedConstants.add(node.text);
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
  for (const l of foundLiterals) literalHomes.get(l).push(file);
  for (const c of usedConstants) constantHomes.get(c).push(file);
}

for (const cookie of COOKIES) {
  const allowedConstantHomes = [cookie.home, ...cookie.guarded];
  const strayConstant = constantHomes
    .get(cookie.constant)
    .filter((f) => !allowedConstantHomes.includes(f));
  if (strayConstant.length) {
    failures.push(
      `rule 2: ${cookie.constant} may only be referenced by ${allowedConstantHomes.map((f) => relative(ROOT, f)).join(", ")}.\n      Found in: ${strayConstant.map((f) => relative(ROOT, f)).join(", ")}\n      Reading the staff cookie through the constant bypasses the literal check above.`,
    );
  }
  const homes = literalHomes.get(cookie.literal);
  if (homes.length !== 1 || homes[0] !== cookie.home) {
    failures.push(
      `rule 2: the cookie name "${cookie.literal}" must appear in exactly one file (${relative(ROOT, cookie.home)}).\n      Found in: ${homes.map((f) => relative(ROOT, f)).join(", ") || "(nowhere)"}\n      An inline cookies().get() elsewhere has no import for rule 1 to walk.`,
    );
  }
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
 * ⚠️ EMPTY, AND THAT IS THE FINISHED STATE — NOT AN INVITATION.
 *
 * This was a RATCHET over the staff surfaces that still carried hand-written English accessible
 * names: PR A converted the KDS, `/board` and the shared shell and listed the rest; PR B converted
 * all nineteen and the list drained to nothing. Rule 3 now holds EVERY file under `ARIA_DIRS`.
 *
 * So if rule 3 fails on your file, the answer is `al()` or `sx()` — never a new entry here. A name
 * added back to this list is not a TODO, it is a REGRESSION with a comment on it, and nothing in
 * this script can tell the two apart.
 *
 * ⚠️ AND BE PRECISE ABOUT WHAT STILL PROTECTS IT, because the first draft of this docblock was not.
 * It said the one-way contract "still runs". Rule 3b iterates THIS SET, so at zero entries it runs
 * over nothing — it is armed, not active. What actually holds the drained state is rule 3 itself,
 * over every file under `ARIA_DIRS`; rule 3b only stops a re-added entry from becoming a permanent
 * exemption once someone also cleans the file. A blind audit called the first wording dead code and
 * was right about the mechanism.
 */
const ARIA_TODO = new Set([].map((f) => join(QR, f)));

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
 * The nearest enclosing `const`/`let` initializer this identifier binds to, or null.
 *
 * Module-level because TWO rules need it and they need the SAME answer: rule 3 follows a value into
 * its declaration to see what text it carries (`callOut` → `` `Table ${n}` ``), and rule 3c follows
 * a hoisted `al()` call into the declaration that made it. Scope-walked outward, so the nearest
 * declaration wins — the one the browser would see.
 */
function declarationInitializerOf(id) {
  for (let n = id.parent; n; n = n.parent) {
    const stmts = n.statements;
    if (!stmts) continue;
    for (const st of stmts) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations)
        if (d.initializer && bindsName(d.name, id.text)) return d.initializer;
    }
  }
  return null;
}

/**
 * The local `function` declaration this identifier names, or null — the sibling of
 * `declarationInitializerOf` for the other way a call site factors a name out.
 *
 * ⚠️ ADDED BECAUSE THE RESOLUTION WAS ONE SHAPE SHORT AND THIS DIFF WROTE THE FIRST INSTANCE OF THE
 * OTHER. `declarationInitializerOf` matches variable statements only, so `subject: rowSubject(lang, r)`
 * — a `function` declaration in `app/staff/register/page.tsx` — was skipped WHOLE and its body never
 * scanned. It is clean today; the problem is that it is now the template, and moving one English
 * literal inside it would have left rule 3 reporting the file clean. That is precisely the
 * transitivity LEARNINGS #86 says the resolution must have or it is theatre. Found by a pre-merge
 * blind pass.
 */
function localFunctionOf(id) {
  for (let n = id.parent; n; n = n.parent) {
    const stmts = n.statements;
    if (!stmts) continue;
    for (const st of stmts)
      if (ts.isFunctionDeclaration(st) && st.name && st.name.text === id.text) return st;
  }
  return null;
}

/** Every expression a function RETURNS, not descending into functions nested inside it. */
function returnExpressionsOf(fn) {
  const out = [];
  function walk(n) {
    if (n !== fn && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n))) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    ts.forEachChild(n, (c) => {
      walk(c);
    });
  }
  if (fn.body) walk(fn.body);
  return out;
}

/**
 * Authored text spliced into a name — OUTSIDE a dictionary call (`` `${label} — bag for ${callOut}` ``,
 * `x ? "Deactivate" : "Reactivate"`, `ts(lang, k) + " request"`) and, since the audit below, INSIDE
 * one, in the slot values it fills. Joiner punctuation (`" — "`, `", "`) carries no letter or digit
 * and is left alone in any script.
 *
 * ⚠️ THE FIRST CUT RETURNED AT A NAME_CALLS NODE, and its comment said why: "its arguments are keys
 * and values, not copy". The second half of that sentence was false, and an audit of this guard
 * falsified it red-first — `tf(lang, "expo.a11y.cardBag", { x: callOut })` with
 * `` const callOut = `Table ${ticket.tableNumber}` `` ships the accessible name
 * "Table 7 အတွက် ပါဆယ်ထုပ်": an English word the console already owns as `floor.table`, spoken inside
 * a Burmese sentence, with the guard green. A slot VALUE is copy whenever a person hears a word in it.
 *
 * So a name call is descended into, minus the two positions that are deliberately not copy:
 *
 *   - a **direct string argument** — the dictionary KEY (`sx(lang, "reg.a11y.open")`);
 *   - a property named `kind` / `verb` / `status` — `al()`'s arm selector, its verb KEY, and the raw
 *     `FloorStatus` the label module maps through `FLOOR_STATUS_KEY` itself.
 *
 * and inside those value positions only a **Latin word** (two or more letters) counts, not any
 * speakable character: a name legitimately composes with `"#"`, `"·"`, a tent-card number and a
 * diner's own name. Values reached through a local `const` are followed to their declaration —
 * transitively, because the defect that motivated this was two hops
 * (`verifyWho` → `callOut` → `` `Table ${…}` ``) and a one-hop walk would have declared it clean.
 *
 * ⚠️ AND ONLY A STRING-SHAPED VALUE IS FOLLOWED — see `stringish`. The first cut followed every
 * identifier and reported four literals that nobody hears: `"comp"`, `"grocery"` and `"fired"`
 * (discriminants in `===` tests) and `"kds.channel.dinein"` (a key reached through a key map).
 * A guard whose findings must be hand-sorted into real and spurious teaches the next reader to
 * skim them.
 */
function splicedText(node, sf) {
  const speakable = /[\p{L}\p{N}]/u;
  const latinWord = /[A-Za-z]{2,}/;
  // `ts`/`tf`/`sx` take the KEY at index 1 — a literal, a ternary of literals, or a lookup into a
  // key map (`CHANNEL_KEY[ticket.channel]`). Skipping the POSITION rather than the shape is what
  // keeps a computed key from reading as copy. `al`'s second argument is the control OBJECT, whose
  // own key-ish fields are named below; `frozenBoardCopy` takes no key at all.
  const KEY_ARG = { ts: 1, tf: 1, sx: 1 };
  // `echo` joins these: it selects a RENDER MODE ("stack"/"inline"/false), never a word anybody
  // hears. It was added to `al()` to fix the WCAG 2.5.3 failure the pre-merge blind pass found, and
  // rule 3 flagged it as spliced copy the moment it appeared — correctly, by its own lights, which
  // is why the exemption is declared here rather than the rule loosened.
  const KEYISH_PROPS = ["kind", "verb", "status", "echo"];
  let hit = null;
  const seenDecls = new Set();
  const seenFns = new Set();
  const isChunk = (n) =>
    ts.isStringLiteral(n) ||
    ts.isNoSubstitutionTemplateLiteral(n) ||
    n.kind === ts.SyntaxKind.TemplateHead ||
    n.kind === ts.SyntaxKind.TemplateMiddle ||
    n.kind === ts.SyntaxKind.TemplateTail;

  /**
   * Could this expression CARRY authored text into the slot? Only a string-shaped one can, and the
   * distinction is load-bearing: `done: line.state !== "fired"` and
   * `` const grocery = ticket.lines.every((l) => l.fulfillment === "grocery") `` both hold a string
   * literal that is a DISCRIMINANT, never a word anybody hears. A property read (`request.lineName`,
   * `ticket.customerName`) is data the diner supplied, not copy this file wrote.
   */
  const isNameCall = (n) =>
    ts.isCallExpression(n) &&
    ts.isIdentifier(n.expression) &&
    NAME_CALLS.includes(n.expression.text);

  function stringish(n) {
    if (isChunk(n) || ts.isTemplateExpression(n)) return true;
    if (isNameCall(n)) return true; // a dictionary call produces a string — and a localized one
    if (ts.isParenthesizedExpression(n)) return stringish(n.expression);
    if (ts.isConditionalExpression(n)) return stringish(n.whenTrue) || stringish(n.whenFalse);
    // `+` concatenates; `??` and `||` CHOOSE between two candidate strings. All three can put a word
    // in the slot, so all three are followed.
    if (
      ts.isBinaryExpression(n) &&
      [
        ts.SyntaxKind.PlusToken,
        ts.SyntaxKind.QuestionQuestionToken,
        ts.SyntaxKind.BarBarToken,
      ].includes(n.operatorToken.kind)
    )
      return stringish(n.left) || stringish(n.right);
    if (ts.isIdentifier(n)) {
      const d = declarationInitializerOf(n);
      return d ? stringish(d) : false;
    }
    // A call into a function declared in THIS file is not opaque — its returns are authored here.
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const fn = localFunctionOf(n.expression);
      if (fn && !seenFns.has(fn)) {
        seenFns.add(fn);
        const yes = returnExpressionsOf(fn).some((r) => stringish(r));
        seenFns.delete(fn);
        return yes;
      }
    }
    return false;
  }

  /** Walk a slot VALUE for authored Latin words, following local bindings to their declarations. */
  function scanValue(n) {
    if (hit !== null || !stringish(n)) return;
    const EQUALITY = [
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.LessThanToken,
      ts.SyntaxKind.GreaterThanToken,
      ts.SyntaxKind.LessThanEqualsToken,
      ts.SyntaxKind.GreaterThanEqualsToken,
    ];

    function walk(x) {
      if (hit !== null) return;
      // A DISCRIMINANT is never spoken. `r.kind === "kiosk" ? … : …` picks which sentence renders;
      // the literal that picks it is not a word anybody hears. Walk the ARMS, never the condition —
      // extending the resolution through local functions surfaced this immediately, because a
      // factored-out subject builder is exactly where a ternary on a row kind lives.
      if (ts.isConditionalExpression(x)) {
        walk(x.whenTrue);
        walk(x.whenFalse);
        return;
      }
      if (ts.isBinaryExpression(x) && EQUALITY.includes(x.operatorToken.kind)) return;
      // A dictionary call NESTED inside a value (`` `${tf(lang, "floor.table", { id })} · #${code}` ``)
      // is the correct shape, not a splice — but its OWN slots are governed by the same rule, so it
      // goes back through `visit` rather than being skipped. Walking it as plain text would report
      // its key ("floor.table" is two Latin words to a regex) as the authored copy.
      if (isNameCall(x)) {
        visit(x);
        return;
      }
      if (isChunk(x)) {
        if (latinWord.test(x.text)) hit = x.text;
        return;
      }
      if (ts.isCallExpression(x) && ts.isIdentifier(x.expression)) {
        const fn = localFunctionOf(x.expression);
        if (fn && !seenFns.has(fn)) {
          seenFns.add(fn);
          for (const r of returnExpressionsOf(fn)) walk(r);
        }
        return;
      }
      if (ts.isIdentifier(x)) {
        const decl = declarationInitializerOf(x);
        if (decl && !seenDecls.has(decl) && stringish(decl)) {
          seenDecls.add(decl);
          walk(decl);
        }
        return;
      }
      ts.forEachChild(x, (c) => {
        walk(c);
      });
    }
    walk(n);
  }

  function visit(n) {
    if (hit !== null) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      NAME_CALLS.includes(n.expression.text)
    ) {
      const keyArg = KEY_ARG[n.expression.text];
      n.arguments.forEach((arg, i) => {
        if (i === 0 || i === keyArg) return; // the lang, and the dictionary key
        if (ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (!ts.isPropertyAssignment(prop)) continue;
            if (KEYISH_PROPS.includes(prop.name.getText(sf))) continue;
            scanValue(prop.initializer);
          }
        } else scanValue(arg);
      });
      return;
    }
    if (isChunk(n) && speakable.test(n.text)) {
      hit = n.text;
      return;
    }
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  }
  visit(node);
  return hit;
}

/**
 * A dictionary call reaching a ReactNode prop UNWRAPPED — `body={ts(lang, k)}`. JSX subtrees are
 * skipped, because an element marks itself: `body={<Chrome k="…" vars={{ what: ts(lang, what) }} />}`
 * is the CORRECT shape and a plain `callsAny` over the whole initializer reported it as the defect
 * (measured — it was rule 5's first finding the moment the prop list grew).
 */
function bareDictCall(expr) {
  let hit = false;
  function visit(n) {
    if (hit) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      DICT_CALLS.includes(n.expression.text)
    ) {
      hit = true;
      return;
    }
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  }
  visit(expr);
  return hit;
}

/**
 * Every rule-3 violation in one file. Rule 3 reports these for a CONVERTED file; rule 3b reads the
 * SAME function to decide whether a still-to-convert file has in fact been converted. Two predicates
 * would let a file be clean for the ratchet and dirty for the rule at the same time — which is how a
 * TODO entry becomes a permanent exemption for work that only looks finished.
 */
function ariaFindings(file, srcOverride) {
  const out = [];
  let sf;
  try {
    sf = parse(file, srcOverride);
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
        // `const { aria } = al(lang, …)` one line up — localized, just not inlined. But the SPLICE
        // rule still applies to what that declaration BUILDS.
        //
        // ⚠️ THIS BRANCH USED TO BE EMPTY, AND THAT WAS THE HOLE. `localBindingIsLocalized` answers
        // "does the initializer call the dictionary ANYWHERE", so
        // `` const aria = `${ts(lang, "kds.bump")} — bag for ${callOut}` `` answered yes and skipped
        // the splice check entirely — the same string is caught INLINE (it is the example in
        // `splicedText`'s own docblock) and passed hoisted. A blind audit found it latent: the two
        // hoisted call sites in the tree are pure `al()` calls, and `verbLabelFindings` exists
        // precisely because call sites are expected to hoist.
        const decl = declarationInitializerOf(expr);
        const splicedHoisted = decl ? splicedText(decl, sf) : null;
        if (splicedHoisted !== null)
          out.push(
            `rule 3: ${rel}:${line} — authored text "${splicedHoisted.trim()}" spliced into a localized name, one declaration up. Every word a person hears comes from the dictionary; only punctuation joins them.`,
          );
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
function verbLabelFindings(file, srcOverride) {
  const out = [];
  let sf;
  try {
    sf = parse(file, srcOverride);
  } catch {
    return out;
  }
  const rel = relative(ROOT, file);

  /** The `verb:` property of an `al(_, { kind: "verb", … })` call, or null. */
  /** The `echo` an `al()` control or a `<Chrome>` declares, normalized. Absent === `false`. */
  function echoOf(props, name = "echo") {
    const e = props.find(
      (pr) =>
        (ts.isPropertyAssignment(pr) || ts.isJsxAttribute(pr)) && pr.name.getText(sf) === name,
    );
    if (!e) return "false";
    const init = ts.isJsxAttribute(e)
      ? e.initializer && ts.isJsxExpression(e.initializer)
        ? e.initializer.expression
        : e.initializer
      : e.initializer;
    if (!init) return "<computed>";
    if (ts.isStringLiteral(init)) return init.text;
    if (init.kind === ts.SyntaxKind.FalseKeyword) return "false";
    return "<computed>";
  }

  function verbKeyOf(node) {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return null;
    if (node.expression.text !== "al") return null;
    const arg = node.arguments[1];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return null;
    const kind = arg.properties.find(
      (pr) => ts.isPropertyAssignment(pr) && pr.name.getText(sf) === "kind",
    );
    if (!kind || !ts.isPropertyAssignment(kind) || !ts.isStringLiteral(kind.initializer))
      return null;
    const k = kind.initializer.text;
    const echo = echoOf(arg.properties);
    // An arm whose key is hardcoded inside al() — the KDS bump and 86 are these, and they are the
    // two the blind pass's own search could not see.
    if (FIXED_KEY_ARMS.has(k)) return { key: FIXED_KEY_ARMS.get(k), echo };
    if (k !== "verb") return null;
    const verb = arg.properties.find(
      (pr) => ts.isPropertyAssignment(pr) && pr.name.getText(sf) === "verb",
    );
    if (!verb || !ts.isPropertyAssignment(verb)) return { key: null, echo };
    return ts.isStringLiteral(verb.initializer)
      ? { key: verb.initializer.text, echo }
      : { key: null, echo };
  }

  /**
   * The ternary arms an expression sits under, innermost last, as `condition@true|false` strings.
   * Two paths CONTRADICT when they share a condition and disagree on its branch — which is the
   * crossed-pairing defect: a button that announces `deactivate` while `row.active` and renders
   * `reactivate` on that same branch.
   *
   * ⚠️ STATED LIMIT. Conditions are compared as normalized SOURCE TEXT, so `firstStage` and
   * `!firstStage` read as two different conditions and a pairing crossed that way is not caught —
   * it can only ever miss a defect, never invent one. What it does catch is the shape every call
   * site in this repo actually writes: one condition, two arms, both halves keyed off it.
   */
  function armPath(node, stopAt) {
    const path = [];
    for (let n = node; n && n !== stopAt; n = n.parent) {
      const par = n.parent;
      if (par && ts.isConditionalExpression(par) && (par.whenTrue === n || par.whenFalse === n))
        path.push(`${par.condition.getText(sf).replace(/\s+/g, " ")}@${par.whenTrue === n}`);
    }
    return path;
  }

  function contradicts(a, b) {
    for (const step of a) {
      const [cond, branch] = step.split("@");
      if (b.some((o) => o.startsWith(`${cond}@`) && o !== `${cond}@${branch}`)) return true;
    }
    return false;
  }

  /**
   * Does this subtree RENDER `key` — `<Chrome … k="key">` or `ts(_, "key")` — on a branch that does
   * not contradict `namePath`, the ternary arms the name announcing it sits under?
   */
  function rendersKey(node, key, namePath = [], wantEcho = null) {
    let hit = false;
    let wrongEcho = null;
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
              : init &&
                  ts.isJsxExpression(init) &&
                  init.expression &&
                  ts.isStringLiteral(init.expression)
                ? init.expression
                : null;
          if (lit && lit.text === key && !contradicts(namePath, armPath(n, node))) {
            // ⚠️ THE ECHO IS PART OF THE PAIRING, not decoration. `<Chrome echo>` under `my` puts
            // TWO strings on screen; `al()` composes its `visible` through `chromeVisible(…, echo)`
            // to match. Pass a different echo at either end and the name silently stops containing
            // half the visible label — the WCAG 2.5.3 failure a pre-merge blind pass found on 15
            // controls, which rule 3c could not see because it compared KEYS only.
            const rendered = echoOf(n.attributes.properties);
            if (wantEcho !== null && rendered !== wantEcho) wrongEcho = rendered;
            else hit = true;
          }
        }
      }
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        DICT_CALLS.includes(n.expression.text)
      ) {
        const a = n.arguments[1];
        if (
          a &&
          ts.isStringLiteral(a) &&
          a.text === key &&
          !contradicts(namePath, armPath(n, node))
        )
          hit = true;
      }
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    }
    visit(node);
    return { hit, wrongEcho };
  }

  function visit(node) {
    if (
      ts.isJsxAttribute(node) &&
      ["aria-label", "ariaLabel"].includes(node.name.getText(sf)) &&
      node.initializer
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      // ⚠️ EVERY verb key in the name, not the FIRST. The first cut kept one
      // (`if (v && found === null) found = v`) and a probe against the expo board's four-branch bump
      // button showed what that bought: breaking the `<Chrome>` key of branch one reddened, breaking
      // any of the other three left the guard green — three of four pairings unguarded by a matcher
      // satisfied by POSITION, which is LEARNINGS #60 for the second time in this file. A name that
      // announces N verbs must render all N.
      const found = [];
      function findAl(n) {
        const v = verbKeyOf(n);
        if (v && !found.some((f) => f.key === v.key))
          found.push({ ...v, path: armPath(n, node.initializer) });
        // ⚠️ FOLLOW A HOISTED CALL. `const { aria } = al(lang, { kind: "verb", … })` one line above
        // and `aria-label={aria}` below is the shape a call site naturally takes when the control
        // has several fields — and the first cut of this rule searched only the attribute's own
        // initializer, so that shape passed while shipping a name whose verb the element never
        // rendered. Found by an audit of this guard, not of the code it guards, which is the whole
        // of LEARNINGS #60: a matcher satisfied by POSITION.
        if (ts.isIdentifier(n)) {
          const decl = declarationInitializerOf(n);
          if (decl && !seenDecls.has(decl)) {
            seenDecls.add(decl);
            findAl(decl);
          }
        }
        ts.forEachChild(n, (c) => {
          findAl(c);
        });
      }
      const seenDecls = new Set();
      findAl(node.initializer);
      // The element this name sits on: attribute → JsxAttributes → opening element.
      const owner = node.parent?.parent;
      const el = owner && ts.isJsxOpeningElement(owner) ? owner.parent : owner;
      for (const f of found) {
        if (f.key === null) {
          out.push(
            `rule 3c: ${rel}:${line} — a \`verb\` control whose \`verb:\` is not a string literal. The guard cannot then find the label it must contain; pick the key with a ternary over two al() calls instead.`,
          );
        } else {
          const r = el ? rendersKey(el, f.key, f.path, f.echo) : { hit: false, wrongEcho: null };
          const where = f.path.length ? ` on the branch \`${f.path.join(" / ")}\`` : "";
          if (r.wrongEcho !== null) {
            out.push(
              `rule 3c: ${rel}:${line} — the control announces \`${f.key}\`${where} with \`echo: ${f.echo}\`, but renders it with \`echo=${r.wrongEcho}\`. Under lang="my" an echo puts TWO strings on screen and al() composes its visible label through chromeVisible(…, echo) — mismatch them and the name stops containing half of what the control shows (WCAG 2.5.3). Pass the SAME echo at both ends.`,
            );
          } else if (!r.hit) {
            out.push(
              `rule 3c: ${rel}:${line} — the control announces \`${f.key}\`${where} but never renders it there. WCAG 2.5.3 asks the NAME to contain the VISIBLE label; render the same key in this element's children, on the same branch, through <Chrome k="${f.key}" /> or ts(lang, "${f.key}").`,
            );
          }
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

/**
 * The `al()` arms whose visible label comes from a key HARDCODED inside the label module — read OUT
 * of `staff-labels.ts` rather than transcribed here, because a hand map is a second copy and the
 * pre-merge blind pass proved what a second copy costs: its own search keyed on the `verb:` field,
 * so it missed the KDS bump and 86 entirely and reported 13 sites where the measured number is 15.
 *
 * Shape matched: `case "<kind>": { … chromeVisible(lang, "<key>", control.echo) … }`.
 */
function fixedKeyArms() {
  const sf = parse(join(QR, "lib/staff-labels.ts"));
  const out = new Map();
  function visit(node) {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) {
      const kind = node.expression.text;
      let key = null;
      function find(n) {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === "chromeVisible" &&
          n.arguments[1] &&
          ts.isStringLiteral(n.arguments[1])
        )
          key = n.arguments[1].text;
        ts.forEachChild(n, (c) => {
          find(c);
        });
      }
      find(node);
      if (key) out.set(kind, key);
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
  return out;
}

const FIXED_KEY_ARMS = fixedKeyArms();
// Self-check: this rule is about arms that exist. If the derivation stops finding any, it has gone
// blind and every control it governs would pass by default.
if (FIXED_KEY_ARMS.size === 0)
  failures.push(
    'rule 3c: no fixed-key al() arm found in lib/staff-labels.ts — the derivation that feeds rule 3c has gone blind (did `chromeVisible(lang, "<key>", …)` change shape?).',
  );

for (const file of ARIA_ALL) failures.push(...verbLabelFindings(file));

// ── Rule 3d — a name has to land on an element that can BEAR one ────────────────────────────────
// `<div aria-label={sx(lang, "settle.a11y.readerPanel")}>` type-checks, reads as localized, counts
// toward "aria-clean", and ships NOTHING: a bare div maps to the ARIA `generic` role and a bare `p`
// to `paragraph`, and neither takes an author-supplied name — the browser discards it. Found by a
// blind audit on the reader-settle panel, which is `tabIndex={-1}` and is the element the cashier's
// focus is deliberately moved to as the settle section unmounts under them: they landed on an
// unnamed container at the moment the terminal took the transaction. A second live instance was in
// the KDS stat strip, from the PR before.
//
// The fix at both sites is one attribute (`role="group"`), which is why this is a rule and not a
// backlog row. Scoped to the three generic tags: every other element the console names is a
// `<button>`, `<a>`, `<nav>`, `<section>`, `<ul>` or a div that already declares its role.
function nameableFindings(file, srcOverride) {
  const out = [];
  let sf;
  try {
    sf = parse(file, srcOverride);
  } catch {
    return out;
  }
  const rel = relative(ROOT, file);
  const GENERIC_TAGS = ["div", "span", "p"];
  // Roles whose name is PROHIBITED by ARIA — declaring one of these does not rescue the name, it
  // guarantees it is thrown away. `presentation`/`none` additionally strip the element's semantics.
  const NAME_PROHIBITED_ROLES = ["generic", "presentation", "none", "paragraph"];
  const NAME_ATTRS = ["aria-label", "ariaLabel", "aria-labelledby"];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(sf);
      if (GENERIC_TAGS.includes(tag)) {
        const props = node.attributes.properties;
        const named = props.find(
          (a) => ts.isJsxAttribute(a) && NAME_ATTRS.includes(a.name.getText(sf)),
        );
        // ⚠️ THE ROLE'S VALUE, NOT THE ATTRIBUTE'S NAME. The first cut asked only whether a `role`
        // attribute was present, so `<div role="presentation" aria-label={…}>` satisfied it — a role
        // that ALSO discards the name, and strips the element's semantics on top. A matcher
        // satisfied by an attribute NAME is LEARNINGS #60 in miniature; a pre-merge blind pass
        // caught it in the rule added to fix that very class.
        const roleAttr = props.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "role");
        const roleInit = roleAttr && ts.isJsxAttribute(roleAttr) ? roleAttr.initializer : undefined;
        const roleLit = roleInit
          ? ts.isStringLiteral(roleInit)
            ? roleInit.text
            : ts.isJsxExpression(roleInit) &&
                roleInit.expression &&
                ts.isStringLiteral(roleInit.expression)
              ? roleInit.expression.text
              : null // computed — stated limit: the guard cannot tell, and says nothing
          : undefined;
        const prohibited =
          roleLit !== null && roleLit !== undefined && NAME_PROHIBITED_ROLES.includes(roleLit);
        const hasRole = roleAttr !== undefined && !prohibited;
        if (named && !hasRole) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          const because = prohibited
            ? `role="${roleLit}"`
            : `a bare <${tag}> (implicit role ${tag === "p" ? "paragraph" : "generic"})`;
          out.push(
            `rule 3d: ${rel}:${line} — a name on ${because}. That role does not accept an author-supplied name, so the browser DISCARDS it. Give it a role that does — role="group" for a named container, role="status" for a live one, role="list" for a list.`,
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

for (const file of ARIA_ALL) failures.push(...nameableFindings(file));

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
 * ⚠️ EMPTY, AND THAT IS THE FINISHED STATE — same contract, same warning as ARIA_TODO above.
 *
 * PR A converted `/staff/login` and the KDS and listed the thirteen pages with no language control
 * at all; PR B mounted every one, and rule 4 now holds all fifteen. A page added back here is a
 * person who cannot read English arriving on a staff screen with no way to change it — which is the
 * exact failure the rule was written for, so it does not get to be a TODO.
 *
 * `SWITCH_WALK_EXCLUDED` above is the one thing that still needs care: `StaffOutageShell` mounts the
 * control and every page imports it, so the walk must not follow that import or all fifteen pages
 * would answer "reachable" on the strength of a screen that only exists during an outage.
 */
const SWITCH_TODO = new Set([].map((f) => join(QR, f)));

/** Does this module's own JSX mount a live `<StaffLangSwitch>`? */
function mountsSwitchHere(file, srcOverride) {
  let sf;
  try {
    sf = parse(file, srcOverride);
  } catch {
    return false;
  }
  let found = false;

  /**
   * Is this element parked in a literal-dead branch — `{false && <X/>}` or `{0 && <X/>}`?
   *
   * ⚠️ THIS USED TO BE A 40-CHARACTER RAW-TEXT REGEX (`/\{\s*(false|0)\s*&&\s*$/` over the source
   * before the tag), and a pre-merge blind pass showed exactly what that costs: write the same dead
   * branch across lines — which is what prettier emits past the print width —
   *
   *     {false && (
   *       <StaffLangSwitch lang={lang} />
   *     )}
   *
   * and the preceding 40 characters end in `(` + newline + indent, the regex misses, and the page is
   * reported as REACHING a live control while shipping nothing. That is the hole rule 4 was rewritten
   * to close, reopened by the exclusion meant to narrow it — and the guard's own header claims all
   * its rules parse. Walking parents costs nothing and cannot be defeated by a line break.
   */
  function inDeadBranch(node) {
    for (let n = node.parent; n; n = n.parent) {
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        (n.left.kind === ts.SyntaxKind.FalseKeyword ||
          (ts.isNumericLiteral(n.left) && n.left.text === "0"))
      )
        return true;
      if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) break;
    }
    return false;
  }

  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (node.tagName.getText(sf) === "StaffLangSwitch" && !inDeadBranch(node)) found = true;
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
    // …and the same call handed to a component PROP that renders as text. Each of these takes a
    // ReactNode and renders it as a text node, so each must carry <Chrome>, not a bare string.
    //
    // ⚠️ THIS LIST IS THE RULE'S BLIND SPOT AND IT MUST GROW WITH THE PROPS. It read
    // `["title", "subtitle"]` under a comment saying "Only the two EmptyState slots exist today" —
    // written in the same PR that widened `OutageState`'s `body`, `escalatedBody` and (a round
    // later) `retryLabel`/`retryBusyLabel` to ReactNode and passed copy through them. A blind audit
    // found the comment falsified by its own diff. When you widen a copy prop to ReactNode, add it
    // here in the same commit.
    if (
      ts.isJsxAttribute(node) &&
      [
        "title",
        "subtitle",
        "body",
        "escalatedBody",
        "retryLabel",
        "retryBusyLabel",
        "label",
        "busyLabel",
      ].includes(node.name.getText(sf)) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      bareDictCall(node.initializer.expression)
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

// ── SELF-TEST — every rule, aimed at a fixture that MUST make it fire ───────────────────────────
//
// ⚠️ THIS IS THE ANSWER TO "the 1265-line guard this slice rests on has no test of its own" (a
// pre-merge blind pass, 2026-09-06). Every falsification claim in this file's header and in
// LEARNINGS #86/#87 was a ONE-TIME hand assertion: I induced each violation, watched it go red, and
// reverted. Nothing re-ran those probes afterwards, so a refactor that quietly disarmed `verbKeyOf`,
// `rendersKey`, `contradicts` or `splicedText` would turn eight rules into a no-op with CI green —
// the exact shape this guard exists to prevent, in the guard itself.
//
// The repo's precedent is `scripts/codex-review-gate.mjs`, unit-tested in
// `apps/qr/lib/codex-review-gate.test.ts`. This is the same idea placed differently: the fixtures
// live INSIDE the guard and run on every invocation, so they cannot rot in a suite nobody points at
// this file, and `check:staff-lang` already runs in CI's fast lane. Each case is a source string the
// rule must find, plus one NEAR-MISS it must not — a rule that fires on everything is as useless as
// one that fires on nothing.
//
// If you add a rule, add its pair here. If a case here stops firing, the rule is gone, not the case.
const SELF_TEST_CASES = [
  // ── rule 3 — the name comes from the dictionary ──────────────────────────────────────────────
  {
    rule: "rule 3",
    what: "a literal aria-label",
    fn: ariaFindings,
    fires: `const A = () => <button aria-label="Approve">x</button>;`,
    misses: `const A = () => <ul role="list" aria-label={sx(lang, "kds.a11y.x")}><li>x</li></ul>;`,
  },
  {
    rule: "rule 3",
    what: "authored English spliced into a localized name",
    fn: ariaFindings,
    fires:
      'const A = () => <button aria-label={`${ts(lang, "kds.bump")} — bag for ${x}`}>x</button>;',
    misses: 'const A = () => <button aria-label={`${ts(lang, "kds.bump")} — ${x}`}>x</button>;',
  },
  {
    rule: "rule 3",
    what: "an English WORD inside a name call's slot value",
    fn: ariaFindings,
    fires:
      'const A = () => <button aria-label={tf(lang, "kds.err.bump", { x: "Table 7" })}>x</button>;',
    misses:
      'const A = () => <button aria-label={tf(lang, "kds.err.bump", { x: code })}>x</button>;',
  },
  {
    rule: "rule 3",
    what: "the same splice, hoisted one declaration up",
    fn: ariaFindings,
    fires:
      'const A = () => { const aria = `${ts(lang, "kds.bump")} — bag for the counter`; return <button aria-label={aria}>x</button>; };',
    misses:
      'const A = () => { const { aria } = al(lang, { kind: "verb", verb: "kds.verb.x", subject: s }); return <button aria-label={aria}>x</button>; };',
  },
  // ── rule 3c — the control renders the word it announces ──────────────────────────────────────
  {
    rule: "rule 3c",
    what: "a verb control that never renders its key",
    fn: verbLabelFindings,
    fires:
      'const A = () => <button aria-label={al(lang, { kind: "verb", verb: "kds.bump", subject: s }).aria}>x</button>;',
    misses:
      'const A = () => <button aria-label={al(lang, { kind: "verb", verb: "kds.bump", subject: s }).aria}><Chrome lang={lang} k="kds.bump" /></button>;',
  },
  {
    rule: "rule 3c",
    what: "a CROSSED ternary — both keys present, each on the wrong branch",
    fn: verbLabelFindings,
    fires:
      'const A = () => <button aria-label={on ? al(lang, { kind: "verb", verb: "kds.bump", subject: s }).aria : al(lang, { kind: "verb", verb: "kds.undo", subject: s }).aria}>{on ? <Chrome lang={lang} k="kds.undo" /> : <Chrome lang={lang} k="kds.bump" />}</button>;',
    misses:
      'const A = () => <button aria-label={on ? al(lang, { kind: "verb", verb: "kds.bump", subject: s }).aria : al(lang, { kind: "verb", verb: "kds.undo", subject: s }).aria}>{on ? <Chrome lang={lang} k="kds.bump" /> : <Chrome lang={lang} k="kds.undo" />}</button>;',
  },
  {
    rule: "rule 3c",
    what: "an echo mismatch — the name composed for one mode, the label rendered in another",
    fn: verbLabelFindings,
    fires:
      'const A = () => <button aria-label={al(lang, { kind: "verb", verb: "kds.bump", subject: s }).aria}><Chrome lang={lang} k="kds.bump" echo="stack" /></button>;',
    misses:
      'const A = () => <button aria-label={al(lang, { kind: "verb", echo: "stack", verb: "kds.bump", subject: s }).aria}><Chrome lang={lang} k="kds.bump" echo="stack" /></button>;',
  },
  // ── rule 3d — the name lands on an element that can bear one ─────────────────────────────────
  {
    rule: "rule 3d",
    what: "a name on a bare <div>",
    fn: nameableFindings,
    fires: 'const A = () => <div aria-label={sx(lang, "kds.a11y.x")}>x</div>;',
    misses: 'const A = () => <div role="group" aria-label={sx(lang, "kds.a11y.x")}>x</div>;',
  },
  {
    rule: "rule 3d",
    what: "a role that is PRESENT and still prohibits a name",
    fn: nameableFindings,
    fires: 'const A = () => <div role="presentation" aria-label={sx(lang, "kds.a11y.x")}>x</div>;',
    misses: 'const A = () => <div role="status" aria-label={sx(lang, "kds.a11y.x")}>x</div>;',
  },
];

for (const c of SELF_TEST_CASES) {
  const fires = c.fn(join(QR, "components/staff/__selftest__.tsx"), c.fires);
  const misses = c.fn(join(QR, "components/staff/__selftest__.tsx"), c.misses);
  if (fires.length === 0)
    failures.push(
      `SELF-TEST: ${c.rule} no longer fires on "${c.what}". The rule is disarmed — its fixture is unchanged, so this is the guard breaking, not the code.`,
    );
  if (misses.length !== 0)
    failures.push(
      `SELF-TEST: ${c.rule} fires on the NEAR-MISS for "${c.what}" (${misses[0]}). A rule that flags the correct shape teaches everyone to ignore it.`,
    );
}

// Rule 4's evidence test is a boolean rather than a finding list, so it gets its own pair — and the
// multi-line dead branch is here because the raw-text regex it replaced could not see it.
{
  const F = join(QR, "components/staff/__selftest__.tsx");
  const live = mountsSwitchHere(F, "const A = () => <div><StaffLangSwitch lang={lang} /></div>;");
  const deadInline = mountsSwitchHere(
    F,
    "const A = () => <div>{false && <StaffLangSwitch lang={lang} />}</div>;",
  );
  const deadWrapped = mountsSwitchHere(
    F,
    "const A = () => (\n  <div>\n    {false && (\n      <StaffLangSwitch lang={lang} />\n    )}\n  </div>\n);",
  );
  if (!live) failures.push("SELF-TEST: rule 4 no longer sees a LIVE <StaffLangSwitch> mount.");
  if (deadInline)
    failures.push("SELF-TEST: rule 4 counts `{false && <StaffLangSwitch/>}` as a live mount.");
  if (deadWrapped)
    failures.push(
      "SELF-TEST: rule 4 counts a MULTI-LINE `{false && (…)}` as a live mount — the exact shape prettier emits past the print width, and the hole the raw-text regex left.",
    );
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
  `staff locale isolation … \x1b[32mclean\x1b[0m\x1b[2m (${routeRoots.length} non-staff roots walked · ${COOKIES.length} cookie names each in 1 file · ${ARIA_FILES.length} staff files aria-clean, ${ARIA_TODO.size} still to convert · ${staffPages.length - SWITCH_TODO.size}/${staffPages.length} staff pages reach the language control, ${SWITCH_TODO.size} still to convert · ${marked} marked dictionary renders)\x1b[0m`,
);
