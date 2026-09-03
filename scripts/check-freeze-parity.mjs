#!/usr/bin/env node
/**
 * J4 (residual) — the one fact `cart-freeze.ts` rests on that no unit test can reach.
 *
 * `cartFreeze` blocks edits for peer / self / held alike because it MIRRORS the server: every
 * lock refusal under `apps/qr/lib/` is bare `locked`, with no comparison to the caller. That mirror
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
 * Red-first, every rule watched: delete `if (locked) throw` from a mutation → fails rule 1; move it
 * below the `.update(` → fails rule 2; comment it out → fails rule 1 (comments are not AST nodes);
 * narrow it to `if (locked && lockedBy !== uid)` → fails rule 3, which is the whole point. Three
 * more were added when T11 and T13 closed: flip a refusal to `return { ok: true }` → fails rule 1
 * (it is no longer a refusal); put a write INSIDE the locked branch → fails rule 2 (the exit, not
 * the `if`, is what orders it); drop `setPickupSlot`'s refusal, which used to print CLEAN → now
 * fails rule 1, because the FILE SET is derived rather than named. Three more when Codex audited
 * those fixes: a dead conjunct in the upstream derivation (`locked: false && cart.locked && …`,
 * which satisfied both presence checks) → fails the constant-operand rule; a NEW local write helper
 * called before the refusal → fails rule 2, because the helper set is derived rather than named;
 * a new authorize-and-write module with no lock binding at all → appears in `extra:` instead of
 * being invisible.
 */
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIB = "apps/qr/lib";
const CART = `${LIB}/cart.ts`;

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

/** Line number of a node, resolved through its OWN source file — the guard now walks several. */
const line = (n) => n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line + 1;
/** Line number of a raw position within `srcFile`. */
const lineAt = (srcFile, pos) => srcFile.getLineAndCharacterOfPosition(pos).line + 1;

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
/**
 * A FLOOR, not the definition (Codex on #247). The helper set is DERIVED below — every function in
 * `apps/qr/lib` whose own body performs a direct write — because two hard-coded names made the
 * ordering rule vacuous for any NEW helper: extract `saveLine()` out of a mutation, call it before
 * the lock refusal, and `writeAt` becomes Infinity while the guard prints clean. These two are kept
 * only so that a derivation which silently stops finding anything fails loudly instead.
 */
const WRITE_HELPER_FLOOR = new Set(["insertOrIncLine", "touchCart"]);

/**
 * A write — the ONE predicate, used by subject discovery AND the ordering rule.
 *
 * ⚠️ IT IS ONE PREDICATE ON PURPOSE. An earlier round added the helper arm to a second, parallel
 * matcher and not to this one, and the ordering rule silently kept its old direct-call-only reach —
 * caught only by insisting on watching the fix fail (LEARNINGS #65). Two predicates for one concept
 * is how that happens, so there is now exactly one.
 */
const namedFunctionsIn = (srcFile) => {
  const out = [];
  walk(srcFile, (n) => {
    if (ts.isFunctionDeclaration(n) && n.body && n.name) out.push({ fn: n, name: n.name.text });
    else if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
    )
      out.push({ fn: n.initializer, name: n.name.text });
  });
  return out;
};

/** A DIRECT write: `db.from(…).update(…)`, `.insert(`, `.rpc(` and friends. */
const isDirectWrite = (n) =>
  ts.isCallExpression(n) &&
  ts.isPropertyAccessExpression(n.expression) &&
  WRITE_CALLS.has(n.expression.name.text);

/**
 * A write — the ONE predicate, built per file over the DERIVED helper set.
 *
 * ⚠️ IT IS ONE PREDICATE ON PURPOSE. An earlier round added the helper arm to a second, parallel
 * matcher and not to this one, and the ordering rule silently kept its old direct-call-only reach —
 * caught only by insisting on watching the fix fail (LEARNINGS #65).
 */
const makeIsWriteCall = (writerNames) => (n) =>
  isDirectWrite(n) ||
  (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && writerNames.has(n.expression.text));

