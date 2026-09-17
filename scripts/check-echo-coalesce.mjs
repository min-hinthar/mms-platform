#!/usr/bin/env node
/**
 * M193 — EVERY `useCartRealtime` consumer coalesces its echoes, and there is exactly ONE window.
 *
 * ## Why a guard and not a test
 *
 * #275 fixed M193 in `TableCartProvider` and the row was closed. The defect it describes kept
 * shipping, verbatim, one route away: `Checkout.tsx` passed `useCartRealtime` an arrow that ignored
 * its `CartChange` and called `refresh()` per row event. /cart is a separate route with a separate
 * tree, so no test of the /menu provider could ever have noticed — and no test of `Checkout` existed
 * to. The rule is not "this component coalesces"; it is "every consumer of this hook coalesces",
 * which is a statement about a SET that grows. A guard over the set is the only thing that holds for
 * the third consumer nobody has written yet.
 *
 * ## It PARSES (LEARNINGS #60)
 *
 * The obvious version of this greps each call site for the word `useCoalescedRefresh`. That is a
 * substring matcher and it is satisfied by a comment, by an import that is never used, and by a dead
 * `if (false) schedule();`. So:
 *
 *   • the call sites are CallExpressions named `useCartRealtime`, found by walking the AST of every
 *     `.ts`/`.tsx` under `apps/qr` — never by reading a list maintained here, which is how
 *     `check-child-freeze`'s first draft missed half its subjects;
 *   • the third argument is resolved to its DECLARATION in the same file, and that declaration must
 *     be `useCoalescedRefresh(...)` or a `useCallback` wrapping it;
 *   • inside a wrapping callback the scheduling call must be a DIRECT, UNCONDITIONAL statement of
 *     the body — a top-level `ExpressionStatement`, so `if (…)`, `&&`, a ternary and any nesting are
 *     all excluded by construction rather than by enumerating dead shapes;
 *   • `useCoalescedRefresh` must be IMPORTED from the module, so a same-named local helper cannot
 *     satisfy the rule;
 *   • and the two window constants are counted repo-wide — exactly one declaration each — because a
 *     second copy of `150`/`600` in a component is how the two screens drift apart again.
 *
 * A FLOOR guards the walk itself: fewer call sites than the repo has ever had means the traversal
 * broke, and a guard whose reach is an accident prints the same word as one that works.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "apps/qr";
const MODULE_FILE = `${APP}/lib/echo-refresh.ts`;
const MODULE_SPECIFIERS = new Set(["@/lib/echo-refresh", "./echo-refresh", "../lib/echo-refresh"]);
const HOOK = "useCartRealtime";
const COALESCER = "useCoalescedRefresh";
const WINDOW_CONSTS = ["ECHO_COALESCE_MS", "ECHO_MAX_WAIT_MS"];
/** The consumers that exist today. A walk that finds fewer than this has broken, not improved. */
const MIN_CALL_SITES = 2;

const problems = [];
const fail = (m) => problems.push(m);

/** Every source file under apps/qr — RECURSIVELY (readdirSync is not). */
function sources(dir, out = []) {
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    if (entry === "node_modules" || entry === ".next") continue;
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) sources(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

const parse = (rel) =>
  ts.createSourceFile(
    rel,
    readFileSync(path.join(ROOT, rel), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

/** ⚠️ `ts.forEachChild` ABORTS on a truthy return — the visitor must return nothing. */
function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (c) => {
    walk(c, visit);
  });
}

const isCallTo = (node, name) =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;

/** Top-level `const x = …` initializers in a file, by name. */
function declarations(src) {
  const byName = new Map();
  walk(src, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer)
      byName.set(n.name.text, n.initializer);
  });
  return byName;
}

/** Does this file import `useCoalescedRefresh` from the module that defines it? */
function importsCoalescer(src) {
  let found = false;
  walk(src, (n) => {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier)) return;
    if (!MODULE_SPECIFIERS.has(n.moduleSpecifier.text)) return;
    const bindings = n.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return;
    for (const el of bindings.elements) {
      if ((el.propertyName ?? el.name).text === COALESCER) found = true;
    }
  });
  return found;
}

