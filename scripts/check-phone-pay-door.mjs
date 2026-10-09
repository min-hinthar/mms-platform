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
 *   3. It runs BEFORE the shipped unsent refusal (`payBlockedByUnsent`), so a parked door is refused
 *      before any further read is spent on the attempt — and so PD10's served-gate verdict, which
 *      takes the unsent refusal's slot after the flip, always finds the parked refusal above it.
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

process.stdout.write("phone-pay door — answered after the supersede, before the unsent refusal … ");
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
const branch = doorIf.thenStatement;
const branchStmts = ts.isBlock(branch) ? branch.statements : [branch];
const returnAt = branchStmts.findIndex((s) => ts.isReturnStatement(s));
if (returnAt < 0)
  fail(
    "the parked-door branch does not RETURN.\n  " +
      "A refusal that falls through still mints. The branch must end in `return NextResponse.json(…)`.",
  );
const freeAt = branchStmts.findIndex(
  (s) =>
    ts.isExpressionStatement(s) &&
    ts.isAwaitExpression(s.expression) &&
    ts.isCallExpression(s.expression.expression) &&
    isNamedCall(s.expression.expression, "freeLock"),
);
if (freeAt < 0)
  fail(
    "the parked-door branch does not `await freeLock()`.\n  " +
      "Every pre-mint refusal gives the lock back under its own era (M153); a parked door that\n  " +
      "forgets to strands the table for the whole CART_LOCK_TTL_MS on a checkout it just refused.",
  );
// The blind passes on #331 — ORDER, not presence, and on EVERY path: `{ return …; await freeLock(); }`
// contains both and releases nothing (the statement after a return is dead), and
// `{ if (x) return …; await freeLock(); return …; }` releases on one path only. So no `return`
// ANYWHERE in the branch (nested blocks included; a nested function's own returns excepted) may
// begin before the awaited release's statement ends.
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
    "the parked-door branch can RETURN before it `await freeLock()`s " +
      `(line ${sf.getLineAndCharacterOfPosition(earlyReturns[0].getStart(sf)).line + 1}).\n  ` +
      "Every path out of the refusal must give the lock back first, or that path strands the table\n  " +
      "under its lock for the whole CART_LOCK_TTL_MS. Await the release, then return.",
  );

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

// ── rule 3: BEFORE the shipped unsent refusal ────────────────────────────────────────────────────
const unsentCall = theOneLive("payBlockedByUnsent", (n) => isNamedCall(n, "payBlockedByUnsent"));
if (!unsentCall)
  fail(
    `${FILE} no longer calls \`payBlockedByUnsent\`.\n  ` +
      "Phase 1b's 'Everything sent' gate (or PD10's served-gate verdict in its slot) is what this guard\n  " +
      "orders the parked door AGAINST; if it moved, teach the guard the new shape.",
  );
const unsentStmt = stmtOf(unsentCall);
if (unsentStmt === doorIf)
  fail(
    "the parked-door refusal and the unsent refusal are ONE statement.\n  " +
      "Each refusal is its own `if`, in order: the parked door first, then the unsent (or served) gate.",
  );
if (doorIf.end > unsentStmt.getStart(sf))
  fail(
    "the parked-door refusal runs AFTER the unsent refusal.\n  " +
      "PD2: a parked door is refused before any further read is spent on the attempt, and PD10's\n  " +
      "served-gate verdict takes the unsent slot AFTER the flip — it must always find the parked\n  " +
      "refusal above it. Move the `if (phonePayParked(…))` block above the `payBlockedByUnsent(` one.",
  );

process.stdout.write(
  `${c.green("clean")}${c.dim(" — asked once, refusing and freeing the lock, after the awaited supersede, before the unsent gate")}\n`,
);