/**
 * Does this `return` hand back a FAILURE?
 *
 * ⚠️ "ANY VALUE-BEARING RETURN" WAS A HOLE (Codex round 7 on #246, filed as OPEN-ITEMS T11 (a) and
 * fixed here). The old test was `ts.isReturnStatement(st) && st.expression`, which accepts:
 *
 *     if (locked) return { ok: true };            // type-checks, required check GREEN
 *
 * — a locked cart told the caller the operation SUCCEEDED while the server skipped it. Every
 * consumer branches on `ok`, so that is worse than no guard: `sendToKitchen` would report the food
 * away, `applyReward` a discount applied, and the client would never re-read.
 *
 * The accepted shape is MEASURED, not imagined: all ten value-returning lock refusals across
 * `cart.ts` and `pickup.ts` are an object literal with `ok: false` (six also carry a `reason`).
 * So that is the rule, and ambiguity is REFUSED rather than guessed — a non-literal `ok` (a
 * variable, a call, a ternary) is not a refusal this guard can prove, and a `reason` alone is not
 * enough because `{ ok: true, reason: "…" }` would sail through. A throw needs no shape: it cannot
 * be mistaken for success.
 */
const unwrap = (e) => {
  // ⚠️ `false as const` is an AsExpression WRAPPING the keyword, and `grocery.ts` writes every
  // refusal that way: `return { ok: false as const, reason: "locked" as const }`. The first draft of
  // this predicate compared `initializer.kind` to `FalseKeyword` directly and therefore called a
  // real refusal a non-refusal — a false NEGATIVE, invisible until the file set widened enough to
  // reach `scanAdd`. Type-only wrappers are not behaviour; peel them before asking about the value.
  let x = e;
  for (;;) {
    if (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x))
      x = x.expression;
    else if (ts.isNonNullExpression(x)) x = x.expression;
    else return x;
  }
};

const returnsFailure = (st) => {
  if (!ts.isReturnStatement(st) || !st.expression) return false;
  const e = unwrap(st.expression);
  if (!ts.isObjectLiteralExpression(e)) return false;
  // ⚠️ THE LAST WRITE WINS, so `some()` is the wrong quantifier (Codex round 2 on #247):
  // `{ ok: false, ...shadow }` type-checks against `{ ok: boolean }` and returns SUCCESS at runtime
  // when `shadow` carries `ok: true`. Take the EFFECTIVE `ok` — the last one a reader would see —
  // and refuse the whole literal if any spread or computed key could overwrite it, since neither is
  // resolvable here and ambiguity is refused rather than guessed.
  const idx = e.properties.findIndex(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ((ts.isIdentifier(p.name) && p.name.text === "ok") ||
        (ts.isStringLiteral(p.name) && p.name.text === "ok")),
  );
  if (idx === -1) return false;
  const shadowed = e.properties
    .slice(idx + 1)
    .some((p) => ts.isSpreadAssignment(p) || (p.name && ts.isComputedPropertyName(p.name)));
  if (shadowed) return false;
  return unwrap(e.properties[idx].initializer).kind === ts.SyntaxKind.FalseKeyword;
};

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
const isRefusalExit = (st) => ts.isThrowStatement(st) || returnsFailure(st);

const thenBranchRefuses = (ifStmt) => {
  // NO DESCENT AT ALL. The branch's OWN statement list must contain the exit — that is what makes
  // this an unconditional refusal rather than a possible one. Descending found the `return` inside
  // `if (shouldRefuse)` / a loop / a callback, none of which stop the function when their own
  // condition is false. All fifteen real refusals are a single `throw` or `return`, so the
  // strictness costs nothing; if a legitimate shape ever needs a block, put the exit at its top level.
  const t = ifStmt.thenStatement;
  const stmts = ts.isBlock(t) ? t.statements : [t];
  return stmts.some(isRefusalExit);
};

/** The position of the statement that actually LEAVES the function, or Infinity. */
const refusalExitPos = (ifStmt) => {
  const t = ifStmt.thenStatement;
  const stmts = ts.isBlock(t) ? t.statements : [t];
  let best = Infinity;
  for (const st of stmts) if (isRefusalExit(st)) best = Math.min(best, st.getStart());
  return best;
};