/** Names bound in this file to a `useCoalescedRefresh(...)` call. */
function coalescerBindings(decls) {
  const names = new Set();
  for (const [name, init] of decls) if (isCallTo(init, COALESCER)) names.add(name);
  return names;
}

/** A function body containing a DIRECT, unconditional call to one of `names`. */
function callsDirectly(fn, names) {
  if (!fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) return false;
  const body = fn.body;
  if (!ts.isBlock(body)) {
    // A concise arrow body IS the whole behaviour, so a bare `() => schedule()` qualifies.
    return (
      ts.isCallExpression(body) &&
      ts.isIdentifier(body.expression) &&
      names.has(body.expression.text)
    );
  }
  return body.statements.some(
    (st) =>
      ts.isExpressionStatement(st) &&
      ts.isCallExpression(st.expression) &&
      ts.isIdentifier(st.expression.expression) &&
      names.has(st.expression.expression.text),
  );
}

// ── 1. every call site routes through the shared coalescer ──────────────────────────────────────
const files = sources(APP);
let callSites = 0;

for (const rel of files) {
  const src = parse(rel);
  const calls = [];
  walk(src, (n) => {
    if (isCallTo(n, HOOK)) calls.push(n);
  });
  if (calls.length === 0) continue;
  callSites += calls.length;

  const decls = declarations(src);
  const names = coalescerBindings(decls);
  const imported = importsCoalescer(src);

  for (const call of calls) {
    const where = `${rel}:${src.getLineAndCharacterOfPosition(call.getStart()).line + 1}`;
    const arg = call.arguments[2];
    if (!arg) {
      fail(`${where}: ${HOOK} called with no onChange argument.`);
      continue;
    }
    if (!imported) {
      fail(
        `${where}: ${HOOK} consumer does not import ${COALESCER} from the module that defines it — ` +
          `every echo must be coalesced (M193), and a same-named local helper does not count.`,
      );
      continue;
    }
    if (ts.isIdentifier(arg)) {
      if (names.has(arg.text)) continue; // the coalescer, passed straight through
      const init = decls.get(arg.text);
      if (init && isCallTo(init, "useCallback") && callsDirectly(init.arguments[0], names))
        continue;
      fail(
        `${where}: onChange \`${arg.text}\` does not schedule through ${COALESCER}. ` +
          `Its declaration must be \`${COALESCER}(refresh)\`, or a \`useCallback\` whose body calls ` +
          `such a binding as a direct, unconditional statement.`,
      );
      continue;
    }
    if (callsDirectly(arg, names)) continue;
    fail(
      `${where}: onChange is an inline callback that does not call a ${COALESCER} binding as a ` +
        `direct, unconditional statement — one \`getCartView\` chain per row event is M193.`,
    );
  }
}

if (callSites < MIN_CALL_SITES)
  fail(
    `found ${callSites} \`${HOOK}\` call site(s) under ${APP}, expected at least ${MIN_CALL_SITES} — ` +
      `the walk is broken, not the code.`,
  );

// ── 2. the window is declared exactly once ──────────────────────────────────────────────────────
for (const constName of WINDOW_CONSTS) {
  const sites = [];
  for (const rel of files) {
    const src = parse(rel);
    walk(src, (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === constName)
        sites.push(`${rel}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
    });
  }
  if (sites.length !== 1 || !sites[0].startsWith(`${MODULE_FILE}:`))
    fail(
      `\`${constName}\` must be declared exactly once, in ${MODULE_FILE} — found ${sites.length}: ` +
        `${sites.join(", ") || "none"}. Two copies of the window is how the screens drift apart.`,
    );
}

if (problems.length) {
  console.error("✗ check:echo-coalesce\n");
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    `\n  The coalescer lives in ${MODULE_FILE}; see its docblock and OPEN-ITEMS M193.\n`,
  );
  process.exit(1);
}
console.log(`✓ check:echo-coalesce — ${callSites} ${HOOK} call sites, all coalesced; one window`);
