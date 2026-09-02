#!/usr/bin/env node
/**
 * J4 (residual) — the one fact `cart-freeze.ts` rests on that no unit test can reach.
 *
 * `cartFreeze` blocks edits for peer / self / held alike because it MIRRORS the server: every
 * refusal in `apps/qr/lib/cart.ts` is bare `locked`, with no comparison to the caller. That mirror
 * is a claim about a DIFFERENT file, and `cart-freeze.test.ts` cannot see it — it asserts the mirror
 * against a hand-written `serverRefuses` predicate, which is exactly the "transcribed from prose"
 * shape this repo bans. If someone narrows a server guard to `if (locked && lockedBy !== uid)`, the
 * unit test stays green and the client silently starts OVER-blocking: a diner refused edits on a
 * cart the server would happily accept, on the screen that takes money. Over-blocking is as
 * expensive as under-blocking — the delivery app learned that when a bare `!gate.isOpen` folded into
 * a submit gate disabled Place Order for an entire valid window with no escape.
 *
 * So this guard reads the SERVER and asserts three things about every cart mutation:
 *   1. it refuses on the lock at all,
 *   2. it refuses BEFORE it writes, and
 *   3. its condition is NOT narrowed by a holder comparison.
 *
 * PARSED, never scanned (LEARNINGS #60). A commented-out guard and a `{false && …}` branch both
 * satisfy a substring search and neither ships the behaviour; neither produces the AST node this
 * looks for. Sequencing is asserted as STATEMENT ORDER INSIDE THE FUNCTION BODY — not lexical
 * position in the file — so moving a write above the guard fails even if the text still reads fine.
 *
 * Red-first, all four watched: delete `if (locked) throw` from a mutation → fails rule 1; move it
 * below the `.update(` → fails rule 2; comment it out → fails rule 1 (comments are not AST nodes);
 * narrow it to `if (locked && lockedBy !== uid)` → fails rule 3, which is the whole point.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CART = "apps/qr/lib/cart.ts";

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const sf = ts.createSourceFile(
  CART,
  readFileSync(path.join(ROOT, CART), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

const fail = (msg) => {
  process.stdout.write(`${c.red("✗")}\n\n  ${msg}\n\n`);
  process.exit(1);
};

/** ⚠️ `ts.forEachChild` is a SEARCH primitive — a visitor returning truthy ABORTS the walk. */
const walk = (n, fn) => {
  fn(n);
  ts.forEachChild(n, (child) => {
    walk(child, fn);
  });
};

const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

/** Does this expression reference the identifier `name` anywhere inside it? */
const references = (node, name) => {
  let hit = false;
  walk(node, (n) => {
    if (ts.isIdentifier(n) && n.text === name) hit = true;
  });
  return hit;
};

/** A statement that WRITES: a PostgREST mutation, an RPC, or a helper that performs one.
 *
 * ⚠️ THE HELPERS ARE NOT OPTIONAL (Codex P2 on #246). `addItem` writes through `insertOrIncLine`,
 * so a direct-call-only matcher gave it `writeAt === Infinity` and made the ordering rule VACUOUS
 * for the highest-traffic mutation in the file: moving its lock refusal below the helper left this
 * check green while the cart was mutated before the refusal.
 *
 * A name list is the weak shape this repo warns about, so it is BOUND: every helper below must be
 * imported into `cart.ts`, and the check fails if one is not. A rename or a removed import breaks
 * the build of this guard rather than silently shrinking its coverage. */
const WRITE_CALLS = new Set(["update", "insert", "upsert", "delete", "rpc"]);
const WRITE_HELPERS = new Set(["insertOrIncLine", "touchCart"]);

/**
 * Does the THEN branch of this `if` refuse — throw, or return a value?
 *
 * ⚠️ THE THEN BRANCH ONLY (blind adversarial pass on #246). Walking the whole `IfStatement` accepted
 * the refusal sitting in the ELSE clause: `if (locked) { console.warn(…) } else { return { ok:false } }`
 * passed, while the function wrote on a frozen cart and refused on an editable one — the same
 * inversion `positivelyGuards` catches for the condition, arriving through the branch instead.
 */