/**
 * ── THE FILE SET IS DERIVED (OPEN-ITEMS T13) ───────────────────────────────────────────────────
 *
 * ⚠️ THIS GUARD USED TO OPEN EXACTLY TWO FILES — `CART` and `AUTHZ` — and that is how it came to be
 * blind to `apps/qr/lib/pickup.ts`, which holds two more lock-bearing mutations (`setPickupSlot`,
 * `setPickupAsap`) carrying the identical `if (locked) return { ok: false, reason: "locked" }`.
 * Falsified red-first before the fix: deleting `setPickupSlot`'s refusal outright left this check
 * GREEN (exit 0), and it went on printing "eleven lock-bearing mutations" as though that were the
 * whole picture when there were thirteen. A set defined by WHERE YOU LOOKED rather than by WHAT THE
 * RULE COVERS is the same uniqueness-is-not-completeness shape as the matchers in LEARNINGS #65.
 *
 * So the subject FILES are derived the same way the subject FUNCTIONS are: every `apps/qr/lib/*.ts`
 * that binds `locked` out of an authorization call. A third such module joins automatically and
 * announces itself through `extra:` below; it cannot be forgotten into invisibility.
 */
// ⚠️ AND IT ACCEPTS BOTH SPELLINGS, because the first draft of this very fix did not — and missed a
// fourteenth mutation the same way it had missed the twelfth and thirteenth. `apps/qr/lib/reorder.ts`
// keeps the whole authz object (`const authz = await assertCartMember(…); if (authz.locked) …`), so a
// file predicate that only looked for a destructured `locked` never opened it, even though the
// per-FUNCTION selector below has understood that shape since `setKioskTip`. Found by cross-checking
// against `check-child-freeze.mjs`, whose independently-derived set came back one larger. The two
// selectors must ask the same question; a file-level one that is narrower than the function-level one
// re-creates the exact blindness T13 is about, one level up.
const bindsLockedFromAuthz = (srcFile) => {
  const authzVars = new Set();
  walk(srcFile, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      (references(n.initializer, "assertCartMember") ||
        references(n.initializer, "assertCartItemMember"))
    )
      authzVars.add(n.name.text);
  });
  let hit = false;
  walk(srcFile, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isObjectBindingPattern(n.name) &&
      n.initializer &&
      (references(n.initializer, "assertCartMember") ||
        references(n.initializer, "assertCartItemMember")) &&
      n.name.elements.some((e) => {
        // ⚠️ THE PROPERTY KEY, NOT THE LOCAL NAME (Codex round 3 on #247). Destructuring
        // `{ locked: ignoredLock, settling: locked }` and guarding on the local `locked` reported
        // CLEAN while a pay-window lock no longer prevented the write — the guard was reading a
        // name, and the name had been moved onto a different fact. The CHILD guard's rule 1 had
        // this exact defect, fixed there in round 2 and not carried here (LEARNINGS #65).
        const key = e.propertyName ?? e.name;
        return (
          ts.isIdentifier(key) &&
          key.text === "locked" &&
          ts.isIdentifier(e.name) &&
          e.name.text === "locked"
        );
      })
    )
      hit = true;
    if (
      ts.isPropertyAccessExpression(n) &&
      n.name.text === "locked" &&
      ts.isIdentifier(n.expression) &&
      authzVars.has(n.expression.text)
    )
      hit = true;
  });
  return hit;
};

/**
 * ⚠️ AND DISCOVERY MUST NOT DEPEND ON THE BINDING IT AUDITS (Codex on #247). Filtering files on
 * `bindsLockedFromAuthz` alone reproduced, at FILE level, the hole round 3 of #246 closed at
 * FUNCTION level: a new `apps/qr/lib/*.ts` that calls `assertCartMember` and WRITES but never reads
 * `locked` fell outside `MUTATION_FILES`, outside `subjects`, and outside the `extra:` speed bump —
 * so CI stayed green for exactly the missing-refusal regression this derivation exists to catch.
 * The file set is therefore the same UNION the subject selector uses: binds the lock fact, OR
 * authorizes and writes.
 */
