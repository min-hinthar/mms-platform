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
 * ## Five more from Codex round 5 — four fixed, one filed
 *
 *  18. **The hook's CONTRACT, now mechanical.** `useCoalescedRefresh` keys its cleanup on the
 *      reader's identity (deliberately — see its docblock), so an UNMEMOIZED reader gets a new
 *      identity every render and any render between the last event and the timer firing discards the
 *      pending read with no replacement armed. `isStableReader` requires a `useCallback` result, a
 *      module-scope binding, or an immutable alias of one.
 *  19. **Mutability applies to the READER too.** `let refresh = () => getCartView(id); refresh = ()
 *      => {};` declared a reader and shipped a no-op — round 2 caught this for the SCHEDULER binding
 *      and the same check was simply missing on the other side.
 *  20. **A destructured LOCAL shadows as hard as a parameter.** `const { useCoalescedRefresh } =
 *      helpers;` was invisible, one line below the parameter fix that had just closed the same gap.
 *  21. **A parenthesized callee is the same call.** `(refresh)()` escaped THREE separate
 *      `ts.isIdentifier(n.expression)` tests; unwrapping in one of them was not enough, so the
 *      callee now resolves through a single `calleeIdent` helper used everywhere.
 *
 * ⚠️ A FIFTH IS FILED — **OPEN-ITEMS M226(c)**, and it is the PRODUCT module rather than the guard:
 * the burst deadline is measured with `Date.now()`, so a backward wall-clock jump mid-burst starves
 * the recovery read. `performance.now()` is the right clock; it needs its own mutant and a fake-timer
 * re-check, which is a slice rather than a line.
 *
 * ## Round 6: one more, and it is finding #16 on the OTHER side
 *
 *  22. **An ALIAS of the HOOK put a whole consumer out of REACH.** `const useRealtime =
 *      useCartRealtime;` — `hook.names` holds import-declared spellings only, so that call site was
 *      never COLLECTED, the walk never looked at its handler, and the two real sites kept
 *      `MIN_CALL_SITES` satisfied: green while a third consumer re-read per event. MEASURED, not
 *      argued — the pre-fix script printed "2 call sites, all coalesced" with the uncoalesced third
 *      one on disk. Round 4 closed exactly this for the READER (#16) and the hook side was missed.
 *      Aliases now resolve through `aliasesImported`, and its `loose` flag is the part worth
 *      reading: closing only the `const` spelling Codex reported would have left `let useRealtime =
 *      useCartRealtime` just as invisible, which is this repo's own recurring mistake — a hole
 *      closed for the one shape that was named.
 *
 * ## Round 7: the same fix, one function short
 *
 *  23. **`loose` was threaded through `isCallToBinding` and stopped there.** `directReaderCalls`
 *      reaches the reader by a SECOND route — `resolveFunction`, whose own `const`-only rule came
 *      from finding #19 — so `const refresh = useCallback(…); let refreshNow = refresh;` with
 *      `schedule(); void refreshNow();` in the handler still passed: measured at "3 call sites, all
 *      coalesced" while every event read immediately. Finding #19 is about the CREDIT direction (a
 *      `let` reader reassigned to a no-op must not be credited) and stays exactly as it was; this is
 *      the scrutiny direction, where the same mutability must mean "assume it reads". Round 6's own
 *      commit message argued that fixing one spelling and stopping is this repo's recurring mistake,
 *      and then did it one frame out. `loose` now rides `resolveFunction` and `reachesReader` too.
 *
 * ## The cases this guard has been watched against (keep this list WITH the code)
 *
 * 0 unexpected, re-proved on every round. ⚠️ THERE IS NO TOTAL WRITTEN HERE ANY MORE: this list is
 * COUNTED at run time and printed in the success line, because a total that has to be
 * hand-incremented every round is a defect generator. Codex round 6 found the CHANGELOG's copy of
 * it stale (round 4 had found the mutant total stale the same way) — and counting the list as it
 * then stood returned 43 against a docblock that said 33. Three transcriptions of one number, two
 * of them wrong, in the file whose subject is "never transcribe a number".
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
 * identifier alias of the reader called beside the schedule · an UNMEMOIZED reader · a mutable
 * reader reassigned to a no-op · a destructured local shadowing the coalescer · a parenthesized
 * raw-reader call · an immutable alias of the HOOK at an uncoalesced site · a two-hop alias chain of
 * the hook · a `let` alias of the hook · a `let` alias of the READER called beside the schedule · a
 * `let` alias of the coalescer · a `let` alias of a `useCallback` reader called beside the schedule ·
 * two cases cut from this very list · its heading renamed · the walk floor.
 *
 * GREEN — these must keep passing, or the guard gets disabled: an aliased coalescer import · a
 * non-exiting `if` before the call · a nested arrow's own `return` · `void schedule()` ·
 * `React.useCallback` · a hoisted `function` handler · the reader reached through one local hop ·
 * a handler doing non-reader work beside scheduling · a namespace-imported reader, correctly
 * coalesced · a coalescer wrapping an immutable alias of the reader · an unrelated parameter whose
 * name collides with nothing · a module-scope reader · an immutable ALIAS of a stable reader ·
 * an unrelated destructured local · an immutable alias of the hook, correctly coalesced · an
 * immutable alias of the COALESCER, used correctly.
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
/** Same idiom for the docblock's case list: MEASURED at the round that set it, never counted by eye. */
const MIN_PINNED_CASES = 53;
const CASES_HEADING = "## The cases this guard has been watched against";

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

