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
 *   • the call sites are CallExpressions whose callee is a LOCAL BINDING of `useCartRealtime`,
 *     found by walking the AST of every `.ts`/`.tsx` under `apps/qr` — never by reading a list
 *     maintained here, which is how `check-child-freeze`'s first draft missed half its subjects;
 *   • the third argument is resolved to its DECLARATION in the same file, and that declaration must
 *     be a call to a local binding of `useCoalescedRefresh`, or a `useCallback` wrapping one;
 *   • inside a wrapping callback the scheduling call must be a top-level `ExpressionStatement` that
 *     is UNCONDITIONALLY REACHED — no preceding statement may transfer control out of the callback —
 *     so `if (…)`, `&&`, a ternary, any nesting AND an early `return`/`throw` are all excluded;
 *   • and the two window constants are counted repo-wide — exactly one declaration each — because a
 *     second copy of `150`/`600` in a component is how the two screens drift apart again.
 *
 * A FLOOR guards the walk itself: fewer call sites than the repo has ever had means the traversal
 * broke, and a guard whose reach is an accident prints the same word as one that works.
 *
 * ## Two holes Codex round 1 on #287 found — in this guard, not in the code it guards
 *
 * Both were the guard claiming a property it did not establish, which is exactly why the rule says
 * to aim red-first at the MATCHER and not only at the code:
 *
 *   1. **Name-only call-site matching.** `import { useCartRealtime as useRealtime }` in a new
 *      consumer was invisible, and the two unaliased sites kept `MIN_CALL_SITES` satisfied — so the
 *      guard stayed green over a consumer re-reading per event. Both hook names are now resolved
 *      from the IMPORT, alias and `import * as ns` included, and the specifier is resolved as a PATH
 *      (`@/…` and any relative depth) rather than matched against a hand-listed set of spellings.
 *   2. **`some()` over the statement list is not liveness.** `if (irrelevant) return;` before the
 *      scheduling call still left that call a top-level `ExpressionStatement`, so the callback
 *      passed while whole classes of event skipped the refresh. Reachability is now asserted: every
 *      statement BEFORE the call must be exit-free (no `return`/`throw` in its subtree, not
 *      descending into nested functions, whose returns exit THEM rather than the callback).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "apps/qr";
const MODULE_FILE = `${APP}/lib/echo-refresh.ts`;
/** Module paths WITHOUT extension, as `resolveSpec` returns them. */
const COALESCER_MODULE = `${APP}/lib/echo-refresh`;
const REALTIME_MODULE = `${APP}/lib/realtime`;
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

/**
 * A module specifier resolved to its repo-relative path, extension stripped — `null` for a bare
 * package. Resolving the PATH is what makes `../../lib/realtime` and `@/lib/realtime` the same
 * module; the first draft compared the specifier against three hand-written spellings, so a fourth
 * was simply not the module as far as this guard was concerned.
 */
function resolveSpec(fromRel, spec) {
  let out;
  if (spec.startsWith("@/")) out = `${APP}/${spec.slice(2)}`;
  else if (spec.startsWith("."))
    out = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  else return null;
  return out.replace(/\.(tsx?|jsx?)$/, "");
}

/**
 * Every way this file can name `exported` from `moduleRel`: the local names of its named imports
 * (alias included) and, for `import * as ns`, the namespaces through which `ns.exported` reaches it.
 */
function importedAs(src, rel, moduleRel, exported) {
  const names = new Set();
  const namespaces = new Set();
  walk(src, (n) => {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier)) return;
    if (resolveSpec(rel, n.moduleSpecifier.text) !== moduleRel) return;
    const bindings = n.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        if ((el.propertyName ?? el.name).text === exported) names.add(el.name.text);
      }
    }
  });
  return { names, namespaces };
}

/** Is `node` a call to one of `binding.names`, or to `ns.<exported>` for one of its namespaces? */
function isCallToBinding(node, binding, exported) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return binding.names.has(callee.text);
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    binding.namespaces.has(callee.expression.text) &&
    callee.name.text === exported
  );
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

/** Names bound in this file to a `useCoalescedRefresh(...)` call, however that hook was imported. */
function coalescerBindings(decls, coalescer) {
  const names = new Set();
  for (const [name, init] of decls)
    if (isCallToBinding(init, coalescer, COALESCER)) names.add(name);
  return names;
}

/**
 * Can this statement transfer control OUT of the callback it sits in? `return` and `throw` only —
 * and deliberately NOT descending into nested function-like nodes, whose `return` exits THEM, not
 * the callback. This is what turns "the call is a top-level statement" into "the call is reached",
 * which `some()` alone never established (Codex round 1 on #287).
 */
function exitsCallback(node) {
  if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) return true;
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isAccessor(n) ||
      ts.isConstructorDeclaration(n) ||
      ts.isClassLike(n)
    )
      return;
    if (ts.isReturnStatement(n) || ts.isThrowStatement(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  ts.forEachChild(node, (c) => {
    visit(c);
  });
  return found;
}

/**
 * A function body that calls one of `names` as a top-level statement REACHED ON EVERY INVOCATION —
 * i.e. no statement before it can `return` or `throw` out of the callback.
 */
function callsDirectly(fn, names) {
  if (!fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) return false;
  const body = fn.body;
  const isSchedule = (e) =>
    ts.isCallExpression(e) && ts.isIdentifier(e.expression) && names.has(e.expression.text);
  // A concise arrow body IS the whole behaviour, so a bare `() => schedule()` qualifies.
  if (!ts.isBlock(body)) return isSchedule(body);
  for (const st of body.statements) {
    if (ts.isExpressionStatement(st) && isSchedule(st.expression)) return true;
    // Reached only if nothing before the call could have left the callback.
    if (exitsCallback(st)) return false;
  }
  return false;
}

// ── 1. every call site routes through the shared coalescer ──────────────────────────────────────
const files = sources(APP);
let callSites = 0;

for (const rel of files) {
  const src = parse(rel);
  const hook = importedAs(src, rel, REALTIME_MODULE, HOOK);
  if (hook.names.size === 0 && hook.namespaces.size === 0) continue;

  const calls = [];
  walk(src, (n) => {
    if (isCallToBinding(n, hook, HOOK)) calls.push(n);
  });
  if (calls.length === 0) continue;
  callSites += calls.length;

  const decls = declarations(src);
  const coalescer = importedAs(src, rel, COALESCER_MODULE, COALESCER);
  const names = coalescerBindings(decls, coalescer);

  for (const call of calls) {
    const where = `${rel}:${src.getLineAndCharacterOfPosition(call.getStart()).line + 1}`;
    const arg = call.arguments[2];
    if (!arg) {
      fail(`${where}: ${HOOK} called with no onChange argument.`);
      continue;
    }
    if (names.size === 0) {
      fail(
        `${where}: ${HOOK} consumer has no \`${COALESCER}(…)\` binding imported from ` +
          `${MODULE_FILE} — every echo must be coalesced (M193), and a same-named local helper ` +
          `does not count.`,
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
          `such a binding as a top-level statement reached before any \`return\`/\`throw\`.`,
      );
      continue;
    }
    if (callsDirectly(arg, names)) continue;
    fail(
      `${where}: onChange is an inline callback that does not call a ${COALESCER} binding as a ` +
        `top-level statement reached before any \`return\`/\`throw\` — an event that skips the ` +
        `refresh, or one \`getCartView\` chain per row event, is M193.`,
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