/** Every `.ts` under `apps/qr/lib`, RECURSIVELY (Codex round 3 on #247). The tree already holds
 *  `lib/menu`, `lib/kiosk`, `lib/hooks`, `lib/i18n` and `lib/qbo`; NONE of them calls an authz
 *  helper today (measured), so this closes a future hole rather than a live one — but it is the
 *  same non-recursive-enumeration defect that hid four components in round 1. A guard whose reach
 *  stops at one directory level is one directory away from lying. */
const tsTree = (rel) => {
  const out = [];
  for (const e of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...tsTree(`${rel}/${e.name}`));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(`${rel}/${e.name}`);
  }
  return out;
};

const ALL_LIB = tsTree(LIB)
  .sort()
  .map((rel) => ({ rel, sf: parse(rel) }));

/**
 * The DERIVED write helpers: every named function anywhere in `apps/qr/lib` whose own body performs
 * a direct write. A mutation that calls one of these has written, whatever the helper is called —
 * which is the point, because the previous two-name list made the ordering rule vacuous for any new
 * extraction (`saveLine()` called before the lock refusal → `writeAt` Infinity → clean).
 *
 * ⚠️ DERIVED FIRST, THEN USED BY DISCOVERY (Codex round 2 on #247). The first draft computed this
 * AFTER `MUTATION_FILES` and so discovered files with `isDirectWrite` only — meaning a module of
 * `await assertCartMember(id); await touchCart(id, "…")` with no `locked` binding was excluded from
 * the file set, from `subjects`, and from the `extra:` bump. Helper-routed writes are writes at both
 * stages or at neither; one predicate, used everywhere, is the whole point of `isWriteCall`.
 */
const WRITERS = new Set();
for (const { sf } of ALL_LIB)
  for (const { fn, name } of namedFunctionsIn(sf)) {
    let writes = false;
    walk(fn, (n) => {
      if (isDirectWrite(n)) writes = true;
    });
    if (writes) WRITERS.add(name);
  }
const isWriteCall = makeIsWriteCall(WRITERS);

const authorizesAndWrites = (sf) => {
  let authorizes = false;
  let writes = false;
  walk(sf, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      (n.expression.text === "assertCartMember" || n.expression.text === "assertCartItemMember")
    )
      authorizes = true;
    if (isWriteCall(n)) writes = true;
  });
  return authorizes && writes;
};

const MUTATION_FILES = ALL_LIB.filter(
  ({ sf }) => bindsLockedFromAuthz(sf) || authorizesAndWrites(sf),
);

const missingFloor = [...WRITE_HELPER_FLOOR].filter((h) => !WRITERS.has(h));
if (missingFloor.length)
  fail(
    `the derived write-helper set no longer contains: ${missingFloor.join(", ")}.\n  ` +
      "These are known writers, so their absence means the DERIVATION broke — not that they stopped\n  " +
      "writing. A helper set that silently shrinks is how the ordering rule goes vacuous; fix the\n  " +
      "derivation rather than the floor.",
  );

if (!MUTATION_FILES.some(({ rel }) => rel === CART))
  fail(
    `the derived mutation-file set does not contain ${CART}.\n  ` +
      "That file is the reason this guard exists, so its absence means the derivation broke — not\n  " +
      "that cart.ts stopped holding cart mutations. Fix the selector; never widen the rule to pass.",
  );

// ── the DERIVATION, one file upstream ────────────────────────────────────────────────────────────
// Every `locked` the fifteen mutations read comes from `assertCartMember`, which computes it in
// `authz.ts`. Narrowing it THERE narrows all fifteen at once and this guard, then reading only
// `cart.ts`, would never see it (blind adversarial pass on #246). So the derivation is checked too: the
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
// false` contains none of the forbidden names, passes clean, and unfreezes every one of the fifteen
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
        "database is not a narrowing — it is an unfreeze of all fifteen at once, while\n  " +
        "`apps/qr/lib/cart-freeze.ts` keeps the CLIENT read-only. If the mechanism really changed,\n  " +
        "update this check in the same commit, deliberately.",
    );
}

