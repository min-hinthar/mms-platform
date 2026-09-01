#!/usr/bin/env node
/**
 * M124 — the two facts the attempt-token design rests on that NO TEST CAN REACH.
 *
 * The token closes a money-path race: an abandoned tab's `pagehide` beacon used to satisfy
 * `locked_by = uid` against the LIVE tab and clear its promo pin, which — landing between capture
 * and the fulfilment webhook — strands a charged card with no order. The mechanism is sound and
 * unit-tested in `lib/pay-attempt.test.ts`. What is NOT testable is the wiring, and the wiring is
 * where it dies silently:
 *
 *   1. `create-intent` must RETURN the token. Lose that one property and `readPayAttempt` yields
 *      `attempt: null`, both abandon exits fail closed by design, and every abandoned checkout holds
 *      its table's cart for the full `CART_LOCK_TTL_MS` — with green tests, a green build, and
 *      nothing in the logs. The route has no test file (`app/api/**` is outside MONEY_PATHS and
 *      outside `verify:slice`'s mutant set), so nothing else can see it go.
 *   2. Nothing may call `mms_release_promo_grant_for_holder`. It matches on uid alone and cannot
 *      tell one diner's two tabs apart; re-introducing a call anywhere re-opens M124 exactly. *
 * PARSED, not scanned (LEARNINGS #60). A substring search for `attempt` is satisfied by the very
 * comment that explains it; a search for the RPC name matches the sentence forbidding it.
 *
 * Red-first: delete `attempt: attemptEra` from the 200 body, rebind it to anything else, or call
 * `_for_holder` anywhere — literally, through a const, or dynamically — and this exits 1 naming
 * which rule broke.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INTENT = "apps/qr/app/api/stripe/create-intent/route.ts";
const BANNED_RPC = "mms_release_promo_grant_for_holder";

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const parse = (rel) =>
  ts.createSourceFile(
    rel,
    readFileSync(path.join(ROOT, rel), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/** Every node in the file. ⚠️ The visitor MUST return undefined — `ts.forEachChild` is a SEARCH
 *  primitive and stops at the first truthy return, which would silently walk a sliver of the file. */
const allNodes = (sf) => {
  const out = [];
  (function walk(n) {
    out.push(n);
    ts.forEachChild(n, (child) => {
      walk(child);
    });
  })(sf);
  return out;
};

const fail = (msg) => {
  process.stdout.write(`${c.red("✗")}\n\n  ${msg}\n\n`);
  process.exit(1);
};

process.stdout.write("pay attempt — returned, era-scoped, released once … ");

// ── 1. create-intent's success body carries the attempt token ────────────────────────────────────
const intentSf = parse(INTENT);
const intentNodes = allNodes(intentSf);

/** `NextResponse.json({ … })` calls whose first argument is an object literal. */
const jsonBodies = intentNodes
  .filter(
    (n) =>
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "json" &&
      n.arguments.length > 0 &&
      ts.isObjectLiteralExpression(n.arguments[0]),
  )
  .map((n) => n.arguments[0]);

const propNames = (obj) =>
  obj.properties
    .map((p) =>
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name
        ? p.name.getText(intentSf)
        : null,
    )
    .filter(Boolean);

// The SUCCESS body is the one that hands back a client secret — identified by what it CONTAINS, not
// by its position in the file, so re-ordering the route cannot re-point this assertion.
const successBodies = jsonBodies.filter((o) => propNames(o).includes("clientSecret"));

