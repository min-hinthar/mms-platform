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
 * A write — the ONE predicate, used by subject discovery AND the ordering rule.
 *
 * ⚠️ IT IS ONE PREDICATE ON PURPOSE. An earlier round added the helper arm to a second, parallel
 * matcher and not to this one, and the ordering rule silently kept its old direct-call-only reach —
 * caught only by insisting on watching the fix fail (LEARNINGS #65). Two predicates for one concept
 * is how that happens, so there is now exactly one.
 */
const isWriteCall = (n) =>
  ts.isCallExpression(n) &&
  ((ts.isPropertyAccessExpression(n.expression) && WRITE_CALLS.has(n.expression.name.text)) ||
    (ts.isIdentifier(n.expression) && WRITE_HELPERS.has(n.expression.text)));

/**
 * Does the THEN branch of this `if` refuse — throw, or return a value?
 *
 * ⚠️ THE THEN BRANCH ONLY (blind adversarial pass on #246). Walking the whole `IfStatement` accepted
 * the refusal sitting in the ELSE clause: `if (locked) { console.warn(…) } else { return { ok:false } }`
 * passed, while the function wrote on a frozen cart and refused on an editable one — the same
 * inversion `positivelyGuards` catches for the condition, arriving through the branch instead.
 *
 * ⚠️ AND NOT INTO NESTED FUNCTIONS (Codex round 2 on #246). A `throw`/`return` inside a callback
 * belongs to the CALLBACK, not to this branch — it leaves the guarded function still running and
 * still able to write:
 *
 *     if (locked) { const report = () => { throw new Error("locked"); }; }   // refuses nothing
 *
 * `firstPos` had already been taught to skip nested bodies for exactly this reason; the lesson was
 * not carried over here, which is the same "two predicates for one concept" shape that made the
 * ordering rule go vacuous a round earlier.
 */
const thenBranchRefuses = (ifStmt) => {
  // NO DESCENT AT ALL. The branch's OWN statement list must contain the exit — that is what makes
  // this an unconditional refusal rather than a possible one. Descending found the `return` inside
  // `if (shouldRefuse)` / a loop / a callback, none of which stop the function when their own
  // condition is false. `cart.ts`'s eleven refusals are all a single `throw` or `return`, so the
  // strictness costs nothing; if a legitimate shape ever needs a block, put the exit at its top level.
  const t = ifStmt.thenStatement;
  const stmts = ts.isBlock(t) ? t.statements : [t];
  return stmts.some((st) => ts.isThrowStatement(st) || (ts.isReturnStatement(st) && st.expression));
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

/**
 * Every expression `root` transitively depends on: itself, plus the initializer of every local it
 * mentions, recursively.
 *
 * ⚠️ ONE LEVEL WAS NOT ENOUGH (Codex round 5 on #246). A two-hop rename hides the narrowing from a
 * single expansion completely:
 *
 *     const heldByOther = cart.locked_by !== uid;
 *     const lockedFresh = cart.locked && heldByOther;
 *     return { locked: lockedFresh };            // one hop reaches `lockedFresh` and stops
 *
 * `locked_by` and `uid` appear nowhere in that hop, so the holder search saw a clean derivation and
 * the required check reported green on exactly the edit it exists to reject. Both the authz
 * derivation and the per-function guard condition use this now, so neither can drift from the other.
 */
const expandAliases = (root, scope, walkIn) => {
  const out = [root];
  const seen = new Set();
  const queue = [root];
  while (queue.length) {
    const cur = queue.shift();
    const names = [];
    walkIn(cur, (n) => {
      if (ts.isIdentifier(n) && !seen.has(n.text)) names.push(n.text);
    });
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      walkIn(scope, (d) => {
        if (
          ts.isVariableDeclaration(d) &&
          ts.isIdentifier(d.name) &&
          d.name.text === name &&
          d.initializer
        ) {
          out.push(d.initializer);
          queue.push(d.initializer);
        }
      });
    }
  }
  return out;
};

let lockedInits = [];
let lockedFieldSeen = false;
authzWalk(authzSf, (n) => {
  if (ts.isPropertyAssignment(n) && n.name.getText(authzSf) === "locked") {
    lockedFieldSeen = true;
    lockedInits = expandAliases(n.initializer, authzSf, authzWalk);
  }
});

if (!lockedFieldSeen)
  fail(
    `${AUTHZ} no longer returns a \`locked\` field, or returns it in a shape this cannot read.\n  ` +
      "That field is the single source every cart mutation refuses on. A guard that cannot find it\n  " +
      "is blind, not clean — teach it the new shape.",
  );

// The locals holding the `qr_carts` row. Bound by what they are READ FROM, so the terms below can be
// required as accesses ON that row rather than as identifier text (Codex round 7 on #246 — the
// FOURTH time in this file that a matcher had to be bound rather than spelled; see LEARNINGS #65).
const cartVars = new Set();
authzWalk(authzSf, (n) => {
  if (
    !ts.isVariableDeclaration(n) ||
    !ts.isObjectBindingPattern(n.name) ||
    !n.initializer ||
    !/qr_carts/.test(n.initializer.getText(authzSf))
  )
    return;
  for (const el of n.name.elements)
    if (
      ts.isIdentifier(el.name) &&
      el.propertyName &&
      ts.isIdentifier(el.propertyName) &&
      el.propertyName.text === "data"
    )
      cartVars.add(el.name.text);
});
if (!cartVars.size)
  fail(
    `${AUTHZ} — could not find the local holding the \`qr_carts\` row.\n  ` +
      "The derivation checks below are stated as accesses ON that row; without it they would fall\n  " +
      "back to matching identifier TEXT, which is the evasion they exist to close. Teach the shape.",
  );

/** Does any expression here read `<the cart row>.<field>`? */
const readsCartField = (field) =>
  lockedInits.some((e) => {
    let hit = false;
    authzWalk(e, (n) => {
      if (
        ts.isPropertyAccessExpression(n) &&
        n.name.text === field &&
        ts.isIdentifier(n.expression) &&
        cartVars.has(n.expression.text)
      )
        hit = true;
    });
    return hit;
  });

// ⚠️ AND IT MUST STILL DERIVE FROM THE DATABASE FLAG (Codex round 6 on #246). Rejecting holder
// identifiers says what the derivation may NOT contain and nothing about what it must. `locked:
// false` contains none of the forbidden names, passes clean, and unfreezes every one of the eleven
// mutations at once while `cart-freeze.ts` keeps the client read-only — the exact inversion this
// file exists to catch, arriving through absence instead of narrowing. Falsified: replacing
// `lockedFresh` with `false` printed clean.
//
// Both halves of the documented derivation are required — held AND fresh — so dropping the TTL term
// (which would freeze a cart forever on an abandoned tab) fails here too. If the mechanism genuinely
// changes, this fails once and the name is updated deliberately, like EXPECTED_SUBJECTS.
for (const [term, why] of [
  ["locked", "the `qr_carts.locked` column — the lock itself"],
  ["locked_at", "the freshness term, without which an abandoned tab freezes the cart forever"],
]) {
  if (!readsCartField(term))
    fail(
      `${AUTHZ} derives \`locked\` WITHOUT reading ${why} off the cart row.\n  ` +
        "Every cart mutation refuses on this one value, so a derivation that no longer reads the\n  " +
        "database is not a narrowing — it is an unfreeze of all eleven at once, while\n  " +
        "`apps/qr/lib/cart-freeze.ts` keeps the CLIENT read-only. If the mechanism really changed,\n  " +
        "update this check in the same commit, deliberately.",
    );
}

for (const holder of ["locked_by", "lockedBy", "uid"]) {
  if (lockedInits.some((e) => references(e, holder)))
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

/**
 * Every named function-like in the file, however it is spelled.
 *
 * ⚠️ `ts.isFunctionDeclaration` ALONE WAS A HOLE (Codex round 2 on #246). `export const setQty =
 * async (…) => {…}` is a VariableDeclaration with an ArrowFunction initializer, so the selector
 * never visited it — and because it never entered `subjects`, `EXPECTED_SUBJECTS` did not flag it
 * either: converting any of the eleven mutations to an arrow (a refactor with no behavioural intent)
 * would have removed it from the guard's reach while printing `missing:` … which at least fails.
 * The genuinely silent case is a NEW cart mutation written as an arrow: it joins the file owing a
 * lock refusal and this guard never sees it, which is precisely what the `extra:` speed bump exists
 * to prevent. Both spellings now enter the same set.
 */
const namedFunctions = [];
walk(sf, (n) => {
  if (ts.isFunctionDeclaration(n) && n.body && n.name)
    namedFunctions.push({ fn: n, name: n.name.text });
  else if (
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    n.initializer &&
    (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
  )
    namedFunctions.push({ fn: n.initializer, name: n.name.text });
});

const subjects = [];
const exempted = [];
for (const { fn: n, name: fnName } of namedFunctions) {
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
  // The locals holding an authorization result. Computed for EVERY candidate, not just the ones that
  // read `authz.locked` — `forcesRefusal` needs them too (Codex round 4 on #246), because a bare
  // `<anything>.locked` in a guard is not evidence about the AUTHORIZATION lock.
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
  if (!bindsLocked) {
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
  // ⚠️ AND THE DEFINITION MUST NOT DEPEND ON THE BINDING IT AUDITS (Codex round 3 on #246). A new
  // mutation that calls an authz helper and WRITES but never destructures `locked` had
  // `bindsLocked === false`, dropped out of `subjects` before both the expected-set and `extra`
  // checks, and — its name not yet being in EXPECTED_SUBJECTS — left this required check GREEN for
  // exactly the missing-lock regression it exists to catch. Falsified: appending an authz+write
  // `nudgeLine` with no `locked` anywhere printed clean.
  //
  // So the set is the UNION: binds the lock fact, OR authorizes and writes. The second arm alone
  // was the first draft's definition and reached only 6 of 11, which is why the first is kept —
  // together they are strictly wider than either, and a function in the second arm without a
  // refusal fails rule 1 by name instead of vanishing.
  const authorizesAndWrites = (() => {
    let authorizes = false;
    let writes = false;
    walk(n, (d) => {
      if (
        ts.isCallExpression(d) &&
        ts.isIdentifier(d.expression) &&
        (d.expression.text === "assertCartMember" || d.expression.text === "assertCartItemMember")
      )
        authorizes = true;
      if (isWriteCall(d)) writes = true;
    });
    return authorizes && writes;
  })();
  if (!bindsLocked && !authorizesAndWrites) continue;
  if (EXEMPT.has(fnName)) {
    exempted.push(fnName);
    continue;
  }
  subjects.push({ fn: n, name: fnName, authzVars });
}

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

const found = subjects.map((s) => s.name).sort();
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
 * Does `locked` being true make this whole condition true?
 *
 * ⚠️ "MENTIONED POSITIVELY" WAS NOT ENOUGH (Codex round 3 on #246, and it is the sharpest finding of
 * the round). The previous matcher accepted any condition containing one un-negated, un-compared
 * `locked`, so all three of these passed clean while the function wrote on a frozen cart:
 *
 *     if (locked && shouldRefuse) return failure;   // one false conjunct switches the guard off
 *     if (false && locked) return failure;          // dead outright
 *     if (locked && lockedBy !== uid) throw …;      // the narrowing this file exists to catch
 *
 * The property that actually matters is IMPLICATION: `locked === true` must entail the refusal. So
 * `locked` has to be reachable from the condition root through `||` alone — the three shapes the
 * server really uses (`locked`, `locked || settling`, `authz.locked || authz.settling`) all are, and
 * every conjunction, negation, comparison and dead literal is not.
 *
 * Ambiguity is refused rather than guessed: `!!locked` and `locked === true` are not idiomatic here,
 * and admitting them would be cleverness in the direction of accepting more.
 *
 * ⚠️ AND A PROPERTY ACCESS IS BOUND TO THE AUTHORIZATION RESULT (Codex round 4 on #246). A bare
 * `<anything>.locked` is not evidence about the lock this file is about: a refactor that keeps the
 * authz call but guards on some request/state object's `locked` field satisfies the shape while the
 * real lock stops preventing the write. This is the THIRD time the bind-then-match lesson has had to
 * be carried to another predicate in this same file — the subject selector's `refusedPromoReason`
 * false positive was the first (LEARNINGS #60), the nested-callback walk the second (#65) — so the
 * receiver must be a local that came out of `assertCartMember`/`assertCartItemMember`.
 */
const forcesRefusal = (expr, authzVars) => {
  const e = ts.isParenthesizedExpression(expr) ? expr.expression : expr;
  if (ts.isIdentifier(e) && e.text === "locked") return true;
  if (
    ts.isPropertyAccessExpression(e) &&
    e.name.text === "locked" &&
    ts.isIdentifier(e.expression) &&
    authzVars.has(e.expression.text)
  )
    return true;
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    return forcesRefusal(e.left, authzVars) || forcesRefusal(e.right, authzVars);
  return false;
};

/** Does this condition mention `locked` at all? Used only to tell "narrowed" from "absent". */
const mentionsLocked = (expr) => {
  let hit = false;
  walk(expr, (n) => {
    if (
      (ts.isIdentifier(n) && n.text === "locked") ||
      (ts.isPropertyAccessExpression(n) && n.name.text === "locked")
    )
      hit = true;
  });
  return hit;
};

/** The lock refusal: `if (<condition `locked` alone makes true>) throw|return <value>`. */
const isLockRefusal = (authzVars) => (n) =>
  ts.isIfStatement(n) && forcesRefusal(n.expression, authzVars) && thenBranchRefuses(n);

/** A refusal that MENTIONS the lock but does not turn on it — reported separately, by name. */
const isNarrowedRefusal = (authzVars) => (n) =>
  ts.isIfStatement(n) &&
  !forcesRefusal(n.expression, authzVars) &&
  mentionsLocked(n.expression) &&
  thenBranchRefuses(n);

/**
 * The statements that CERTAINLY execute on the way through this function's body.
 *
 * ⚠️ LEXICAL POSITION IS NOT REACHABILITY (Codex round 6 on #246). Until now this file said so in
 * `firstPos`'s docblock and left it — "it asserts SHAPE and ORDER, it is not a reachability prover"
 * — which was honest but wrong to leave, because the gap is one line wide:
 *
 *     if (false) { if (locked) return { ok: false, reason: "locked" }; }
 *
 * Wrapping any of the eleven real guards like that left all eleven reporting clean while the frozen
 * cart reached the write. A documented limitation in a REQUIRED check is still a hole.
 *
 * Dominance is approximated, deliberately, by the two shapes the file actually uses: a statement at
 * the top of the body, or a statement at the top of a `try` block that is itself at the top of the
 * body (`setKioskTip` guards inside one). Nothing nested under another `if`, a loop or a callback
 * counts, because none of those certainly runs.
 *
 * ⚠️ AND INSIDE A `try` WITH A `catch`, ONLY A `return` COUNTS. A `throw` there is caught by the
 * function's own handler and turned into whatever the catch returns — which for `setKioskTip` is
 * `{ ok: false }`, so it happens to be a refusal, and for the next function might not be. A return
 * leaves the function whatever the catch does.
 */
const dominatingStatements = (fn) => {
  if (!fn.body || !ts.isBlock(fn.body)) return [];
  const out = [];
  for (const st of fn.body.statements) {
    out.push({ node: st, guarded: false });
    if (ts.isTryStatement(st) && st.tryBlock)
      for (const inner of st.tryBlock.statements)
        out.push({ node: inner, guarded: !!st.catchClause });
  }
  return out;
};

/** The earliest DOMINATING statement matching `pred`, or Infinity. */
const firstDominating = (fn, pred, throwCountsWhenCaught = true) => {
  let best = Infinity;
  for (const { node, guarded } of dominatingStatements(fn)) {
    if (!pred(node)) continue;
    // A refusal that only throws, sitting under a live catch, does not certainly leave the function.
    if (guarded && !throwCountsWhenCaught && !branchReturns(node)) continue;
    best = Math.min(best, node.getStart(sf));
  }
  return best;
};

/** Does this `if`'s then-branch leave the function by RETURNING (not merely throwing)? */
const branchReturns = (ifStmt) => {
  const t = ifStmt.thenStatement;
  const stmts = ts.isBlock(t) ? t.statements : [t];
  return stmts.some((st) => ts.isReturnStatement(st) && st.expression);
};

const problems = [];
for (const { fn, name, authzVars } of subjects) {
  const guardAt = firstDominating(fn, isLockRefusal(authzVars), false);
  const writeAt = firstPos(fn, isWriteCall);

  if (guardAt === Infinity) {
    const narrowedAt = firstDominating(fn, isNarrowedRefusal(authzVars));
    problems.push(
      narrowedAt === Infinity
        ? `${name} (${CART}:${line(fn)}) has no lock refusal that certainly RUNS.\n    ` +
            "Either there is no `if (… locked …) throw/return` at all, or the one there is sits\n    " +
            "nested under another condition, a loop or a callback — none of which necessarily\n    " +
            "executes, so a frozen cart reaches the write anyway. It belongs at the top of the body,\n    " +
            "or at the top of a `try` block that is (and there, as a `return`: a `throw` is caught)."
        : `${name} (${CART}:${narrowedAt === Infinity ? line(fn) : sf.getLineAndCharacterOfPosition(narrowedAt).line + 1}) refuses on a condition \`locked\` alone does NOT make true.\n    ` +
            "A conjunct (`locked && x`), a negation, a comparison or a dead literal all leave a frozen\n    " +
            "cart writing while the line still reads like a guard. The server's shapes are `locked`,\n    " +
            "`locked || settling` and `authz.locked || authz.settling` — `locked` reachable through\n    " +
            "`||` alone. If the narrowing is deliberate, `apps/qr/lib/cart-freeze.ts` and its parity\n    " +
            "test change in the SAME commit, because the client would now be the stricter side.",
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
    if (!guardNode && isLockRefusal(authzVars)(n) && n.getStart(sf) === guardAt) guardNode = n;
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
  const condExpansion = expandAliases(guardNode.expression, fn, walk);

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