/**
 * ⚠️ AND THE READS MUST MATTER (Codex on #247). The two checks above ask whether `cart.locked` and
 * `cart.locked_at` APPEAR somewhere in the derivation's AST. Appearing is not affecting:
 *
 *     locked: false && cart.locked && cart.locked_at !== null    // both terms present, always false
 *
 * satisfies them both, and unfreezes every one of the fifteen mutations at once while
 * `cart-freeze.ts` keeps the client read-only — the same inversion the `locked: false` check was
 * added for, arriving through a dead conjunct instead of an absence.
 *
 * Proving "a fresh held lock ENTAILS the returned value" in general is a solver's job. What is
 * checkable, and what the real derivation actually is, is the shape: an `&&` chain in which no
 * operand is a constant. Every operand of a conjunction can force the result false, so a literal
 * one is a switch that turns the whole lock off — and there is no legitimate reason to write one.
 * Ambiguity is REFUSED rather than guessed: if the derivation stops being a conjunction, this fails
 * and the next reader decides deliberately, exactly like EXPECTED_SUBJECTS.
 */
const flattenAnd = (e) => {
  const x = unwrap(e);
  if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
    return [...flattenAnd(x.left), ...flattenAnd(x.right)];
  return [x];
};
const CONSTANT_KINDS = new Set([
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.StringLiteral,
]);
/**
 * ⚠️ AND THE COMPUTED FORMS (Codex round 2 on #247). Checking syntax kinds alone let
 * `cart.locked && Boolean(false) && cart.locked_at !== null` through — `Boolean(false)` is a
 * CallExpression, so it was not a "constant", and every effective lock went false while both
 * required database reads stayed put. An operand is trivially constant when it reads NO identifier
 * that could vary: a literal, a negation of one, or a wrapper call over one.
 */
const isTriviallyConstant = (e) => {
  const x = unwrap(e);
  if (CONSTANT_KINDS.has(x.kind)) return true;
  if (ts.isPrefixUnaryExpression(x)) return isTriviallyConstant(x.operand);
  if (ts.isCallExpression(x)) return x.arguments.every((a) => isTriviallyConstant(a));
  if (ts.isVoidExpression(x)) return true;
  return false;
};
const conjunction = lockedInits.map(flattenAnd).find((ops) => ops.length > 1);
if (!conjunction)
  fail(
    `${AUTHZ} no longer derives \`locked\` as a conjunction.\n  ` +
      "Every cart mutation refuses on this one value, and the only shape this guard can prove is an\n  " +
      "`&&` chain whose operands all read something. If the mechanism genuinely changed, update this\n  " +
      "check in the same commit — do not let an unreadable derivation pass as a readable one.",
  );
else {
  const dead = conjunction.find((o) => isTriviallyConstant(o));
  if (dead)
    fail(
      `${AUTHZ} derives \`locked\` through a CONSTANT operand: \`${dead.getText(authzSf)}\`.\n  ` +
        "A literal in an `&&` chain is a switch, and a falsy one turns the lock off for every\n  " +
        "mutation at once while the reads around it still satisfy the presence checks above. That is\n  " +
        "an unfreeze wearing a derivation's clothes, and `cart-freeze.ts` would keep the CLIENT\n  " +
        "read-only while the server accepted every write.",
    );
}

