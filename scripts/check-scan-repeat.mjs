#!/usr/bin/env node
/**
 * M186 — the /grocery camera scan must ASK `classifyScan` before it charges, and must STOP on a
 * repeat.
 *
 * ## Why a guard, and why here
 *
 * The charge rule itself is a pure module (`apps/qr/lib/scan-gate.ts`), falsifiable by a value and
 * covered by nine mutants. Its WIRING is not: `apps/qr/app/grocery/page.tsx` is a component, so it
 * sits outside `check-money-coverage`'s `MONEY_PATHS` and has no suite. The blind pre-PR audit that
 * rejected M186's first attempt named exactly that shape as its blocking finding — the one line the
 * author called "the fix" lived where no test, no mutant and no mechanical gate could see it, and
 * moving it two lines rebuilt the bug with everything still green.
 *
 * So this guard owns one proposition, and only one:
 *
 *   In `page.tsx`, the single `scanAdd` call is preceded — inside the same function — by a
 *   `classifyScan` call whose result gates an early `return`.
 *
 * Without it, deleting the four-line guard clause turns every sighting of an item the basket
 * already holds back into a fresh charge, and nothing in CI notices.
 *
 * ## It PARSES, and it is aimed at its own matcher (LEARNINGS #60)
 *
 * The obvious version of this greps for "classifyScan" and passes on a comment, an import that is
 * never called, or a `{false && …}` branch parked next to the live code. So:
 *
 *   • comments are not AST nodes, so a mention in a docblock cannot satisfy anything here;
 *   • both calls must be LIVE — neither may sit under `if (false)`, `false && …`, `false ? … : x`
 *     or `while (false)`, the enumerated literal-dead shapes;
 *   • the guard's `if` test must reference the BINDING the classify call was assigned to, not any
 *     identifier that happens to read well — renaming the variable without re-pointing the test
 *     fails;
 *   • "before" is asserted as *inside the same function, at an earlier position, with a `return`
 *     in the taken branch* — an early return is the one case where lexical order IS the semantics,
 *     and the return is what makes it a stop rather than a log.
 *
 * Red-first — five falsifications induced against the real file and watched fail before this
 * shipped, then restored: the guard's `if` wrapped in `if (false)`; the `return` deleted so the
 * repeat only announces and falls through; the test swapped to read `via` instead of the verdict;
 * the verdict binding renamed without re-pointing the test; and the whole classification moved to
 * after the `scanAdd` await.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/qr/app/grocery/page.tsx";
const CLASSIFIER = "classifyScan";
const CHARGE = "scanAdd";

const problems = [];
const fail = (m) => problems.push(m);

const src = ts.createSourceFile(
  PAGE,
  readFileSync(path.join(ROOT, PAGE), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

/** Depth-first walk. `ts.forEachChild` is a SEARCH primitive — a truthy return aborts it. */
const walk = (n, fn) => {
  fn(n);
  ts.forEachChild(n, (c) => {
    walk(c, fn);
  });
};

const isFalseLiteral = (n) => n?.kind === ts.SyntaxKind.FalseKeyword;

/**
 * Is `node` parked in one of the enumerated literal-dead shapes? This is liveness against a parked
 * dead copy, not a reachability proof — a call behind a runtime condition still counts as live,
 * which is correct: this guard asks whether the code is THERE and wired, not whether some input
 * reaches it.
 */
const isLiterallyDead = (node) => {
  for (let n = node; n; n = n.parent) {
    const p = n.parent;
    if (!p) return false;
    if (ts.isIfStatement(p) && isFalseLiteral(p.expression) && p.thenStatement === n) return true;
    if (ts.isWhileStatement(p) && isFalseLiteral(p.expression) && p.statement === n) return true;
    if (
      ts.isBinaryExpression(p) &&
      p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      isFalseLiteral(p.left) &&
      p.right === n
    )
      return true;
    if (ts.isConditionalExpression(p) && isFalseLiteral(p.condition) && p.whenTrue === n)
      return true;
  }
  return false;
};

const enclosingFunction = (node) => {
  for (let n = node.parent; n; n = n.parent) if (ts.isFunctionLike(n)) return n;
  return null;
};

/** Every live call to `name` as a bare identifier callee. */
const callsTo = (name) => {
  const out = [];
  walk(src, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name)
      out.push(n);
  });
  return out;
};

/**
 * EVERY binding a call sits under, innermost first: the scan charge answers ["add"], the queue
 * replay answers ["r", "outcomes", "drainNow"].
 *
 * ⚠️ A SET, not "the" owner, because two drafts of this got it wrong in opposite ways. Stopping at
 * the first enclosing function returned null for the replay (it lives in an anonymous arrow inside
 * `.map(…)`), and taking the first binding above that returned `outcomes` — the `const` the map's
 * promise lands in, which is not a name anyone would write an exemption against. An exemption is
 * matched against the whole chain so it names the function a reader would recognise.
 */
const ownerNames = (node) => {
  const out = [];
  for (let n = node; n; n = n.parent) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) out.push(n.name.text);
    else if (ts.isFunctionDeclaration(n) && n.name) out.push(n.name.text);
  }
  return out;
};