/**
 * Does `name`, read FROM `node`, denote one of `names` — directly, or through a chain of immutable
 * aliases?
 *
 * ⚠️ AN IMPORT CAN BE SHADOWED (Codex round 3 on #287). `const useCoalescedRefresh = (fn) => fn`
 * inside a component makes `useCoalescedRefresh(refresh)` an identity function — the raw reader,
 * called per event — while a name-only check still attributes it to the import. A local binding
 * whose initializer is anything but a bare identifier is exactly that takeover, and fails here.
 *
 * ⚠️ AND AN ALIAS OF AN IMPORT IS STILL THE IMPORT (Codex round 6 on #287). `const useRealtime =
 * useCartRealtime;` put a whole consumer out of the guard's REACH, not merely past one check:
 * `names` holds import-declared spellings only, so that call site was never COLLECTED, and the two
 * real ones kept `MIN_CALL_SITES` satisfied — green over a consumer re-reading per event. Round 4
 * closed exactly this for the reader (finding #16) and the hook side was simply missed. Each hop
 * re-resolves from the DECLARATION, because that is the scope the alias was written in, and `const`
 * is required WHERE A HIT GRANTS CREDIT, for finding #7's reason: a `let` can be reassigned after
 * the alias is taken.
 *
 * ⚠️ WHICH IS WHY `loose` EXISTS, AND IT IS NOT A RELAXATION. The two directions have OPPOSITE
 * safe answers for a mutable alias. Asking "is this DEFINITELY the coalescer?" (credit) must say no
 * — a `let` can be reassigned to a no-op. Asking "could this be the hook, or a read beside the
 * schedule?" (scrutiny) must say YES for the same reason: refusing there does not refuse the
 * consumer, it makes the consumer INVISIBLE, which is how the `const` alias above escaped. So
 * `loose` is passed exactly where a hit WIDENS scrutiny — the call-site walk and `directReaderCalls`
 * — and never where one grants credit. Fixing the `const` shape alone and stopping would be this
 * repo's own recurring mistake: a hole closed for the one spelling that was reported.
 */
function aliasesImported(node, name, names, loose) {
  const seen = new Set();
  let current = name;
  let from = node;
  for (;;) {
    if (seen.has(current)) return false; // `const a = a;` parses — and resolves to nothing
    seen.add(current);
    const local = resolveBinding(from, current);
    if (local === null) return names.has(current); // nothing local binds it → the import itself
    if (local.kind !== "value") return false; // a param, a destructured local, a hoisted function
    if (!local.isConst && !loose) return false; // a `let` can be reassigned — never credit it
    const init = unwrap(local.init);
    if (!ts.isIdentifier(init)) return false; // an arrow, a call, a member — a real takeover
    current = init.text;
    from = local.init;
  }
}

/**
 * Is `node` a call to one of `binding.names`, or to `ns.<exported>` for one of its namespaces?
 *
 * `loose` follows mutable aliases too — pass it only where a hit widens scrutiny, never where one
 * grants credit. See `aliasesImported`.
 */
function isCallToBinding(node, binding, exported, loose = false) {
  if (!ts.isCallExpression(node)) return false;
  // `(refresh)()` — a parenthesized callee is the same call (Codex round 5 on #287).
  const callee = unwrap(node.expression);
  if (ts.isIdentifier(callee)) return aliasesImported(node, callee.text, binding.names, loose);
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    aliasesImported(node, callee.expression.text, binding.namespaces, loose) &&
    callee.name.text === exported
  );
}

const isCallTo = (node, name) =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;