for (const holder of ["locked_by", "lockedBy", "uid"]) {
  if (lockedInits.some((e) => references(e, holder)))
    fail(
      `${AUTHZ} derives \`locked\` using \`${holder}\`.\n  ` +
        "That narrows the lock at its SOURCE, so all 15 cart mutations start excusing the holder at\n  " +
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
  // ── The four below joined when discovery widened to authorize-and-write modules (Codex on #247).
  // Each was READ before it was excused; none is a missing refusal, and each refuses in a shape this
  // guard's three rules cannot express. The dead-exemption rule keeps every one of them honest.
  [
    "releasePayLock",
    "it RELEASES the lock. Demanding `if (locked) throw` here would refuse the one operation whose " +
      "job is to clear the freeze, and would strand every diner whose attempt was superseded. This " +
      "exemption was written once before, never fired because the function was outside the file " +
      "set, and was deleted by the dead-exemption rule — it is back now that discovery reaches it.",
  ],
  [
    "openSettlement",
    "refuses on the lock through `acquireSettlement`, which answers a discriminated string: " +
      '`if (acq === "locked") throw new Error("Someone\u2019s checking out — try again in a ' +
      'moment")`. The freeze IS the mutex it acquires, so the check cannot be an `if (locked)` on ' +
      "the authz result — it has to be the acquisition's own outcome, or two opens race the " +
      "derive/insert between the read and the write.",
  ],
  [
    "abortSettlement",
    "the release side of `openSettlement`, and same shape: it exists to clear the settle freeze, " +
      "and its refusals are about live PaymentIntents (`Payment already completed`, `A payment is " +
      "completing`) rather than the cart lock. Refusing it on `locked` would make a stuck settling " +
      "table unrecoverable.",
  ],
  [
    "openTab",
    "refuses on a FRESHLY READ cart row rather than the authz snapshot — `paymentInFlightReason` " +
      "over `locked`/`locked_at`/`settle_at`, before `mms_open_tab`. That is STRICTER than this " +
      "guard's rule (it also catches a split-settle freeze and an authorized share, and it fails " +
      "CLOSED on the read error — M119a), so demanding the narrower `if (locked)` shape here would " +
      "be a downgrade dressed as a rule.",
  ],
]);

/**
 * Every named function-like in the file, however it is spelled.
 *
 * ⚠️ `ts.isFunctionDeclaration` ALONE WAS A HOLE (Codex round 2 on #246). `export const setQty =
 * async (…) => {…}` is a VariableDeclaration with an ArrowFunction initializer, so the selector
 * never visited it — and because it never entered `subjects`, `EXPECTED_SUBJECTS` did not flag it
 * either: converting any of the mutations to an arrow (a refactor with no behavioural intent)
 * would have removed it from the guard's reach while printing `missing:` … which at least fails.
 * The genuinely silent case is a NEW cart mutation written as an arrow: it joins the file owing a
 * lock refusal and this guard never sees it, which is precisely what the `extra:` speed bump exists
 * to prevent. Both spellings now enter the same set.
 */