const thenBranchRefuses = (ifStmt) => {
  let hit = false;
  walk(ifStmt.thenStatement, (n) => {
    if (ts.isThrowStatement(n)) hit = true;
    if (ts.isReturnStatement(n) && n.expression) hit = true;
  });
  return hit;
};

// The helper names are BOUND to the file: each must actually be imported into cart.ts. A rename or a
// dropped import fails here instead of quietly narrowing what counts as a write.
const imported = new Set();
walk(sf, (n) => {
  if (ts.isImportSpecifier(n)) imported.add(n.name.text);
});
const unboundHelpers = [...WRITE_HELPERS].filter((h) => !imported.has(h));
if (unboundHelpers.length)
  fail(
    `these WRITE_HELPERS are not imported into ${CART}: ${unboundHelpers.join(", ")}.\n  ` +
      "A helper name that matches nothing silently shrinks what this guard counts as a write, which\n  " +
      "is how the ordering rule goes vacuous. Update the names to match the imports.",
  );

// ── the DERIVATION, one file upstream ────────────────────────────────────────────────────────────
// Every `locked` the eleven mutations read comes from `assertCartMember`, which computes it in
// `authz.ts`. Narrowing it THERE narrows all eleven at once and this guard, reading only `cart.ts`,
// would never see it (blind adversarial pass on #246). So the derivation is checked too: the
// expression assigned to the returned `locked` field must not reference a holder identity.
const AUTHZ = "apps/qr/lib/authz.ts";
const authzSf = ts.createSourceFile(
  AUTHZ,
  readFileSync(path.join(ROOT, AUTHZ), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

const authzWalk = (n, fn) => {
  fn(n);
  ts.forEachChild(n, (c) => {
    authzWalk(c, fn);
  });
};

let lockedInit = null;
let lockedFieldSeen = false;
authzWalk(authzSf, (n) => {
  if (ts.isPropertyAssignment(n) && n.name.getText(authzSf) === "locked") {
    lockedFieldSeen = true;
    // Expand a plain identifier to its local initializer, same move as the condition above.
    if (ts.isIdentifier(n.initializer)) {
      authzWalk(authzSf, (d) => {
        if (
          ts.isVariableDeclaration(d) &&
          ts.isIdentifier(d.name) &&
          d.name.text === n.initializer.text &&
          d.initializer
        )
          lockedInit = d.initializer;
      });
    } else {
      lockedInit = n.initializer;
    }
  }
});

if (!lockedFieldSeen)
  fail(
    `${AUTHZ} no longer returns a \`locked\` field, or returns it in a shape this cannot read.\n  ` +
      "That field is the single source every cart mutation refuses on. A guard that cannot find it\n  " +
      "is blind, not clean — teach it the new shape.",
  );

for (const holder of ["locked_by", "lockedBy", "uid"]) {
  if (lockedInit && references(lockedInit, holder))
    fail(
      `${AUTHZ} derives \`locked\` using \`${holder}\`.\n  ` +
        "That narrows the lock at its SOURCE, so all 11 cart mutations start excusing the holder at\n  " +
        "once while every per-function guard below still looks correct — and\n  " +
        "`apps/qr/lib/cart-freeze.ts` keeps blocking, making the CLIENT the stricter side. If this is\n  " +
        "deliberate, `cartFreeze` and its parity test change in the SAME commit.",
    );
}

process.stdout.write("freeze parity — the client mirrors the server's lock guard … ");

// A function is SUBJECT when it receives the lock fact — i.e. destructures `locked` out of either
// authorization helper. That is the behavioural definition: the server handed it the lock, so it is
// answerable for refusing on it.
//
// ⚠️ WHY NOT "calls assertCartMember AND writes", which the first draft used: it silently checked 6
// of the 11 lock-bearing mutations. (`setQty` and `assignLine` write DIRECTLY — an earlier draft of
// this comment claimed otherwise and was wrong; they dropped out for a different reason. `addItem`
// is the one that writes only through `insertOrIncLine`, which is why WRITE_HELPERS exists.) A guard
// that inspects half its subjects prints the same word as one that inspects all of them.
//
// The cost of this definition is that deleting the `locked` binding drops a function OUT of the set
// rather than failing it — so EXPECTED_SUBJECTS below names the set and fails on any disappearance,
// which a count could not do.
// (`releasePayLock` needs no entry: it destructures only `uid`, never `locked`, so it is not a
// subject in the first place. An exemption for it was written, never fired, and the dead-exemption
// rule below caught it on the first run — which is the rule earning its keep immediately.)
const EXEMPT = new Map([
  [
    "getCartView",
    "a READ. It destructures `locked` precisely to return it to the client — that value is what " +
      "feeds `cartFreeze`. Refusing here would break the screen this slice exists to fix.",
  ],
]);

const subjects = [];
const exempted = [];
walk(sf, (n) => {
  if (!ts.isFunctionDeclaration(n) || !n.body || !n.name) return;
  let bindsLocked = false;
  walk(n, (d) => {
    if (
      ts.isVariableDeclaration(d) &&
      ts.isObjectBindingPattern(d.name) &&
      d.initializer &&
      (references(d.initializer, "assertCartMember") ||
        references(d.initializer, "assertCartItemMember")) &&
      d.name.elements.some((e) => ts.isIdentifier(e.name) && e.name.text === "locked")
    )
      bindsLocked = true;
  });
  // `setKioskTip` keeps the whole authz object and reads `authz.locked`. Count that too — but BIND
  // the property access to the authz result, never match `<anything>.locked`.
  //
  // A loose `*.locked` matched `refusedPromoReason`, which reads `cart.locked` off a SELECT to
  // explain why a write was refused. That is a diagnostic read of a column, not an enforcement of
  // the lock, and demanding a refusal there is nonsense. Bind first, then match — LEARNINGS #60.
  if (!bindsLocked) {
    const authzVars = new Set();
    walk(n, (d) => {
      if (
        ts.isVariableDeclaration(d) &&
        ts.isIdentifier(d.name) &&
        d.initializer &&
        (references(d.initializer, "assertCartMember") ||
          references(d.initializer, "assertCartItemMember"))
      )
        authzVars.add(d.name.text);
    });
    walk(n, (d) => {
      if (
        ts.isPropertyAccessExpression(d) &&
        d.name.text === "locked" &&
        ts.isIdentifier(d.expression) &&
        authzVars.has(d.expression.text)
      )
        bindsLocked = true;
    });
  }
  if (!bindsLocked) return;
  if (EXEMPT.has(n.name.text)) {
    exempted.push(n.name.text);
    return;
  }
  subjects.push(n);
});

// ⚠️ EVERY EXEMPTION MUST FIRE. A stale exemption is worse than none: it reads as a considered
// decision while silently excusing a function that no longer exists (or was renamed), and the next
// reader trusts the reason. If one stops matching, this fails and the entry gets deleted or fixed.
const deadExemptions = [...EXEMPT.keys()].filter((k) => !exempted.includes(k));
if (deadExemptions.length)
  fail(
    `these exemptions never fired: ${deadExemptions.join(", ")}.\n  ` +
      "Either the function was renamed/removed, or the selector stopped matching it. A documented\n  " +
      "exemption that matches nothing excuses nothing and misleads the next reader — delete it or\n  " +
      "fix the selector.",
  );

// THE EXPECTED SET, not a floor (Codex P2 on #246). A floor of 9 against a measured 11 let one or
// two functions vanish from `subjects` silently — deleting both the `locked` binding and the guard
// from `addItem` left ten subjects and this check still printed clean, which is precisely the
// regression the floor was supposed to catch.
//
// MEASURED, never transcribed: produced by instrumenting this file to print
// `subjects.map(f => f.name.text).sort()` and pasting the output. Adding a lock-bearing mutation is
// meant to fail here once — add the name deliberately, so nobody adds one without noticing that it
// now owes a refusal.
const EXPECTED_SUBJECTS = [
  "addItem",
  "applyPromo",
  "applyReward",
  "assignLine",
  "clearReward",
  "makeItNow",
  "sendToKitchen",
  "setKioskTip",
  "setLineFulfillment",
  "setQty",
  "undoFire",
];

const found = subjects.map((f) => f.name.text).sort();
const missing = EXPECTED_SUBJECTS.filter((n) => !found.includes(n));
const extra = found.filter((n) => !EXPECTED_SUBJECTS.includes(n));

if (missing.length)
  fail(
    `these lock-bearing mutations disappeared from the subject set: ${missing.join(", ")}.\n  ` +
      "A function drops out when it stops destructuring `locked` from its authz call — which IS the\n  " +
      "defect, because it can no longer refuse a frozen cart — or when the selector stopped matching\n  " +
      "a shape it used to. Fix the code, or teach the selector; do not delete the name to go green.",
  );

if (extra.length)
  fail(
    `new lock-bearing mutations appeared: ${extra.join(", ")}.\n  ` +
      "Each of these now receives the lock fact and therefore owes a refusal on it. They ARE being\n  " +
      "checked by the rules below — this failure is a deliberate speed bump so a new cart mutation\n  " +
      "cannot join silently. Add the name to EXPECTED_SUBJECTS once you have read its guard.",
  );

/**
 * The first position inside `fn` at which `pred` holds, in SOURCE ORDER, skipping nested function
 * bodies.
 *
 * Source order inside one function body IS execution order for the straight-line awaited code these
 * mutations are written in — and it is what lets a guard nested inside a `try { … }` count, which
 * the first draft got wrong: `setKioskTip` guards on `authz.locked` inside a try, and a
 * top-level-statements scan reported it unguarded. Nested function bodies are skipped because a
 * callback's position says nothing about when it runs.
 *
 * ⚠️ WHAT THIS DOES NOT PROVE: reachability. A guard parked inside `if (false)` would still be
 * found. That is deliberate scope — this file asserts SHAPE and ORDER across two files; it is not a
 * reachability prover. Stated rather than papered over.
 */
const firstPos = (fn, pred) => {
  let best = Infinity;
  const visit = (n) => {
    if (
      n !== fn &&
      (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))
    )
      return;
    if (pred(n)) best = Math.min(best, n.getStart(sf));
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(fn);
  return best;
};

/**
 * Is every `locked` reference in this expression in a POSITIVE position?
 *
 * ⚠️ POLARITY WAS UNCHECKED (Codex P2 on #246, and it is the sharpest of the five). The matcher used
 * to accept any `if` whose condition merely MENTIONED `locked` and whose body refused — so
 * `if (!locked) throw` passed clean while inverting the invariant outright: the function would then
 * refuse only EDITABLE carts and write happily on frozen ones. A guard that green-lights the exact
 * negation of the rule it enforces is worse than no guard.
 *
 * Refuses ambiguity rather than guessing: a `locked` under any `!`, or compared with `===`/`!==`,
 * is not a shape this can call positive, so it fails and asks for a human. Odd/even `!` nesting is
 * deliberately NOT unwound — `!!locked` is not idiomatic here and treating it as positive would be
 * cleverness in the wrong direction.
 */
const positivelyGuards = (expr) => {
  let ok = false;
  let ambiguous = false;
  const visit = (n, negated) => {
    if (
      (ts.isIdentifier(n) && n.text === "locked") ||
      (ts.isPropertyAccessExpression(n) && n.name.text === "locked")
    ) {
      if (negated) ambiguous = true;
      else ok = true;
      if (ts.isPropertyAccessExpression(n)) return; // don't descend into `x.locked`'s own name node
    }
    if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) {
      visit(n.operand, !negated);
      return;
    }
    if (ts.isBinaryExpression(n)) {
      const k = n.operatorToken.kind;
      const isEquality =
        k === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        k === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        k === ts.SyntaxKind.EqualsEqualsToken ||
        k === ts.SyntaxKind.ExclamationEqualsToken;
      if (isEquality && (references(n.left, "locked") || references(n.right, "locked")))
        ambiguous = true;
    }
    ts.forEachChild(n, (c) => {
      visit(c, negated);
    });
  };
  visit(expr, false);
  return ok && !ambiguous;
};

/** The lock refusal: `if (<condition testing `locked` POSITIVELY>) throw|return <value>`. */
const isLockRefusal = (n) =>
  ts.isIfStatement(n) && positivelyGuards(n.expression) && thenBranchRefuses(n);

/**
 * A write, for the ORDERING rule.
 *
 * ⚠️ MUST STAY IN STEP WITH `isWrite` ABOVE — the helper arm was added to `isWrite` and not here,
 * and the ordering rule silently kept its old, direct-call-only reach. Caught only by insisting on
 * watching the fix fail: the relocation test stayed green after the "fix" landed. Two predicates
 * for one concept is how that happens, so both consult the same two sets.
 */
const isWriteCall = (n) =>
  ts.isCallExpression(n) &&
  ((ts.isPropertyAccessExpression(n.expression) && WRITE_CALLS.has(n.expression.name.text)) ||
    (ts.isIdentifier(n.expression) && WRITE_HELPERS.has(n.expression.text)));

const problems = [];
for (const fn of subjects) {
  const name = fn.name?.text ?? "(anonymous)";

  const guardAt = firstPos(fn, isLockRefusal);
  const writeAt = firstPos(fn, isWriteCall);

  if (guardAt === Infinity) {
    problems.push(
      `${name} (${CART}:${line(fn)}) has no lock refusal at all — no \`if (… locked …) throw/return\` anywhere in its body.`,
    );
    continue;
  }
  if (writeAt !== Infinity && guardAt > writeAt) {
    problems.push(
      `${name} (${CART}:${line(fn)}) writes before it refuses the lock — the guard runs AFTER the write.`,
    );
    continue;
  }

  // Rule 3 — THE ONE THIS FILE EXISTS FOR. The condition must not be narrowed by a holder
  // comparison. `cartFreeze` blocks whenever `locked` is true; if the server starts excusing the
  // holder, the client becomes the STRICTER one and over-blocks a cart the server would accept.
  let guardNode = null;
  const findGuard = (n) => {
    if (
      n !== fn &&
      (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))
    )
      return;
    if (!guardNode && isLockRefusal(n) && n.getStart(sf) === guardAt) guardNode = n;
    ts.forEachChild(n, (c) => {
      findGuard(c);
    });
  };
  findGuard(fn);

  // ⚠️ RESOLVE INTERMEDIATE VARIABLES FIRST (blind adversarial pass on #246). A bare
  // identifier-text walk over the condition was evaded by one local:
  //
  //     const heldByOther = lockedBy !== uid;
  //     if (locked && heldByOther) throw …          // no `lockedBy` in the condition → passed clean
  //
  // So every identifier in the condition that resolves to a local initializer is expanded once and
  // the holder search runs over that too. `uid` joins the list — it is the identifier the real
  // narrowing would compare against, and it was missing.
  const condExpansion = [guardNode.expression];
  walk(guardNode.expression, (n) => {
    if (!ts.isIdentifier(n)) return;
    walk(fn, (d) => {
      if (
        ts.isVariableDeclaration(d) &&
        ts.isIdentifier(d.name) &&
        d.name.text === n.text &&
        d.initializer
      )
        condExpansion.push(d.initializer);
    });
  });

  for (const holder of ["lockedBy", "locked_by", "mySeat", "uid"]) {
    if (guardNode && condExpansion.some((e) => references(e, holder)))
      problems.push(
        `${name} (${CART}:${line(guardNode)}) narrows its lock refusal by \`${holder}\`.\n    ` +
          "That excuses the lock HOLDER server-side — but `apps/qr/lib/cart-freeze.ts` blocks edits\n    " +
          "for every freeze, mirroring a bare `locked`. The two now disagree, and the CLIENT is the\n    " +
          "stricter one: a diner refused edits on a cart the server would accept, on the pay screen.\n    " +
          "Change `cartFreeze` in the SAME commit (and its parity test), or leave the guard bare.",
      );
  }
}

if (problems.length) fail(problems.join("\n\n  "));

process.stdout.write(
  `${c.green("clean")}${c.dim(` — ${subjects.length} lock-bearing mutations, each refusing on bare \`locked\` before it writes` + (exempted.length ? ` · exempt: ${exempted.join(", ")}` : ""))}\n`,
);
