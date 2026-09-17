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
 * ## Four more from Codex round 2, all the same shape again
 *
 *   7. **The binding's MUTABILITY was ignored.** `let schedule = useCoalescedRefresh(refresh);
 *      schedule = refresh;` typechecks — the reader is assignable to the void-returning callback —
 *      and a resolver reading only the INITIALIZER approves it. `const` is now required.
 *   8. **`callsDirectly` returned at the scheduling statement**, so
 *      `{ scheduleEchoRefresh(); void refresh(); }` passed while every row event still started its
 *      own read, with the coalesced one merely added beside it. The whole callback is scanned now,
 *      and any other path to the reader fails.
 *   9. **`useCallback` was matched by PROPERTY NAME**, so `helpers.useCallback(…)` on any object
 *      with that key was accepted while the value actually passed on was the raw reader. It resolves
 *      to REACT's export now, bare or qualified — the hook-by-name mistake in a third costume.
 *  10. **A NAMED argument was taken as sufficient**, so `useCoalescedRefresh(noop)` reported a
 *      coalesced consumer whose events invoked nothing. The argument must now REACH `getCartView`,
 *      transitively through local bindings — one hop is not enough, because `Checkout.refresh` calls
 *      the reader itself while `TableCartProvider.refresh` goes through `readView`.
 *
 * ## Four more from Codex round 3 — and two it cannot close
 *
 *  11. **A NAME SET is not a binding.** Scheduler names collected at the `useCartRealtime` call site
 *      exempted every call sharing one, so a handler could shadow it (`const schedule = refresh;`
 *      inside the callback) and the raw reader was waved through as the coalesced path. Every
 *      candidate call now resolves at its OWN lexical position; the set is gone.
 *  12. **The identifier filter ran BEFORE the imported-binding check** in `directReaderCalls`, so a
 *      namespace-qualified `cart.getCartView(id)` beside the schedule was discarded unexamined.
 *  13. **An import can be SHADOWED.** A local `const useCoalescedRefresh = (fn) => fn` made the
 *      "coalescer" an identity function while a name-only check still credited the import.
 *  14. **A generator is not eager.** `function* onChange() { schedule(); }` typechecks where a void
 *      callback is expected; calling it only builds an iterator, so the body never runs while the
 *      statement scan happily finds the call.
 *
 * ⚠️ TWO ARE FILED, NOT FIXED — **OPEN-ITEMS M226**, under the round-3 rule. `reachesReader` walks
 * the whole subtree, so a reader inside a never-invoked nested helper still counts; and
 * `exitsCallback` matches literal `return`/`throw`, so a preceding call typed `never` (or an
 * infinite loop) reads as exit-free. The second needs the TYPE CHECKER, which this guard
 * deliberately does not load — it runs in the fast lane in ~1.7 s over 679 files. Both are
 * adversarial-only shapes; neither arises from an ordinary refactor.
 *
 * ## Three more from Codex round 4
 *
 *  15. **Parameters are bindings.** `resolveBinding` scanned only source/block statements, so a
 *      component taking a same-named PARAMETER shadowed the import for its whole body — in a file
 *      that otherwise imports it for real — and `shadowed()` said no. Destructured parameters bind
 *      just as hard, so both forms are checked.
 *  16. **An immutable ALIAS is still the function.** `const refreshNow = refresh;` binds an
 *      identifier, not a function literal, so `resolveFunction` returned null and a handler calling
 *      `refreshNow()` beside the schedule read on every event with nothing flagged. `const` chains
 *      are followed now; a `let` is not, because finding #7 is that a `let` can be reassigned.
 *  17. **A changelog number that contradicts the measured one** (P3) — the entry said "four new
 *      mutants, 683 → 687" after a fifth was added and every other file had been refreshed to 688.
 *      The "never transcribe a number" rule applies to prose about the guard as much as to the
 *      guard, and `check:docs` cannot see a total inside a sentence.
 *
 * ## The cases this guard has been watched against (keep this list WITH the code)
 *
 * 28 cases, 0 unexpected, re-proved on every round.
 *
 * RED — the per-event arrow restored verbatim · a dead `if (false) schedule()` · a commented-out
 * call · the provider's handler no longer scheduling · the provider scheduling behind a condition ·
 * a second `ECHO_COALESCE_MS` declaration · the module renaming a constant · `useCartRealtime as
 * useRealtime` · `import * as rt` → `rt.useCartRealtime` · a deep relative import · an early
 * `return` before the call · a `throw` before the call · two same-named bindings in one file, one
 * correct · `useCoalescedRefresh(() => {})` · a `let` scheduler reassigned to the raw reader · a
 * handler that schedules AND reads directly · a look-alike `helpers.useCallback` · a coalescer
 * wrapping a named no-op · a handler shadowing the scheduler name with the raw reader · a
 * namespace-qualified `getCartView` beside the schedule · a locally-shadowed `useCoalescedRefresh` ·
 * a generator handler · a PARAMETER shadowing the imported coalescer (named and destructured) · an
 * identifier alias of the reader called beside the schedule · the walk floor.
 *
 * GREEN — these must keep passing, or the guard gets disabled: an aliased coalescer import · a
 * non-exiting `if` before the call · a nested arrow's own `return` · `void schedule()` ·
 * `React.useCallback` · a hoisted `function` handler · the reader reached through one local hop ·
 * a handler doing non-reader work beside scheduling · a namespace-imported reader, correctly
 * coalesced · a coalescer wrapping an immutable alias of the reader · an unrelated parameter whose
 * name collides with nothing.
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
const CART_MODULE = `${APP}/lib/cart`;
/** The ONE server-authoritative cart read. A coalescer that does not reach this refreshes nothing. */
const READER = "getCartView";
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
function importedAs(src, matches, exported) {
  const names = new Set();
  const namespaces = new Set();
  walk(src, (n) => {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier)) return;
    if (!matches(n.moduleSpecifier.text)) return;
    // `import React from "react"` binds the namespace object too, so `React.useCallback` resolves.
    if (n.importClause?.name) namespaces.add(n.importClause.name.text);
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

/** `importedAs` for a module identified by PATH (`@/…` or any relative depth). */
const importedFrom = (src, rel, moduleRel, exported) =>
  importedAs(src, (t) => resolveSpec(rel, t) === moduleRel, exported);

/** Is `node` a call to one of `binding.names`, or to `ns.<exported>` for one of its namespaces? */
function isCallToBinding(node, binding, exported) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  // ⚠️ AN IMPORT CAN BE SHADOWED (Codex round 3 on #287). `const useCoalescedRefresh = (fn) => fn`
  // inside a component makes `useCoalescedRefresh(refresh)` an identity function — the raw reader,
  // called per event — while a name-only check still attributes it to the import. `resolveBinding`
  // finds local `const`/`function` declarations and never the import itself, so a hit here means the
  // name has been taken over locally.
  const shadowed = (name) => resolveBinding(node, name) !== null;
  if (ts.isIdentifier(callee)) return binding.names.has(callee.text) && !shadowed(callee.text);
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    binding.namespaces.has(callee.expression.text) &&
    !shadowed(callee.expression.text) &&
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
    // ⚠️ PARAMETERS ARE BINDINGS TOO (Codex round 4 on #287). A component taking a same-named
    // parameter shadows the import for its whole body, in a file that otherwise imports it for real
    // — so a statements-only walk reported "not shadowed" and credited the call to the import.
    // Destructured parameters (`{ refresh }`) bind just as hard as named ones.
    const params = ts.isFunctionLike(scope) ? (scope.parameters ?? []) : [];
    for (const prm of params) {
      if (ts.isIdentifier(prm.name)) {
        if (prm.name.text === name) return { kind: "param" };
      } else if (ts.isObjectBindingPattern(prm.name) || ts.isArrayBindingPattern(prm.name)) {
        for (const el of prm.name.elements) {
          if (ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === name)
            return { kind: "param" };
        }
      }
    }
    const statements = ts.isSourceFile(scope)
      ? scope.statements
      : ts.isBlock(scope) || ts.isModuleBlock(scope)
        ? scope.statements
        : null;
    if (!statements) continue;
    for (const st of statements) {
      if (ts.isVariableStatement(st)) {
        const isConst = !!(st.declarationList.flags & ts.NodeFlags.Const);
        for (const d of st.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer)
            return { kind: "value", init: d.initializer, isConst };
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

/**
 * `useCallback(...)` resolved to REACT's export — bare or qualified.
 *
 * ⚠️ Matching the property NAME alone accepted `helpers.useCallback(() => schedule())` from any
 * object that happens to have that key, while the value actually handed to `useCartRealtime` was the
 * raw reader (Codex round 2 on #287). Same class as matching the hook by name.
 */
const isUseCallback = (e, react) => isCallToBinding(e, react, "useCallback");

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

/** The function a name is bound to, as seen from `from`: a declaration, an arrow, or a useCallback. */
function resolveFunction(from, name, react, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const b = resolveBinding(from, name);
  if (!b || b.kind === "param") return null;
  // A generator's body does NOT run on call — invoking it only builds an iterator (Codex round 3).
  if (b.kind === "function") return b.fn.asteriskToken ? null : b.fn;
  const init = unwrap(b.init);
  // ⚠️ FOLLOW AN IMMUTABLE ALIAS (Codex round 4 on #287). `const refreshNow = refresh;` bound an
  // IDENTIFIER, not a function literal, so this returned null and `directReaderCalls` concluded the
  // handler had no path to the reader — while `refreshNow()` beside the schedule read on every
  // event. Only `const` chains are followed: a `let` can be reassigned, which is finding #7's rule.
  if (ts.isIdentifier(init))
    return b.isConst ? resolveFunction(init, init.text, react, seen) : null;
  const eager = (fn) =>
    fn && (ts.isArrowFunction(fn) || (ts.isFunctionExpression(fn) && !fn.asteriskToken))
      ? fn
      : null;
  if (isUseCallback(init, react)) return eager(init.arguments[0]);
  return eager(init);
}

/**
 * Does this function reach the ONE server-authoritative cart read, directly or through local
 * bindings in the same file?
 *
 * ⚠️ WITHOUT THIS THE GUARD PROVED NOTHING ABOUT THE WORK (Codex round 2 on #287): requiring the
 * coalescer's argument to be a NAMED binding admitted `const noop = () => {}` just as happily as
 * `refresh`, so the script reported a coalesced consumer whose realtime events — the subscribe
 * self-heal included — invoked nothing at all. One hop is not enough either: `Checkout.refresh`
 * calls `getCartView` itself, while `TableCartProvider.refresh` reaches it through `readView`. So
 * the walk follows local function bindings transitively, guarded by a visited set.
 */
function reachesReader(fn, ctx, seen = new Set()) {
  if (!fn || !fn.body || seen.has(fn.pos)) return false;
  seen.add(fn.pos);
  let found = false;
  walk(fn.body, (n) => {
    if (found || !ts.isCallExpression(n)) return;
    if (isCallToBinding(n, ctx.reader, READER)) {
      found = true;
      return;
    }
    if (!ts.isIdentifier(n.expression)) return;
    const next = resolveFunction(n, n.expression.text, ctx.react);
    if (next && reachesReader(next, ctx, seen)) found = true;
  });
  return found;
}

/** Every call in this callback that reaches the reader WITHOUT going through the coalescer. */
function directReaderCalls(fn, ctx) {
  const hits = [];
  if (!fn?.body) return hits;
  walk(fn.body, (n) => {
    if (!ts.isCallExpression(n)) return;
    if (ctx.isSchedulerCall(n)) return; // that is the coalesced path
    // ⚠️ THE IMPORTED-BINDING CHECK COMES FIRST (Codex round 3 on #287). Filtering to identifier
    // callees before this discarded `cart.getCartView(id)` — a namespace import — so a handler could
    // schedule AND read immediately through the qualified form.
    if (isCallToBinding(n, ctx.reader, READER)) {
      hits.push(n.expression.getText());
      return;
    }
    if (!ts.isIdentifier(n.expression)) return;
    const target = resolveFunction(n, n.expression.text, ctx.react);
    if (target && reachesReader(target, ctx)) hits.push(n.expression.text);
  });
  return hits;
}

/**
 * A function body that calls one of `names` as a top-level statement REACHED ON EVERY INVOCATION —
 * i.e. no statement before it can `return` or `throw` out of the callback.
 */
function callsDirectly(fn, ctx) {
  if (
    !fn ||
    (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn) && !ts.isFunctionDeclaration(fn))
  )
    return false;
  // ⚠️ A GENERATOR IS NOT EAGER (Codex round 3 on #287). `function* onChange() { schedule(); }`
  // typechecks where a void callback is expected — calling it only builds an iterator, so the body
  // never runs and nothing is ever scheduled, while the statement scan below finds the call.
  if (fn.asteriskToken) return false;
  const body = fn.body;
  if (!body) return false;
  // `void schedule()` is this repo's fire-and-forget idiom — and was literally the line this slice
  // replaced — so refusing it would refuse the shape the guard is most likely to meet.
  const isSchedule = (e) => {
    const c = unwrap(e);
    return ts.isCallExpression(c) && ctx.isSchedulerCall(c);
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
function isCoalescerCall(binding, ctx) {
  if (!binding || binding.kind !== "value") return false;
  // ⚠️ `const`, not `let` (Codex round 2 on #287). `let schedule = useCoalescedRefresh(refresh);
  // schedule = refresh;` typechecks — the reader is assignable to the void-returning callback — and a
  // resolver that reads only the INITIALIZER approves it while every event reads immediately again.
  if (!binding.isConst) return false;
  const call = unwrap(binding.init);
  if (!isCallToBinding(call, ctx.coalescer, COALESCER)) return false;
  const arg = call.arguments[0];
  if (!arg || !ts.isIdentifier(arg)) return false;
  // …and the thing it wraps must actually re-read the cart.
  return reachesReader(resolveFunction(arg, arg.text, ctx.react), ctx);
}