if (successBodies.length === 0) {
  fail(
    `${INTENT} has no \`NextResponse.json({ clientSecret … })\` success body.\n  ` +
      "If the route's shape changed, teach this guard the new one — do not delete it. The rule it\n  " +
      "carries (the client must be told which ATTEMPT it holds) is what keeps an abandoned tab from\n  " +
      "clearing a live tab's promo pin.",
  );
}
if (successBodies.length > 1) {
  fail(
    `${INTENT} returns ${successBodies.length} bodies carrying \`clientSecret\`.\n  ` +
      "This guard cannot know which one ships, and picking the first is how a stale copy gets\n  " +
      "checked while a regressed one runs. Collapse them, or teach the guard to tell them apart.",
  );
}
// ⚠️ THE INITIALIZER, NOT THE NAME (Codex P2 on #244, and it was right about my own guard).
// Checking only that a property called `attempt` exists is the matcher-vs-behaviour mistake this
// file's own header warns about: `attempt: undefined`, `attempt: null`, or `attempt: someOtherVar`
// all keep the name and all break the token — JSON drops `undefined` entirely, so both abandon
// exits fail closed for the full TTL with the guard still green. The invariant is that the body
// returns THIS acquisition's era, so the assertion has to name the binding.
const attemptProp = successBodies[0].properties.find(
  (p) =>
    (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
    p.name &&
    p.name.getText(intentSf) === "attempt",
);
const boundToEra =
  attemptProp &&
  ((ts.isShorthandPropertyAssignment(attemptProp) && attemptProp.name.text === "attemptEra") ||
    (ts.isPropertyAssignment(attemptProp) &&
      ts.isIdentifier(attemptProp.initializer) &&
      attemptProp.initializer.text === "attemptEra"));

if (!attemptProp) {
  fail(
    `${INTENT}'s success body no longer returns \`attempt\`.\n  ` +
      "M124: without it `readPayAttempt` yields a null attempt, so BOTH abandon exits fail closed\n  " +
      "and release nothing — every abandoned checkout then holds its table's cart for the full\n  " +
      "CART_LOCK_TTL_MS, with every test green and nothing in the logs. This route has no test file\n  " +
      "(app/api/** is outside MONEY_PATHS and outside verify:slice), so this guard is the only\n  " +
      "thing that can see it go.",
  );
}
if (!boundToEra) {
  fail(
    `${INTENT} returns \`attempt\`, but not bound to \`attemptEra\`.\n  ` +
      "M124: the token must be the era THIS acquisition wrote. `attempt: undefined` is dropped by\n  " +
      "JSON entirely, `attempt: null` normalizes to null, and any other binding names an era the\n  " +
      "cart does not hold — all three leave both abandon exits failing closed for the full\n  " +
      "CART_LOCK_TTL_MS while every check stays green. If the variable was renamed, teach the guard\n  " +
      "the new name; do not relax it to a name-only check.",
  );
}

// ── 2. nothing calls the uid-only release, ANYWHERE, alive or dead ───────────────────────────────
// An ABSENCE rule, so a copy parked in `{false && …}` FAILS rather than being excused: dead code is
// a revert away from live, and the whole point is that this predicate can never be reached again.
// (A copy inside a // comment is genuinely fine — comments are not AST nodes, so they never appear
// here. That asymmetry is deliberate: prose describing the ban is not a call.)
const sourceFiles = execFileSync(
  "git",
  ["ls-files", "apps/**/*.ts", "apps/**/*.tsx", "packages/**/*.ts", "packages/**/*.tsx"],
  { cwd: ROOT, encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean)
  .filter((f) => !f.endsWith(".d.ts"));

// ⚠️ A FLOOR, because an ABSENCE rule that reads zero files prints the same word as a clean one.
// If the pathspecs ever stop matching — a layout move out of `apps/`/`packages/`, a workspace
// rename, a future `src/` root — `git ls-files` exits 0 with empty output, `offenders` stays empty,
// and this would report the banned RPC "unreachable" having inspected nothing. The repo already
// codified this counter-rule one file over (`check-money-coverage`'s coverage floors); the number
// is deliberately far below the real count so ordinary churn never trips it.
const FILE_FLOOR = 200;
if (sourceFiles.length < FILE_FLOOR) {
  fail(
    `the absence scan enumerated only ${sourceFiles.length} source files (floor ${FILE_FLOOR}).\n  ` +
      "That is not a clean result, it is a BLIND one: `git ls-files` exits 0 with empty output when\n  " +
      "its pathspecs stop matching, so this rule would report `" +
      BANNED_RPC +
      "` unreachable\n  having read nothing. Fix the pathspecs (or lower the floor deliberately, with a reason).",
  );
}

/**
 * Does this `.rpc()` first argument name the banned function?
 *
 * ⚠️ A STRING-LITERAL CHECK IS NOT ENOUGH (Codex P2 on #244). `const fn = "mms_release_…"; db.rpc(fn)`
 * is an executable call to the banned RPC that a literal-only matcher waves straight through, so the
 * "unreachable" invariant this file advertises could regress with CI green — the guard-falsification
 * class, in the guard written to prevent it.
 *
 * So: literals (quoted and no-substitution template) match directly; a bare identifier is RESOLVED
 * against const declarations in the same file; and anything still unresolved is treated as a MATCH,
 * because an absence rule cannot afford to assume. That last arm can only ever produce a false
 * positive on a dynamic RPC name — which is itself worth a human look on a money path, and is
 * silenced by naming the function inline.
 */
const rpcNameMatches = (sf, arg) => {
  if (ts.isStringLiteralLike(arg)) return arg.text === BANNED_RPC;
  if (ts.isIdentifier(arg)) {
    let resolved;
    for (const n of allNodes(sf)) {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === arg.text &&
        n.initializer &&
        ts.isStringLiteralLike(n.initializer)
      ) {
        resolved = n.initializer.text;
      }
    }
    // Resolved to something else → genuinely not this function. Unresolvable → assume the worst.
    return resolved === undefined ? true : resolved === BANNED_RPC;
  }
  // A template with substitutions, a call, a member access — cannot be read statically.
  return true;
};

const offenders = [];
for (const rel of sourceFiles) {
  const sf = parse(rel);
  for (const n of allNodes(sf)) {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "rpc" &&
      n.arguments.length > 0 &&
      rpcNameMatches(sf, n.arguments[0])
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      offenders.push(`${rel}:${line + 1}`);
    }
  }
}
if (offenders.length) {
  fail(
    `\`${BANNED_RPC}\` is called again: ${offenders.join(", ")}.\n  ` +
      "M124: it matches on `locked_by = p_uid` ALONE, and `acquireCartLock` lets the SAME diner\n  " +
      "re-acquire with a fresh era — so one diner's abandoned tab satisfies the predicate against\n  " +
      "their LIVE tab and clears its pin. Landing between capture and the fulfilment webhook, that\n  " +
      "re-derives without the pin and strands a charged card with no order. Use\n  " +
      "`releasePayAttempt(cartId, uid, era)`, which names the attempt.",
  );
}

process.stdout.write(
  `${c.green("clean")}${c.dim(` — token bound to attemptEra · ${BANNED_RPC} unreachable across ${sourceFiles.length} files`)}\n`,
);