/**
 * The plain identifier a call's callee resolves to, or null.
 *
 * ⚠️ ONE HELPER, USED EVERYWHERE A CALLEE IS INSPECTED (Codex round 5 on #287). Unwrapping the
 * callee in `isCallToBinding` alone was not enough: `void (refresh)()` still escaped, because the
 * TRANSITIVE branch and the scheduler test each re-tested `ts.isIdentifier(n.expression)` on the raw
 * node and bailed on the parenthesis. A wrapper that is invisible to one reader and not another is
 * how a fix looks complete and is not.
 */
function calleeIdent(n) {
  if (!ts.isCallExpression(n)) return null;
  const c = unwrap(n.expression);
  return ts.isIdentifier(c) ? c : null;
}

/**
 * The initializer bound to `name` as seen FROM `node`, resolved LEXICALLY: walk outward and take the
 * first enclosing scope that declares it. A whole-file map is last-wins, which lets one correct
 * binding launder every same-named wrong one in the same file (blind pass on #287) — the repo's own
 * "uniqueness ≠ liveness" rule, broken by the guard written to enforce it.
 *
 * Returns `{ kind: "value", init }` for `const x = …`, `{ kind: "function", fn }` for a hoisted
 * `function x(){}`, or `null`.
 */
/** Does a declaration name — an identifier or any nested binding pattern — bind `name`? */
function bindsName(nameNode, name) {
  if (!nameNode) return false;
  if (ts.isIdentifier(nameNode)) return nameNode.text === name;
  if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode))
    return nameNode.elements.some((el) => ts.isBindingElement(el) && bindsName(el.name, name));
  return false;
}