const subjects = [];
const exempted = [];
for (const { rel, sf } of MUTATION_FILES)
  for (const { fn: n, name: fnName } of namedFunctionsIn(sf)) {
    let bindsLocked = false;
    walk(n, (d) => {
      if (
        ts.isVariableDeclaration(d) &&
        ts.isObjectBindingPattern(d.name) &&
        d.initializer &&
        (references(d.initializer, "assertCartMember") ||
          references(d.initializer, "assertCartItemMember")) &&
        d.name.elements.some((e) => {
          // ⚠️ THE PROPERTY KEY, NOT THE LOCAL NAME (Codex round 3 on #247). Destructuring
          // `{ locked: ignoredLock, settling: locked }` and guarding on the local `locked` reported
          // CLEAN while a pay-window lock no longer prevented the write — the guard was reading a
          // name, and the name had been moved onto a different fact. The CHILD guard's rule 1 had
          // this exact defect, fixed there in round 2 and not carried here (LEARNINGS #65).
          const key = e.propertyName ?? e.name;
          return (
            ts.isIdentifier(key) &&
            key.text === "locked" &&
            ts.isIdentifier(e.name) &&
            e.name.text === "locked"
          );
        })
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
      // …and the ASSIGNMENT form. `grocery.ts` writes `let authz; try { authz = await
      // assertCartMember(…) } catch {…}` so it can answer a discriminated reason on the catch; a
      // declaration-only selector never saw it, and `scanAdd`'s `locked` then had no provenance.
      if (
        ts.isBinaryExpression(d) &&
        d.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(d.left) &&
        (references(d.right, "assertCartMember") || references(d.right, "assertCartItemMember"))
      )
        authzVars.add(d.left.text);
    });
    /**
     * ⚠️ THE IDENTIFIERS THAT ACTUALLY CARRY THE LOCK — provenance, not spelling (Codex round 3 on
     * #247, and the reason the selector fix alone was NOT enough). `forcesRefusal` accepted any
     * bare identifier named `locked`, so destructuring
     *
     *     const { locked: ignoredLock, settling: locked } = await assertCartMember(id);
     *
     * moved the NAME onto a different fact and `if (locked) …` went on reading like a lock guard
     * while a pay-window lock no longer prevented the write — reported CLEAN. Only a local bound
     * from the authz result's `locked` PROPERTY counts now.
     */
    const lockedIdents = new Set();
    walk(n, (d) => {
      if (
        ts.isVariableDeclaration(d) &&
        ts.isObjectBindingPattern(d.name) &&
        d.initializer &&
        (references(d.initializer, "assertCartMember") ||
          references(d.initializer, "assertCartItemMember") ||
          (ts.isIdentifier(d.initializer) && authzVars.has(d.initializer.text)))
      )
        for (const e of d.name.elements) {
          const key = e.propertyName ?? e.name;
          if (ts.isIdentifier(key) && key.text === "locked" && ts.isIdentifier(e.name))
            lockedIdents.add(e.name.text);
        }
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
    subjects.push({ fn: n, name: fnName, authzVars, lockedIdents, rel });
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
// `subjects.map((s) => s.name).sort()` and pasting the output — FIFTEEN since discovery widened
// twice (T13, then Codex on #247): the eleven in `cart.ts`, `pickup.ts`'s two, `reorder.ts`'s one,
// and `grocery.ts`'s `scanAdd`, which was reachable only once the file set stopped depending on the
// very binding it audits AND `returnsFailure` learned to unwrap `false as const`. Adding a
// lock-bearing mutation is meant to fail here once — add the name deliberately, so nobody adds one
// without noticing that it now owes a refusal. It fired on exactly that twice while T13 was being
// closed, and both new subjects were READ before their names went in: all three already satisfy the
// rules, they had simply never been in reach.
const EXPECTED_SUBJECTS = [
  "addItem",
  "applyPromo",
  "applyReward",
  "assignLine",
  "clearReward",
  "makeItNow",
  "reorderOrder",
  "scanAdd",
  "sendToKitchen",
  "setKioskTip",
  "setLineFulfillment",
  "setPickupAsap",
  "setPickupSlot",
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
    if (pred(n)) best = Math.min(best, n.getStart());
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
const forcesRefusal = (expr, authzVars, lockedIdents) => {
  const e = ts.isParenthesizedExpression(expr) ? expr.expression : expr;
  // A bare identifier counts ONLY if it was bound from the authz result's `locked` property. The
  // name alone proves nothing: it can be moved onto `settling` in one edit (see `lockedIdents`).
  if (ts.isIdentifier(e) && lockedIdents.has(e.text)) return true;
  if (
    ts.isPropertyAccessExpression(e) &&
    e.name.text === "locked" &&
    ts.isIdentifier(e.expression) &&
    authzVars.has(e.expression.text)
  )
    return true;
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    return (
      forcesRefusal(e.left, authzVars, lockedIdents) ||
      forcesRefusal(e.right, authzVars, lockedIdents)
    );
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
const isLockRefusal = (authzVars, lockedIdents) => (n) =>
  ts.isIfStatement(n) &&
  forcesRefusal(n.expression, authzVars, lockedIdents) &&
  thenBranchRefuses(n);

/** A refusal that MENTIONS the lock but does not turn on it — reported separately, by name. */
const isNarrowedRefusal = (authzVars, lockedIdents) => (n) =>
  ts.isIfStatement(n) &&
  !forcesRefusal(n.expression, authzVars, lockedIdents) &&
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
    best = Math.min(best, node.getStart());
  }
  return best;
};

/** Does this `if`'s then-branch leave the function by RETURNING A FAILURE (not merely throwing)?
 *  Shares `returnsFailure` with `thenBranchRefuses` — one predicate for one concept, because the
 *  last time this file grew a second matcher for "a write" the ordering rule silently kept the old
 *  reach (LEARNINGS #65). */
const branchReturns = (ifStmt) => {
  const t = ifStmt.thenStatement;
  const stmts = ts.isBlock(t) ? t.statements : [t];
  return stmts.some(returnsFailure);
};

const problems = [];
for (const { fn, name, authzVars, lockedIdents, rel } of subjects) {
  const sf = fn.getSourceFile();
  const guardAt = firstDominating(fn, isLockRefusal(authzVars, lockedIdents), false);
  const writeAt = firstPos(fn, isWriteCall);

  if (guardAt === Infinity) {
    const narrowedAt = firstDominating(fn, isNarrowedRefusal(authzVars, lockedIdents));
    problems.push(
      narrowedAt === Infinity
        ? `${name} (${rel}:${line(fn)}) has no lock refusal that certainly RUNS.\n    ` +
            "Either there is no `if (… locked …) throw/return` at all, or the one there is sits\n    " +
            "nested under another condition, a loop or a callback — none of which necessarily\n    " +
            "executes, so a frozen cart reaches the write anyway. It belongs at the top of the body,\n    " +
            "or at the top of a `try` block that is (and there, as a `return`: a `throw` is caught)."
        : `${name} (${rel}:${narrowedAt === Infinity ? line(fn) : lineAt(sf, narrowedAt)}) refuses on a condition \`locked\` alone does NOT make true.\n    ` +
            "A conjunct (`locked && x`), a negation, a comparison or a dead literal all leave a frozen\n    " +
            "cart writing while the line still reads like a guard. The server's shapes are `locked`,\n    " +
            "`locked || settling` and `authz.locked || authz.settling` — `locked` reachable through\n    " +
            "`||` alone. If the narrowing is deliberate, `apps/qr/lib/cart-freeze.ts` and its parity\n    " +
            "test change in the SAME commit, because the client would now be the stricter side.",
    );
    continue;
  }
  let guardNode = null;
  const findGuard = (n) => {
    if (
      n !== fn &&
      (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))
    )
      return;
    if (!guardNode && isLockRefusal(authzVars, lockedIdents)(n) && n.getStart() === guardAt)
      guardNode = n;
    ts.forEachChild(n, (c) => {
      findGuard(c);
    });
  };
  findGuard(fn);

  // Rule 2 — it refuses BEFORE it writes.
  //
  // ⚠️ COMPARED AGAINST THE EXIT, NOT THE `if` (Codex round 7 on #246, OPEN-ITEMS T11 (b)). The old
  // comparison used `guardAt`, the IF STATEMENT's own start — which precedes anything nested inside
  // its branch, so a write placed in the refusal itself beat the rule:
  //
  //     if (locked) { await touchCart(cartId); return { ok: false, reason: "locked" }; }
  //
  // The frozen request mutated and then refused, and this check reported clean. The statement that
  // actually leaves the function is the only position that can order "refused" against "wrote", so
  // that is what is compared now; `guardAt` stays as the guard's IDENTITY for rule 3 below.
  const guardExitAt = refusalExitPos(guardNode);
  if (writeAt !== Infinity && guardExitAt > writeAt) {
    problems.push(
      `${name} (${rel}:${line(fn)}) writes before it refuses the lock — the write at ` +
        `${rel}:${lineAt(sf, writeAt)} runs before the refusal ` +
        `leaves the function at ${rel}:${lineAt(sf, guardExitAt)}.\n    ` +
        "A write INSIDE the locked branch counts: the frozen cart is mutated and only then told no.",
    );
    continue;
  }

  // Rule 3 — THE ONE THIS FILE EXISTS FOR. The condition must not be narrowed by a holder
  // comparison. `cartFreeze` blocks whenever `locked` is true; if the server starts excusing the
  // holder, the client becomes the STRICTER one and over-blocks a cart the server would accept.

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
        `${name} (${rel}:${line(guardNode)}) narrows its lock refusal by \`${holder}\`.\n    ` +
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
