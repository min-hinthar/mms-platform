#!/usr/bin/env node
/**
 * PD2 (the owner, PATH_DESIGN_2026-10-07 decision 2; round 3 D5) — is the parked dine-in phone-pay
 * door ANSWERED in `create-intent`, and answered in the one place it is safe to?
 *
 * The rule has a mutant (`surfaces/create-intent-route-answers-open`, caught by the route's own
 * suite), but the route's suite can only see what its mocks let it see, and the fact that matters
 * most here is ORDER:
 *
 *   1. `create-intent` calls `phonePayParked(…)` — the same pure rule the Bill draws with
 *      (lib/checkout-stage) — as the condition of an `if` whose branch RETURNS (a refusal), and that
 *      branch AWAITS `freeLock()` first: a parked door that forgets the lock strands the table for
 *      the whole `CART_LOCK_TTL_MS` on a checkout it just refused.
 *   2. The refusal runs only AFTER `supersedeCartIntent` has FINISHED — awaited, in a statement
 *      that ends before the refusal's statement begins. Every pre-mint refusal frees the lock, and
 *      freeing it while a predecessor intent can still be confirmed is #257's CRITICAL (M151): a
 *      double-tap inside the window stamps a new era, reads the predecessor as captured, then frees
 *      the lock the charge depends on. Lexical order is not sequencing — `Promise.all([supersede,
 *      …])` is first in the AST and concurrent — so the rule is stated as statements, not positions.
 *   3. It runs BEFORE PD10's served gate (`servedGateDecision`, which took the unsent refusal's
 *      slot), so a parked door is refused before any further read is spent on the attempt, and the
 *      served gate always finds the parked refusal above it.
 *
 * PD10 · D5 (PATH_DESIGN_2026-10-07 decision 10) — and THE SERVED GATE behind the open door, the
 * route's other phone-pay refusal, held to the same standard (D5: "a script that parses the route
 * checks the call and that each refusal runs only after the supersede statement finishes"):
 *
 *   4. ONE live `servedGateDecision(` call, the initializer of a `const` in its own statement, whose
 *      arguments AWAIT a `readServedGateInput(` call — the verdict is from THIS attempt's read (one
 *      error-aware read that fails closed), never a value read earlier and carried in.
 *   5. The statement right after it is an `if` on that const which AWAITS `freeLock()` before ANY
 *      return on any path, and returns — the same refusal shape as the parked door's.
 *   6. ORDER: the decision's statement begins only after the supersede's statement and the parked
 *      door's `if` have both ended, and ends before the promo pin (`mms_pin_promo_grant`) and
 *      `paymentIntents.create` begin — a refused attempt pins nothing and creates nothing at Stripe.
 *   7. The shipped unsent refusal is GONE: no live `payBlockedByUnsent(` call in the route. D5's gate
 *      replaced it in its slot (every unsent dine-in line holds the gate too, and its sentence — "then
 *      the bill is ready to pay" — is false under D5); one put back would refuse in the wrong words.
 *
 * PARSED, never scanned (LEARNINGS #60; the history is in `check-promo-grant-pin.mjs`'s header):
 * comments are not AST nodes, a literally-dead branch (`if (false)`, `false && …`) is not a
 * candidate, and more than one live candidate is ambiguity this guard refuses rather than resolves
 * by position. `typescript` is already a dependency.
 *
 * Red-first (each induced, watched fail, restored): the refusal moved above `supersedeCartIntent`;
 * the refusal deleted; `await freeLock()` removed from its branch; the refusal moved below the
 * unsent refusal; the supersede wrapped in `Promise.all` with the refusal's read; a second live
 * `phonePayParked(` call added; the call parked under `if (false)`; the release moved after the
 * branch's return (`{ return …; await freeLock(); }`, the blind pass on #331); a NESTED early return
 * before the release (`{ if (x) return …; await freeLock(); return …; }`, the last blind pass). A
 * nested function's own `return` before the release stays clean.
 *
 * Red-first for 4–7 (PD10, each induced, watched fail, restored): the served refusal deleted; the
 * decision moved above the supersede; above the parked door; below the promo pin; the read made
 * un-awaited (`readServedGateInput(cartId)` passed as a promise); the read hoisted into an earlier
 * statement and its variable passed in; the `if` on another variable; `await freeLock()` removed from
 * the served branch; a `return` before it; `payBlockedByUnsent(` called again; a second live decision.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/qr/app/api/stripe/create-intent/route.ts";

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const raw = readFileSync(path.join(ROOT, FILE), "utf8");
const sf = ts.createSourceFile(FILE, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

process.stdout.write(
  "phone-pay doors — parked, then served-gated: answered after the supersede, before the pin … ",
);
const fail = (msg) => {
  process.stdout.write(`${c.red("✗")}\n\n  ${msg}\n\n`);
  process.exit(1);
};

/** ⚠️ The visitor returns undefined: `ts.forEachChild` is a SEARCH primitive (see the sibling). */
const calls = [];
(function walk(node) {
  if (ts.isCallExpression(node)) calls.push(node);
  ts.forEachChild(node, (child) => {
    walk(child);
  });
})(sf);

