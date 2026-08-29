#!/usr/bin/env node
/**
 * M70 — the fourth cheap grep: is the promo grant actually PINNED, and pinned in time?
 *
 * The whole of M70's SQL half is covered by `supabase/tests/m70_promo_grant_survives_settlement_test.sql`
 * on a real stack in CI. Its TypeScript half is two lines in `create-intent`, and neither is
 * reachable by any unit test: the route has no test file, and it sits under a
 * `verify:slice-exempt` line, so `check-money-coverage` waves it through. Delete the pin call and
 * every gate in this repo stays green while M70 silently regresses — a promo lapsing between
 * authorize and capture would once again raise the live total above the hold and cancel the order.
 *
 * Two rules, and the second is the one that is easy to lose in a refactor:
 *
 *   1. `create-intent` calls `mms_pin_promo_grant`.
 *   2. It calls it BEFORE `getCartTotals`. Deriving first would mint the Stripe amount from the
 *      LIVE promo value and then pin a possibly different one a moment later — the hold and the
 *      pin would disagree, which is the exact divergence M70 exists to remove.
 *
 * A grep is the right instrument here for the same reason `check-photo-filter` is: the fact is
 * structural and cheap to state, and the alternative is a 400-line mock scaffold that would mostly
 * exercise Stripe plumbing.
 *
 * Red-first: delete the `.rpc("mms_pin_promo_grant"` line, or move it below `getCartTotals(`, and
 * this exits 1 naming which rule broke.
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

/**
 * PARSED, not scanned — and the third attempt at this, which is the point.
 *
 * The question this guard asks is "does executable code call `mms_pin_promo_grant`, and does it do
 * so before the amount is derived". Text search cannot answer it, and each textual near-miss shipped
 * a FALSE CLEAN over a live money regression:
 *
 *   1. `indexOf` matched the RPC name inside a comment, so commenting the pin out read as clean
 *      (Codex P1, #241 round 1).
 *   2. A hand-rolled comment/string scanner replaced it, and a regex literal containing a quote
 *      defeated it: `if (/['"]/.test(cartId)) …` opened fabricated string state, an apostrophe in a
 *      following comment closed it, and the rest of that comment was scanned as code — so
 *      `// don't await db.rpc("mms_pin_promo_grant", …)` read as clean again (Codex P1, round 2).
 *
 * Both failures are the same mistake at different resolutions: approximating a JavaScript parser.
 * The second one is instructive because the scanner was *more* careful than the first and still lost
 * — regex-versus-division cannot be decided without the preceding token, and that is the doorway to
 * the next exploit. So this asks the compiler instead. `typescript` is already a dependency, the
 * parse is a few milliseconds on one file, and **comments are not AST nodes** — which makes
 * "is this executable?" structural rather than textual, and closes the whole class rather than the
 * two instances that were found.
 */
