#!/usr/bin/env node
/**
 * M124 — the three facts the attempt-token design rests on that NO TEST CAN REACH.
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
 *      tell one diner's two tabs apart; re-introducing a call anywhere re-opens M124 exactly.
 *   3. `create-intent` must release the lock ONLY through `abandonAttempt`. Six early exits used to
 *      call a bare `releaseCartLock` and return above the pin block, leaving `locked = false` over a
 *      live pin — the state cash/Terminal/split then charge (OPEN-ITEMS M123(a′)).
 *
 * PARSED, not scanned (LEARNINGS #60). A substring search for `attempt` is satisfied by the very
 * comment that explains it; a search for the RPC name matches the sentence forbidding it.
 *
 * Red-first: delete `attempt: attemptEra` from the 200 body, or call `_for_holder` anywhere, or move
 * a `releaseCartLock` back out of `abandonAttempt`, and this exits 1 naming which rule broke.
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
if (!propNames(successBodies[0]).includes("attempt")) {
  fail(
    `${INTENT}'s success body no longer returns \`attempt\`.\n  ` +
      "M124: without it `readPayAttempt` yields a null attempt, so BOTH abandon exits fail closed\n  " +
      "and release nothing — every abandoned checkout then holds its table's cart for the full\n  " +
      "CART_LOCK_TTL_MS, with every test green and nothing in the logs. This route has no test file\n  " +
      "(app/api/** is outside MONEY_PATHS and outside verify:slice), so this guard is the only\n  " +
      "thing that can see it go.",
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

const offenders = [];
for (const rel of sourceFiles) {
  const sf = parse(rel);
  for (const n of allNodes(sf)) {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "rpc" &&
      n.arguments.length > 0 &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      n.arguments[0].text === BANNED_RPC
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

// ── 3. create-intent releases the lock only inside abandonAttempt ────────────────────────────────
const lockReleases = intentNodes.filter(
  (n) =>
    ts.isCallExpression(n) &&
    ts.isIdentifier(n.expression) &&
    n.expression.text === "releaseCartLock",
);

/** Is this node lexically inside the `abandonAttempt` initializer? */
const insideAbandon = (node) => {
  for (let n = node; n; n = n.parent) {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "abandonAttempt"
    ) {
      return true;
    }
  }
  return false;
};

const stray = lockReleases.filter((n) => !insideAbandon(n)).length;
// The outer catch releases by cart id + uid captured in `acquired`, deliberately outside the
// closure (it runs when `abandonAttempt`'s scope may never have been entered). One stray is that
// catch; more than one means an early exit has gone back to a bare release.
if (stray > 1) {
  fail(
    `${INTENT} calls \`releaseCartLock\` ${stray} times outside \`abandonAttempt\`.\n  ` +
      "M123(a′): an exit that releases the LOCK without the GRANT leaves `locked = false` over a\n  " +
      "live pin. `acquireSettlement` gates on the RAW `locked` column, so that state is exactly what\n  " +
      "admits cash / Terminal / split — each derives from `getCartTotals`, which returns the pin\n  " +
      "outright, and `mms_fulfill_cash_order` re-derives only the SUBTOTAL. The stale discount is\n  " +
      "charged, recorded, and burns a promo redemption the basket never earned. Release through\n  " +
      "`abandonAttempt`, which clears both.",
  );
}

process.stdout.write(
  `${c.green("clean")}${c.dim(` — token returned · ${BANNED_RPC} unreachable · ${lockReleases.length - stray} scoped release${lockReleases.length - stray === 1 ? "" : "s"}`)}\n`,
);