const isNamedCall = (n, name) =>
  (ts.isIdentifier(n.expression) && n.expression.text === name) ||
  (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === name);

/** A call inside one of the enumerated literal-dead shapes is not a candidate (uniqueness ≠ liveness). */
const isLiterallyDead = (node) => {
  for (let n = node; n && n.parent; n = n.parent) {
    if (ts.isIfStatement(n.parent) && n.parent.thenStatement === n) {
      const cond = n.parent.expression;
      if (cond.kind === ts.SyntaxKind.FalseKeyword) return true;
      if (ts.isNumericLiteral(cond) && Number(cond.text) === 0) return true;
    }
    if (
      ts.isBinaryExpression(n.parent) &&
      n.parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      n.parent.right === n
    ) {
      const l = n.parent.left;
      if (l.kind === ts.SyntaxKind.FalseKeyword) return true;
      if (ts.isNumericLiteral(l) && Number(l.text) === 0) return true;
    }
  }
  return false;
};
const theOneLive = (label, pred) => {
  const live = calls.filter((n) => pred(n) && !isLiterallyDead(n));
  if (live.length > 1) {
    const lines = live.map((n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
    fail(
      `${FILE} calls \`${label}\` ${live.length} times (lines ${lines.join(", ")}).\n  ` +
        "This guard asserts ONE sequence, and two live call sites is ambiguity it refuses to\n  " +
        "resolve by position. Collapse them to one, or teach the guard the new shape.",
    );
  }
  return live[0];
};
const stmtOf = (node) => {
  for (let n = node; n; n = n.parent) if (ts.isStatement(n)) return n;
  return undefined;
};
const isAwaited = (call) => {
  for (let n = call.parent; n && !ts.isStatement(n); n = n.parent)
    if (ts.isAwaitExpression(n)) return true;
  return false;
};

// ── rule 1: the door is asked, as the condition of a refusing `if` that frees the lock ───────────
const doorCall = theOneLive("phonePayParked", (n) => isNamedCall(n, "phonePayParked"));
if (!doorCall)
  fail(
    `${FILE} no longer calls \`phonePayParked(\`.\n  ` +
      "PD2: the dine-in phone-pay door is parked (SURFACES.dineInPhonePay) and this route is directly\n  " +
      "POST-able with the Bill's card hero gone. Without the refusal a table on TEST keys mints a\n  " +
      "PaymentIntent — a door with the sign taken down, not a parked one (lib/surfaces).",
  );
// The `if` whose condition contains the call (the call may sit under a `!` or `&&`; walk up to it).
let doorIf;
for (let n = doorCall.parent; n && !ts.isStatement(n); n = n.parent) {
  if (ts.isIfStatement(n.parent) && n.parent.expression === n) doorIf = n.parent;
}
if (!doorIf && ts.isIfStatement(doorCall.parent) && doorCall.parent.expression === doorCall)
  doorIf = doorCall.parent;
if (!doorIf)
  fail(
    "`phonePayParked(` is not the condition of an `if` statement.\n  " +
      "The refusal must be a decision the route makes and returns from, not a value read and\n  " +
      "dropped. Write `if (phonePayParked(…)) { await freeLock(); return NextResponse.json(…); }`.",
  );
/**
 * A refusing `if`: its branch AWAITS `freeLock()` as a statement of its own, before ANY `return` on
 * any path (nested blocks included; a nested function's own returns excepted), and returns.
 * The blind passes on #331 — ORDER, not presence, and on EVERY path: `{ return …; await freeLock(); }`
 * contains both and releases nothing (the statement after a return is dead), and
 * `{ if (x) return …; await freeLock(); return …; }` releases on one path only.
 */
function assertRefusingBranch(ifStmt, label) {
  const branch = ifStmt.thenStatement;
  const branchStmts = ts.isBlock(branch) ? branch.statements : [branch];
  const returnAt = branchStmts.findIndex((st) => ts.isReturnStatement(st));
  if (returnAt < 0)
    fail(
      `the ${label} branch does not RETURN.\n  ` +
        "A refusal that falls through still mints. The branch must end in `return NextResponse.json(…)`.",
    );
  const freeAt = branchStmts.findIndex(
    (st) =>
      ts.isExpressionStatement(st) &&
      ts.isAwaitExpression(st.expression) &&
      ts.isCallExpression(st.expression.expression) &&
      isNamedCall(st.expression.expression, "freeLock"),
  );
  if (freeAt < 0)
    fail(
      `the ${label} branch does not \`await freeLock()\`.\n  ` +
        "Every pre-mint refusal gives the lock back under its own era (M153); one that forgets to\n  " +
        "strands the table for the whole CART_LOCK_TTL_MS on a checkout it just refused.",
    );
  const releaseEnd = branchStmts[freeAt].end;
  const earlyReturns = [];
  (function walk(node) {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.getStart(sf) < releaseEnd) earlyReturns.push(node);
    ts.forEachChild(node, (c) => {
      walk(c);
    });
  })(branch);
  if (earlyReturns.length)
    fail(
      `the ${label} branch can RETURN before it \`await freeLock()\`s ` +
        `(line ${sf.getLineAndCharacterOfPosition(earlyReturns[0].getStart(sf)).line + 1}).\n  ` +
        "Every path out of the refusal must give the lock back first, or that path strands the table\n  " +
        "under its lock for the whole CART_LOCK_TTL_MS. Await the release, then return.",
    );
}
assertRefusingBranch(doorIf, "parked-door");

// ── rule 2: AFTER the supersede has finished — awaited, in a statement that ends first ───────────
const supersedeCall = theOneLive("supersedeCartIntent", (n) =>
  isNamedCall(n, "supersedeCartIntent"),
);
if (!supersedeCall)
  fail(
    `${FILE} no longer calls \`supersedeCartIntent\`.\n  ` +
      "M151: the predecessor intent is made unusable before any refusal frees the lock. This guard\n  " +
      "orders the parked door against it; if the supersede moved, teach the guard the new shape.",
  );
if (!isAwaited(supersedeCall))
  fail(
    "`supersedeCartIntent` is not AWAITED.\n  " +
      "M151: a fire-and-forget supersede carries no guarantee the predecessor is cancelled before\n  " +
      "the parked-door refusal frees the lock the charge may still depend on. Await it.",
  );
const supersedeStmt = stmtOf(supersedeCall);
if (supersedeStmt === doorIf || supersedeStmt === stmtOf(doorCall))
  fail(
    "the supersede and the parked-door refusal run in the SAME statement.\n  " +
      "Lexical order is not sequencing (`Promise.all([supersedeCartIntent(…), …])` is first in the\n  " +
      "AST and concurrent). Supersede in its own statement, awaited, before the refusal's statement.",
  );
if (supersedeStmt.end > doorIf.getStart(sf))
  fail(
    "the parked-door refusal runs BEFORE the predecessor is superseded.\n  " +
      "PATH_DESIGN round 3 D5; #257's CRITICAL (M151): the refusal frees the lock, and freeing it\n  " +
      "while a predecessor intent can still be confirmed is the double-charge shape — a double-tap\n  " +
      "inside the window stamps a new era, reads `captured`, and unlocks the cart under the charge.\n  " +
      "Move the `if (phonePayParked(…))` block BELOW `await supersedeCartIntent(cartId)` and its\n  " +
      "captured / unknown exits.",
  );

// ── rule 7 (asked first: rule 3 orders against what replaced it): the unsent refusal is GONE ─────
const unsentLive = calls.filter((n) => isNamedCall(n, "payBlockedByUnsent") && !isLiterallyDead(n));
if (unsentLive.length)
  fail(
    `${FILE} calls \`payBlockedByUnsent(\` again (line ${
      sf.getLineAndCharacterOfPosition(unsentLive[0].getStart(sf)).line + 1
    }).\n  ` +
      "PD10 · D5: the served gate took the unsent refusal's slot and REPLACED it — every unsent\n  " +
      "dine-in line holds the gate too, and the unsent sentence ('then the bill is ready to pay') is\n  " +
      "false under D5. Refuse through `servedGateDecision` alone.",
  );

// ── rule 4: the served gate — ONE decision, from an awaited read IN its own statement ───────────
const servedCall = theOneLive("servedGateDecision", (n) => isNamedCall(n, "servedGateDecision"));
if (!servedCall)
  fail(
    `${FILE} no longer calls \`servedGateDecision(\`.\n  ` +
      "PD10 · D5: a table pays by phone only once nothing on its bill is still with the kitchen, and\n  " +
      "this route is directly POST-able — the Bill's held Pay is the courtesy, this is the gate.",
  );
const servedStmt = stmtOf(servedCall);
const servedDecl =
  ts.isVariableStatement(servedStmt) &&
  servedStmt.declarationList.declarations.length === 1 &&
  servedStmt.declarationList.declarations[0].initializer === servedCall &&
  ts.isIdentifier(servedStmt.declarationList.declarations[0].name)
    ? servedStmt.declarationList.declarations[0]
    : null;
if (!servedDecl)
  fail(
    "`servedGateDecision(` is not the whole initializer of a single `const` in its own statement.\n  " +
      "Write `const servedHold = servedGateDecision(mode, <awaited read>, hostPresent);` and refuse on it\n  " +
      "in the very next statement.",
  );
const servedVar = servedDecl.name.text;
const readsInDecision = [];
(function walk(node) {
  if (ts.isCallExpression(node) && isNamedCall(node, "readServedGateInput"))
    readsInDecision.push(node);
  ts.forEachChild(node, (ch) => {
    walk(ch);
  });
})(servedCall);
const awaitedRead = readsInDecision.find((rc) => ts.isAwaitExpression(rc.parent));
if (!awaitedRead)
  fail(
    "`servedGateDecision(` does not AWAIT `readServedGateInput(` among its own arguments.\n  " +
      "D5: the verdict comes from THIS attempt's one error-aware read, in the decision's statement —\n  " +
      "a read done earlier (or a promise passed un-awaited) is not the read the gate decides on.",
  );
const readsAnywhere = calls.filter(
  (n) => isNamedCall(n, "readServedGateInput") && !isLiterallyDead(n),
);
if (readsAnywhere.length !== 1)
  fail(
    `${FILE} calls \`readServedGateInput(\` ${readsAnywhere.length} times.\n  ` +
      "The gate decides on ONE read, inside its decision; a second read is a second answer.",
  );

// ── rule 5: the next statement refuses on it, giving the lock back first ────────────────────────
const servedSiblings = servedStmt.parent.statements ?? [];
const servedIf = servedSiblings[servedSiblings.indexOf(servedStmt) + 1];
const mentionsVar = (node) => {
  let found = false;
  (function walk(n) {
    if (ts.isIdentifier(n) && n.text === servedVar) found = true;
    ts.forEachChild(n, (ch) => {
      walk(ch);
    });
  })(node);
  return found;
};
if (!servedIf || !ts.isIfStatement(servedIf) || !mentionsVar(servedIf.expression))
  fail(
    `the statement after \`const ${servedVar} = servedGateDecision(…)\` is not an \`if\` on it.\n  ` +
      "The verdict must be refused on at once — a value read and dropped (or refused later, after\n  " +
      "other work) is not a gate.",
  );
assertRefusingBranch(servedIf, "served-gate");

// ── rule 6 (and rule 3): the ORDER — supersede, parked door, served gate, then the pin and Stripe ─
if (supersedeStmt.end > servedStmt.getStart(sf))
  fail(
    "the served gate runs BEFORE the predecessor is superseded.\n  " +
      "PATH_DESIGN D5; #257's CRITICAL (M151): the refusal frees the lock, and freeing it while a\n  " +
      "predecessor intent can still be confirmed is the double-charge shape. Move the decision BELOW\n  " +
      "`await supersedeCartIntent(cartId)` and its captured / unknown exits.",
  );
if (doorIf.end > servedStmt.getStart(sf))
  fail(
    "the parked-door refusal runs AFTER the served gate.\n  " +
      "PD2: a parked door is refused before any further read is spent on the attempt — the served\n  " +
      "gate's read included — and the gate must always find the parked refusal above it.",
  );
const pinCall = theOneLive(
  "mms_pin_promo_grant",
  (n) =>
    isNamedCall(n, "rpc") &&
    n.arguments.length > 0 &&
    ts.isStringLiteralLike(n.arguments[0]) &&
    n.arguments[0].text === "mms_pin_promo_grant",
);
const createCall = theOneLive(
  "paymentIntents.create",
  (n) =>
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === "create" &&
    ts.isPropertyAccessExpression(n.expression.expression) &&
    n.expression.expression.name.text === "paymentIntents",
);
if (!pinCall || !createCall)
  fail(
    `${FILE} no longer pins the promo grant and creates the PaymentIntent where this guard can see.\n  ` +
      "The served gate is ordered BEFORE both; if they moved, teach the guard the new shape.",
  );
for (const [label, call] of [
  ["the promo pin", pinCall],
  ["`paymentIntents.create`", createCall],
])
  if (servedIf.end > call.getStart(sf))
    fail(
      `the served gate runs AFTER ${label}.\n  ` +
        "D5: a refused attempt pins nothing and creates nothing at Stripe — the gate (and its\n  " +
        "refusal) must END before either begins.",
    );

process.stdout.write(
  `${c.green("clean")}${c.dim(" — each asked once, refusing and freeing the lock: the parked door, then the served gate on its awaited read, after the supersede and before the pin and Stripe")}\n`,
);