function resolveBinding(node, name) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    // ⚠️ PARAMETERS ARE BINDINGS TOO (Codex round 4 on #287). A component taking a same-named
    // parameter shadows the import for its whole body, in a file that otherwise imports it for real
    // — so a statements-only walk reported "not shadowed" and credited the call to the import.
    // Destructured parameters (`{ refresh }`) bind just as hard as named ones.
    const params = ts.isFunctionLike(scope) ? (scope.parameters ?? []) : [];
    for (const prm of params) if (bindsName(prm.name, name)) return { kind: "param" };
    const statements = ts.isSourceFile(scope)
      ? scope.statements
      : ts.isBlock(scope) || ts.isModuleBlock(scope)
        ? scope.statements
        : null;
    if (!statements) continue;
    for (const st of statements) {
      if (ts.isVariableStatement(st)) {
        const isConst = !!(st.declarationList.flags & ts.NodeFlags.Const);
        const atModuleScope = ts.isSourceFile(scope);
        for (const d of st.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer)
            return { kind: "value", init: d.initializer, isConst, atModuleScope };
          // ⚠️ A DESTRUCTURED LOCAL SHADOWS JUST AS HARD (Codex round 5 on #287). `const {
          // useCoalescedRefresh } = helpers;` was invisible because only identifier declaration
          // names were examined — the same gap the parameter fix had just closed one line above.
          if (!ts.isIdentifier(d.name) && bindsName(d.name, name)) return { kind: "destructured" };
        }
      }
      if (ts.isFunctionDeclaration(st) && st.name?.text === name)
        return { kind: "function", fn: st, atModuleScope: ts.isSourceFile(scope) };
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
function resolveFunction(from, name, react, loose = false, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const b = resolveBinding(from, name);
  if (!b || b.kind === "param" || b.kind === "destructured") return null;
  // A generator's body does NOT run on call — invoking it only builds an iterator (Codex round 3).
  if (b.kind === "function") return b.fn.asteriskToken ? null : b.fn;
  // ⚠️ MUTABILITY APPLIES TO THE READER TOO (Codex round 5 on #287). `let refresh = () =>
  // getCartView(id); refresh = () => {};` declares a reader and ships a no-op; round 2 caught this
  // for the SCHEDULER binding and the same check was simply missing here.
  //
  // ⚠️ — AND IT REVERSES IN THE SCRUTINY DIRECTION (Codex round 7 on #287). Round 6 threaded `loose`
  // through `isCallToBinding` and STOPPED THERE, one function short: `directReaderCalls` also reaches
  // the reader through THIS resolver, so `let refreshNow = refresh;` beside the schedule was still
  // waved through — measured, the guard printed "3 call sites, all coalesced" while every event read
  // immediately. The same fix left half-applied is the mistake the round-6 commit message warned
  // about, one frame out. `loose` here means the same thing it means there: a mutable alias CANNOT
  // be credited as a reader, and must not be assumed innocent when we are looking for one.
  if (!b.isConst && !loose) return null;
  const init = unwrap(b.init);
  // ⚠️ FOLLOW AN IMMUTABLE ALIAS (Codex round 4 on #287). `const refreshNow = refresh;` bound an
  // IDENTIFIER, not a function literal, so this returned null and `directReaderCalls` concluded the
  // handler had no path to the reader — while `refreshNow()` beside the schedule read on every
  // event. Only `const` chains are followed: a `let` can be reassigned, which is finding #7's rule.
  if (ts.isIdentifier(init)) return resolveFunction(init, init.text, react, loose, seen);
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
function reachesReader(fn, ctx, loose = false, seen = new Set()) {
  if (!fn || !fn.body || seen.has(fn.pos)) return false;
  seen.add(fn.pos);
  let found = false;
  walk(fn.body, (n) => {
    if (found || !ts.isCallExpression(n)) return;
    if (isCallToBinding(n, ctx.reader, READER, loose)) {
      found = true;
      return;
    }
    const id = calleeIdent(n);
    if (!id) return;
    const next = resolveFunction(n, id.text, ctx.react, loose);
    if (next && reachesReader(next, ctx, loose, seen)) found = true;
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
    if (isCallToBinding(n, ctx.reader, READER, true)) {
      hits.push(n.expression.getText());
      return;
    }
    const id = calleeIdent(n);
    if (!id) return;
    // Scrutiny, so `loose`: a mutable alias of the reader is a read until proven otherwise.
    const target = resolveFunction(n, id.text, ctx.react, true);
    if (target && reachesReader(target, ctx, true)) hits.push(id.text);
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
  const isSchedule = (e) => ctx.isSchedulerCall(unwrap(e));
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
/**
 * Is this reader STABLE across renders — a `useCallback` result, or declared at module scope?
 *
 * ⚠️ THIS IS THE HOOK'S CONTRACT, NOT A STYLE RULE (Codex round 5 on #287). `useCoalescedRefresh`
 * keys its cleanup on the reader's identity, deliberately: an unmount-only cleanup let a pending
 * echo outlive a cart change and paint one cart over another (Codex round 2 on #275). The cost of
 * that correctness is that an UNMEMOIZED reader gets a new identity on every render, so any render
 * between the last event and the timer firing clears the pending read and arms no replacement — the
 * cart then misses that change until the next event or interaction. Both consumers today pass a
 * `useCallback`; this makes the requirement mechanical instead of a comment nobody reads.
 */
function isStableReader(from, name, ctx, seen = new Set()) {
  if (seen.has(name)) return false;
  seen.add(name);
  const b = resolveBinding(from, name);
  if (!b) return false;
  if (b.atModuleScope) return true; // a module-level binding has one identity for the process
  if (b.kind !== "value" || !b.isConst) return false;
  const init = unwrap(b.init);
  // An immutable ALIAS of a stable reader is itself stable — caught by this rule's own GREEN
  // control, which is why every tightening gets one.
  if (ts.isIdentifier(init)) return isStableReader(init, init.text, ctx, seen);
  return isUseCallback(init, ctx.react);
}

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
  // …the thing it wraps must actually re-read the cart…
  if (!reachesReader(resolveFunction(arg, arg.text, ctx.react), ctx)) return false;
  // …and it must be STABLE, or the cleanup keyed on its identity discards pending reads.
  return isStableReader(arg, arg.text, ctx);
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
    if (isCallToBinding(n, hook, HOOK, true)) calls.push(n);
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
  ctx.isSchedulerCall = (n) => {
    const id = calleeIdent(n);
    return !!id && isScheduler(n, id.text);
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

/**
 * The cases pinned in THIS FILE's own docblock, counted from the source rather than read off a
 * sentence. A shrunk list is a regression — the same reason `MIN_CALL_SITES` exists — and a heading
 * that no longer parses fails loudly instead of silently reporting zero.
 */
function pinnedCases() {
  const doc = readFileSync(fileURLToPath(import.meta.url), "utf8")
    .split(CASES_HEADING)[1]
    ?.split("*/")[0];
  if (!doc) return null;
  const red = doc.split("RED —")[1]?.split("GREEN —")[0];
  const green = doc.split("GREEN —")[1];
  if (!red || !green) return null;
  // "a · b · c" — n separators, n+1 items.
  return red.split("·").length + green.split("·").length;
}

const cases = pinnedCases();
if (cases === null)
  fail(
    `the docblock's case list could not be parsed — "${CASES_HEADING}" with a RED and a GREEN run ` +
      `must stay in this file; the cases ARE the proof that this guard can fail.`,
  );
else if (cases < MIN_PINNED_CASES)
  fail(
    `the docblock pins ${cases} watched cases, fewer than the ${MIN_PINNED_CASES} this guard has ` +
      `been proved against. A case list that shrinks is a regression, not a tidy-up.`,
  );

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
    `${parsed.size} files in ${WINDOW_SCAN_ROOTS.join(", ")}; ${cases} watched cases pinned`,
);
