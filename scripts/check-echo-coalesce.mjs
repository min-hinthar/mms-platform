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
 *
 * ## Four more the blind adversarial pass on #287 found, after those two were fixed
 *
 *   3. **Whole-file `declarations()` was LAST-WINS, so one correct binding laundered every
 *      same-named wrong one.** Two components in one file, each with its own `const onEcho`: the
 *      later (correct) one overwrote the earlier (defective) one in the map, the defective call site
 *      hit `names.has(arg.text)` and was waved through, and `MIN_CALL_SITES` was still satisfied.
 *      That is the repo's own **uniqueness ≠ liveness** rule broken by the guard written to enforce
 *      it. Bindings now resolve LEXICALLY from the call site outward.
 *   4. **The coalescer's ARGUMENT was never read**, so `useCoalescedRefresh(() => {})` passed while
 *      no re-read could ever happen. It must now be a named binding.
 *   5. **`void schedule();` was refused** — a `VoidExpression`, not a `CallExpression`. That is this
 *      repo's standard fire-and-forget idiom and was literally the line this slice replaced, so the
 *      guard refused the shape it is most likely to meet. `void`/`await` are unwrapped now, and
 *      `React.useCallback`, a hoisted `function` declaration and an `as` cast are all accepted.
 *   6. **"repo-wide" was `apps/qr` only.** The window scan now covers `packages/` and `scripts/`
 *      too. ⚠️ It matches the two NAMES; it cannot see `const ECHO_WINDOW_MS = 150` or a bare
 *      `setTimeout(fn, 150)`, and this docblock no longer claims otherwise.
 *
 * ## The evasions this guard has been watched RED against (keep this list with the code)
 *
 * The per-event arrow restored verbatim · a dead `if (false) schedule()` · a commented-out call ·
 * the provider's handler no longer scheduling · the provider scheduling behind a condition · a
 * second `ECHO_COALESCE_MS` declaration · the module renaming a constant · `useCartRealtime as
 * useRealtime` · `import * as rt` → `rt.useCartRealtime` · a deep relative import · an early
 * `return` before the call · a `throw` before the call · two same-named bindings in one file, one
 * correct · `useCoalescedRefresh(() => {})` · the walk floor.
 * Controls held GREEN: an aliased coalescer import · a non-exiting `if` before the call · a nested
 * arrow's own `return` · `void schedule()` · `React.useCallback` · a hoisted `function` handler.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "apps/qr";
/** The window constants must be unique across everything that could hold a second copy. */
const WINDOW_SCAN_ROOTS = [APP, "packages", "scripts"];
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
function sources(dir, out = [], ext = /\.tsx?$/) {
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    if (entry === "node_modules" || entry === ".next") continue;
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) sources(rel, out, ext);
    else if (ext.test(entry)) out.push(rel);
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

/**
 * The initializer bound to `name` as seen FROM `node`, resolved LEXICALLY: walk outward and take the
 * first enclosing scope that declares it. A whole-file map is last-wins, which lets one correct
 * binding launder every same-named wrong one in the same file (blind pass on #287) — the repo's own
 * "uniqueness ≠ liveness" rule, broken by the guard written to enforce it.
 *
 * Returns `{ kind: "value", init }` for `const x = …`, `{ kind: "function", fn }` for a hoisted
 * `function x(){}`, or `null`.
 */
function resolveBinding(node, name) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    const statements = ts.isSourceFile(scope)
      ? scope.statements
      : ts.isBlock(scope) || ts.isModuleBlock(scope)
        ? scope.statements
        : null;
    if (!statements) continue;
    for (const st of statements) {
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer)
            return { kind: "value", init: d.initializer };
        }
      }
      if (ts.isFunctionDeclaration(st) && st.name?.text === name)
        return { kind: "function", fn: st };
    }
  }
  return null;
}

/** Strip the wrappers that do not change what is called: `void f()`, `await f()`, `f() as T`. */
function unwrap(e) {
  let out = e;
  for (;;) {
    if (ts.isVoidExpression(out) || ts.isAwaitExpression(out)) out = out.expression;
    else if (ts.isAsExpression(out) || ts.isParenthesizedExpression(out)) out = out.expression;
    else if (ts.isNonNullExpression(out)) out = out.expression;
    else return out;
  }
}