const sf = ts.createSourceFile(FILE, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/**
 * Every call expression in the file, with positions, so the ordering rule can compare them.
 *
 * ⚠️ THE VISITOR MUST RETURN UNDEFINED. `ts.forEachChild` is a SEARCH primitive: it stops at the
 * first callback that returns a truthy value and hands that value back. A visitor written as
 * `(c) => walk(c, out)` therefore aborts after the first child, because `out` is a non-empty array
 * — the walk silently covers a sliver of the file and the guard reports clean on almost anything.
 * Caught here by the guard failing on a file that plainly contains the call; it would otherwise
 * have been the third false CLEAN in a row.
 */
const calls = [];
(function walk(node) {
  if (ts.isCallExpression(node)) calls.push(node);
  ts.forEachChild(node, (c) => {
    walk(c);
  });
})(sf);

/** `x.rpc("<name>")` — a real call, with the name as a genuine string literal argument. */
const isRpcCall = (n, name) =>
  ts.isPropertyAccessExpression(n.expression) &&
  n.expression.name.text === "rpc" &&
  n.arguments.length > 0 &&
  ts.isStringLiteralLike(n.arguments[0]) &&
  n.arguments[0].text === name;

/** A bare or member call whose callee is named `getCartTotals`. */
const isNamedCall = (n, name) =>
  (ts.isIdentifier(n.expression) && n.expression.text === name) ||
  (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === name);

const pinCall = calls.find((n) => isRpcCall(n, "mms_pin_promo_grant"));
const totalsCall = calls.find((n) => isNamedCall(n, "getCartTotals"));
/**
 * The rule is SEQUENCING, not lexical order — Codex P1 on #241 round 3.
 *
 * Comparing `getStart()` positions proves only that the pin is written above the derivation, and
 * two refactors satisfy that while destroying the guarantee:
 *
 *   • `await Promise.all([db.rpc("mms_pin_promo_grant", …), getCartTotals(…)])` — the pin is FIRST
 *     in the AST and the two run concurrently, so the amount can be derived from a promo value the
 *     pin has not frozen yet;
 *   • a fire-and-forget `db.rpc(…)` statement above the derivation — earlier in the file, and with
 *     no guarantee it has completed, or completed successfully, by the time totals are read.
 *
 * Both recreate exactly the hold-versus-pinned-grant divergence M70 exists to remove. So the guard
 * asks for what the rule actually requires: the pin is AWAITED, and it is awaited in a statement
 * that FINISHES before the statement deriving the amount begins. Different statements is what rules
 * out the `Promise.all` shape — concurrency inside one statement is invisible to position alone.
 */
const stmtOf = (node) => {
  for (let n = node; n; n = n.parent) if (ts.isStatement(n)) return n;
  return undefined;
};
/** Awaited somewhere between the call and the statement that contains it. */
const isAwaited = (call) => {
  for (let n = call.parent; n && !ts.isStatement(n); n = n.parent) {
    if (ts.isAwaitExpression(n)) return true;
  }
  return false;
};

const pinStmt = pinCall ? stmtOf(pinCall) : undefined;
const totalsStmt = totalsCall ? stmtOf(totalsCall) : undefined;
const pinAt = pinCall ? pinCall.getStart(sf) : -1;
const totalsAt = totalsCall ? totalsCall.getStart(sf) : -1;

process.stdout.write("promo grant pin — taken, and taken before the amount … ");

const fail = (msg) => {
  process.stdout.write(`${c.red("✗")}\n\n  ${msg}\n\n`);
  process.exit(1);
};

if (pinAt === -1) {
  fail(
    `${FILE} no longer calls \`mms_pin_promo_grant\`.\n  ` +
      "M70: without the pin, a promo that lapses between authorization and capture (a sold-out\n  " +
      "void dropping the subtotal under min_subtotal_cents, a valid_until passing, an admin\n  " +
      "flipping active) raises the live total above the hold and planCapture cancels the whole\n  " +
      "order. Nothing else in the gate catches this — the route has no test file and carries a\n  " +
      "verify:slice-exempt line.",
  );
}

if (totalsAt === -1) {
  fail(
    `${FILE} no longer calls \`getCartTotals(\`.\n  ` +
      "This guard compares the two call sites; if the amount is derived some other way now, teach\n  " +
      "the guard the new shape rather than deleting it — the ordering rule still has to hold.",
  );
}

if (pinCall && !isAwaited(pinCall)) {
  fail(
    "the promo grant pin is not AWAITED.\n  " +
      'M70: a fire-and-forget `db.rpc("mms_pin_promo_grant", …)` is earlier in the file and ' +
      "carries\n  no guarantee it has completed — or succeeded — before the amount is derived. The " +
      "hold\n  would then be minted against a promo value nothing has frozen, which is the exact\n  " +
      "divergence the pin exists to remove. Await it.",
  );
}

if (pinStmt && totalsStmt && pinStmt === totalsStmt) {
  fail(
    "the pin and the amount are derived in the SAME statement.\n  " +
      'M70: `await Promise.all([db.rpc("mms_pin_promo_grant", …), getCartTotals(…)])` puts the ' +
      "pin\n  first in the AST and runs both CONCURRENTLY, so the amount can be derived from a promo\n  " +
      "value the pin has not frozen yet. Lexical order is not sequencing. Pin in its own statement,\n  " +
      "awaited, before the one that derives the amount.",
  );
}

if (pinStmt && totalsStmt && pinStmt.end > totalsStmt.getStart(sf)) {
  fail(
    "the promo grant is pinned AFTER the amount is derived.\n  " +
      "M70: deriving first mints the Stripe amount from the LIVE promo value and then pins a\n  " +
      "possibly different one, so the hold and the pin disagree — the exact divergence the pin\n  " +
      "exists to remove. Move the `mms_pin_promo_grant` call above `getCartTotals(`.",
  );
}

process.stdout.write(`${c.green("clean")}${c.dim(" — pinned, and pinned first")}\n`);