const exemptReason = (node) => ownerNames(node).find((n) => n in EXEMPT) ?? null;

/**
 * `scanAdd` call sites that must NOT be gated by `classifyScan`, each with a reason that must FIRE
 * — an exemption for a call site that no longer exists is a silent hole (LEARNINGS #60).
 */
const EXEMPT = {
  drainNow:
    "the offline queue's REPLAY. Every entry in it was already classified at scan time and is " +
    "already counted as charged (`classifyScan` reads the queue); re-classifying here would " +
    "refuse the shopper's own queued scans as repeats of themselves and they would never land.",
};

const classifyCalls = callsTo(CLASSIFIER);
const allChargeCalls = callsTo(CHARGE);
const chargeCalls = allChargeCalls.filter((c) => exemptReason(c) === null);
const exemptedOwners = new Set(allChargeCalls.map(exemptReason).filter((n) => n !== null));
for (const name of Object.keys(EXEMPT))
  if (!exemptedOwners.has(name))
    fail(
      `EXEMPT names \`${name}\`, but no ${CHARGE}() call in ${PAGE} sits under it.\n` +
        "  The exemption no longer fires — delete it, or the next charge path added there is\n" +
        "  silently unguarded.",
    );

if (classifyCalls.length !== 1)
  fail(
    `expected exactly ONE live call to ${CLASSIFIER}() in ${PAGE}; found ${classifyCalls.length}.\n` +
      "  Two classifiers means two answers to one money question — name it once (CLAUDE.md), or\n" +
      "  this guard cannot say which one gates the charge.",
  );
if (chargeCalls.length !== 1)
  fail(
    `expected exactly ONE non-exempt call to ${CHARGE}() in ${PAGE}; found ${chargeCalls.length}` +
      ` (of ${allChargeCalls.length} total).\n` +
      "  A second charge path would need its own repeat guard, and this one would not see it —\n" +
      "  add it to EXEMPT with a reason, or gate it.",
  );

if (!problems.length) {
  const classify = classifyCalls[0];
  const charge = chargeCalls[0];

  for (const [label, node] of [
    [CLASSIFIER, classify],
    [CHARGE, charge],
  ])
    if (isLiterallyDead(node))
      fail(
        `${label}() sits in a literally-dead branch (if (false) / false && … / while (false)).\n` +
          "  A parked copy is not shipped behaviour.",
      );

  const fn = enclosingFunction(charge);
  if (!fn) fail(`${CHARGE}() is not inside a function — cannot locate the guard clause.`);
  else if (enclosingFunction(classify) !== fn)
    fail(
      `${CLASSIFIER}() and ${CHARGE}() are in DIFFERENT functions.\n` +
        "  The repeat check must gate the charge in the same call, or a scan can reach the server\n" +
        "  without ever being classified.",
    );
  else if (classify.pos >= charge.pos)
    fail(
      `${CLASSIFIER}() is positioned AFTER ${CHARGE}().\n` +
        "  The classification is a guard clause — after the charge it is a comment on a bill that\n" +
        "  already went out.",
    );
  else {
    // The binding the verdict was assigned to. Bound to the live call, not to any identifier
    // reading "verdict": rename it without re-pointing the test and this fails.
    let binding = null;
    for (let n = classify.parent; n; n = n.parent)
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
        binding = n.name.text;
        break;
      }
    if (!binding)
      fail(
        `${CLASSIFIER}()'s result is not bound to a variable, so nothing can gate on it.\n` +
          "  Assign the verdict and branch on it.",
      );
    else {
      const guards = [];
      walk(fn, (n) => {
        if (!ts.isIfStatement(n)) return;
        if (n.pos < classify.pos || n.pos >= charge.pos) return;
        if (isLiterallyDead(n.thenStatement)) return;
        let readsVerdict = false;
        walk(n.expression, (e) => {
          if (ts.isIdentifier(e) && e.text === binding) readsVerdict = true;
        });
        if (!readsVerdict) return;
        let stops = false;
        walk(n.thenStatement, (e) => {
          if (ts.isReturnStatement(e)) stops = true;
        });
        if (stops) guards.push(n);
      });
      if (!guards.length)
        fail(
          `no live \`if\` between ${CLASSIFIER}() and ${CHARGE}() reads \`${binding}\` and returns.\n` +
            "  A repeat must STOP the charge. Announcing it and falling through bills the shopper\n" +
            "  a second time for the item already in their basket — M186, reopened.",
        );
    }
  }
}

if (problems.length) {
  console.error("scan repeat gate … \x1b[31m✗\x1b[0m\n");
  for (const p of problems) console.error("  " + p + "\n");
  process.exit(1);
}
console.log(
  "scan repeat gate … \x1b[32mclean\x1b[0m\x1b[2m" +
    ` — ${PAGE}: the ${CHARGE}() call is gated by a live ${CLASSIFIER}() early return` +
    ` (${exemptedOwners.size} exempt call site${exemptedOwners.size === 1 ? "" : "s"}, reason fired)\x1b[0m`,
);