/** `useCallback(...)` or `React.useCallback(...)`. */
function isUseCallback(e) {
  if (!ts.isCallExpression(e)) return false;
  const c = e.expression;
  return (
    (ts.isIdentifier(c) && c.text === "useCallback") ||
    (ts.isPropertyAccessExpression(c) && c.name.text === "useCallback")
  );
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
  if (
    !fn ||
    (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn) && !ts.isFunctionDeclaration(fn))
  )
    return false;
  const body = fn.body;
  if (!body) return false;
  // `void schedule()` is this repo's fire-and-forget idiom — and was literally the line this slice
  // replaced — so refusing it would refuse the shape the guard is most likely to meet.
  const isSchedule = (e) => {
    const c = unwrap(e);
    return ts.isCallExpression(c) && ts.isIdentifier(c.expression) && names.has(c.expression.text);
  };
  // A concise arrow body IS the whole behaviour, so a bare `() => schedule()` qualifies.
  if (!ts.isBlock(body)) return isSchedule(body);
  for (const st of body.statements) {
    if (ts.isExpressionStatement(st) && isSchedule(st.expression)) return true;
    // Reached only if nothing before the call could have left the callback.
    if (exitsCallback(st)) return false;
  }
  return false;
}

/**
 * Is this initializer a `useCoalescedRefresh(<named binding>)` call?
 *
 * ⚠️ THE ARGUMENT CHECK IS THE POINT (blind pass on #287). Without it
 * `useCoalescedRefresh(() => {})` satisfied every other rule while no re-read could ever happen,
 * and the script still printed "all coalesced". Requiring a NAMED binding is the cheap sound bar;
 * proving the callee actually re-reads the cart would need a type checker.
 */
function isCoalescerCall(init, coalescer) {
  if (!init) return false;
  const call = unwrap(init);
  if (!isCallToBinding(call, coalescer, COALESCER)) return false;
  const arg = call.arguments[0];
  return !!arg && ts.isIdentifier(arg);
}

// ── every file is parsed ONCE, and both sections read that one AST ──────────────────────────────
const windowFiles = [...new Set(WINDOW_SCAN_ROOTS.flatMap((d) => sources(d, [], /\.(tsx?|mjs)$/)))];
const parsed = new Map(windowFiles.map((rel) => [rel, parse(rel)]));

// ── 1. every call site routes through the shared coalescer ──────────────────────────────────────
let callSites = 0;

for (const rel of windowFiles) {
  if (!rel.startsWith(`${APP}/`)) continue;
  const src = parsed.get(rel);
  const hook = importedAs(src, rel, REALTIME_MODULE, HOOK);
  if (hook.names.size === 0 && hook.namespaces.size === 0) continue;

  const calls = [];
  walk(src, (n) => {
    if (isCallToBinding(n, hook, HOOK)) calls.push(n);
  });
  if (calls.length === 0) continue;
  callSites += calls.length;

  const coalescer = importedAs(src, rel, COALESCER_MODULE, COALESCER);

  /** Is `name`, as seen FROM `from`, bound to a `useCoalescedRefresh(<named binding>)` call? */
  const isScheduler = (from, name) => {
    const b = resolveBinding(from, name);
    return b?.kind === "value" && isCoalescerCall(b.init, coalescer);
  };

  for (const call of calls) {
    const where = `${rel}:${src.getLineAndCharacterOfPosition(call.getStart()).line + 1}`;
    const arg = call.arguments[2];
    if (!arg) {
      fail(`${where}: ${HOOK} called with no onChange argument.`);
      continue;
    }
    if (coalescer.names.size === 0 && coalescer.namespaces.size === 0) {
      fail(
        `${where}: ${HOOK} consumer does not import \`${COALESCER}\` from ${MODULE_FILE} — ` +
          `every echo must be coalesced (M193), and a same-named local helper does not count.`,
      );
      continue;
    }

    // Scheduler names as seen FROM THIS CALL SITE, resolved lexically — never a whole-file map.
    // Last-wins lets one correct binding launder a same-named defective one elsewhere in the file
    // (blind pass on #287), which is the repo's own "uniqueness ≠ liveness" rule broken by the
    // guard written to enforce it.
    const names = new Set();
    walk(src, (n) => {
      if (ts.isIdentifier(n) && !names.has(n.text) && isScheduler(call, n.text)) names.add(n.text);
    });

    if (ts.isIdentifier(arg)) {
      if (isScheduler(arg, arg.text)) continue; // the coalescer, passed straight through
      const b = resolveBinding(arg, arg.text);
      if (b?.kind === "function" && callsDirectly(b.fn, names)) continue;
      if (b?.kind === "value") {
        const init = unwrap(b.init);
        if (isUseCallback(init) && callsDirectly(init.arguments[0], names)) continue;
      }
      fail(
        `${where}: onChange \`${arg.text}\` does not schedule through ${COALESCER}. ` +
          `Its declaration must be \`${COALESCER}(refresh)\` (a NAMED argument), or a callback whose ` +
          `body calls such a binding as a top-level statement reached before any \`return\`/\`throw\`.`,
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
  for (const [rel, src] of parsed) {
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
console.log(
  `✓ check:echo-coalesce — ${callSites} ${HOOK} call sites, all coalesced; one window across ` +
    `${parsed.size} files in ${WINDOW_SCAN_ROOTS.join(", ")}`,
);
