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

/** A statement that WRITES: a PostgREST mutation or an RPC. */
const WRITE_CALLS = new Set(["update", "insert", "upsert", "delete", "rpc"]);
const isWrite = (node) => {
  let hit = false;
  walk(node, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      WRITE_CALLS.has(n.expression.name.text)
    )
      hit = true;
  });
  return hit;
};

/** A statement that REFUSES: throws, or returns something that is not a bare `undefined`. */
const isRefusal = (stmt) => {
  let hit = false;
  walk(stmt, (n) => {
    if (ts.isThrowStatement(n)) hit = true;
    if (ts.isReturnStatement(n) && n.expression) hit = true;
  });
  return hit;
};

process.stdout.write("freeze parity — the client mirrors the server's lock guard … ");

// A function is SUBJECT when it receives the lock fact — i.e. destructures `locked` out of either
// authorization helper. That is the behavioural definition: the server handed it the lock, so it is
// answerable for refusing on it.
//
// ⚠️ WHY NOT "calls assertCartMember AND writes", which the first draft used: it silently checked 6
// of the 11 lock-bearing mutations. `addItem`, `setQty` and `assignLine` all carry the guard and all
// write through helpers (`insertOrIncLine`, `touchCart`), so a direct-write selector skipped exactly
// the three highest-traffic ones. A guard that inspects half its subjects prints the same word as
// one that inspects all of them.
//
// The cost of this definition is that deleting the `locked` binding drops a function OUT of the set
// rather than failing it. That is what SUBJECT_FLOOR is for, and the floor is measured, not
// remembered: `node scripts/check-freeze-parity.mjs` prints the live count.
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

// A FLOOR, because a rule that inspects zero functions prints the same word as a clean one.
// MEASURED, never transcribed: the clean run prints the live count in its summary line.
const SUBJECT_FLOOR = 9;
if (subjects.length < SUBJECT_FLOOR)
  fail(
    `found only ${subjects.length} lock-bearing cart mutations in ${CART} (floor ${SUBJECT_FLOOR}).\n  ` +
      "That is a BLIND result, not a clean one. Either a mutation stopped destructuring `locked`\n  " +
      "from its authz call — which IS the defect, since it can no longer refuse — or the selector\n  " +
      "stopped matching a shape it used to. Fix the code or teach the selector; do not lower the\n  " +
      "floor to make it pass.",
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

/** The lock refusal: `if (<condition referencing `locked`>) throw|return <value>`. */
const isLockRefusal = (n) =>
  ts.isIfStatement(n) && references(n.expression, "locked") && isRefusal(n);

const isWriteCall = (n) =>
  ts.isCallExpression(n) &&
  ts.isPropertyAccessExpression(n.expression) &&
  WRITE_CALLS.has(n.expression.name.text);

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

  for (const holder of ["lockedBy", "locked_by", "mySeat"]) {
    if (guardNode && references(guardNode.expression, holder))
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