// ── every file is parsed ONCE, and both sections read that one AST ──────────────────────────────
const windowFiles = [...new Set(WINDOW_SCAN_ROOTS.flatMap((d) => sources(d, [], /\.(tsx?|mjs)$/)))];
const parsed = new Map(windowFiles.map((rel) => [rel, parse(rel)]));

// ── 1. every call site routes through the shared coalescer ──────────────────────────────────────
let callSites = 0;

for (const rel of windowFiles) {
  if (!rel.startsWith(`${APP}/`)) continue;
  const src = parsed.get(rel);
  const hook = importedFrom(src, rel, REALTIME_MODULE, HOOK);
  if (hook.names.size === 0 && hook.namespaces.size === 0) continue;

  const calls = [];
  walk(src, (n) => {
    if (isCallToBinding(n, hook, HOOK)) calls.push(n);
  });
  if (calls.length === 0) continue;
  callSites += calls.length;

  const ctx = {
    coalescer: importedFrom(src, rel, COALESCER_MODULE, COALESCER),
    reader: importedFrom(src, rel, CART_MODULE, READER),
    react: importedAs(src, (t) => t === "react", "useCallback"),
  };
  const coalescer = ctx.coalescer;

  /** Is `name`, as seen FROM `from`, a `const` bound to `useCoalescedRefresh(<the cart reader>)`? */
  const isScheduler = (from, name) => isCoalescerCall(resolveBinding(from, name), ctx);

  /**
   * Is THIS call expression a call to a scheduler, resolved at its OWN lexical position?
   *
   * ⚠️ A NAME SET IS NOT A BINDING (Codex round 3 on #287). Collecting scheduler NAMES at the
   * `useCartRealtime` call site and then exempting every call sharing one of those names let a
   * handler shadow it — `const schedule = refresh;` inside the callback — and the raw reader was
   * waved through as the coalesced path. Resolving per call node removes the set entirely.
   */
  ctx.isSchedulerCall = (n) =>
    ts.isCallExpression(n) && ts.isIdentifier(n.expression) && isScheduler(n, n.expression.text);

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
    /**
     * The handler schedules AND is free of any other path to the reader.
     *
     * ⚠️ The second half is Codex round 2 on #287: `callsDirectly` returns at the scheduling
     * statement, so `{ scheduleEchoRefresh(); void refresh(); }` passed while every row event still
     * started its own `getCartView` chain — the defect, with a coalesced read added beside it.
     */
    const handlerOk = (fn) => {
      if (!callsDirectly(fn, ctx)) return false;
      const direct = directReaderCalls(fn, ctx);
      if (direct.length === 0) return true;
      fail(
        `${where}: onChange schedules through ${COALESCER} but ALSO calls ` +
          `\`${[...new Set(direct)].join("`, `")}\`, which reaches \`${READER}\` directly — so every ` +
          `row event still starts its own read and the coalesced one is added beside it (M193).`,
      );
      return "reported";
    };

    if (ts.isIdentifier(arg)) {
      if (isScheduler(arg, arg.text)) continue; // the coalescer, passed straight through
      const fn = resolveFunction(arg, arg.text, ctx.react);
      const verdict = fn && handlerOk(fn);
      if (verdict === true || verdict === "reported") continue;
      fail(
        `${where}: onChange \`${arg.text}\` does not schedule through ${COALESCER}. ` +
          `Its declaration must be \`${COALESCER}(refresh)\` (a NAMED argument), or a callback whose ` +
          `body calls such a binding as a top-level statement reached before any \`return\`/\`throw\`.`,
      );
      continue;
    }
    const verdict = handlerOk(arg);
    if (verdict === true || verdict === "reported") continue;
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
