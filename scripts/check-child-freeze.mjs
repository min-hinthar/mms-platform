#!/usr/bin/env node
/**
 * T9 — a child component that renders a cart MUTATION must receive the freeze fact and honour it.
 *
 * ## Why this is a separate guard from `check-freeze-parity.mjs`
 *
 * That one asks a SERVER question: does every mutation refuse on bare `locked`, before it writes?
 * This one asks the CLIENT question one layer out: does every component that can FIRE such a
 * mutation know the cart is frozen, and refuse the tap?
 *
 * J4's residual closed that gap for the controls Checkout renders itself. It did not close it for
 * the children Checkout renders — `RewardField`, `PickupWhenChoice`, `SendToKitchenButton` took no
 * lock prop at all, so they presented live controls while the server refused every write. The
 * sharpest instance was `RewardField.remove()`: it AWAITED `clearReward` and discarded the
 * `{ ok: false }` it got back, armed a focus handoff, refreshed, and put the still-applied reward
 * back with nothing said. That is J4 clause (b) — "renders fully editable and every edit silently
 * no-ops" — reproduced one component down from the screen J4 was filed against.
 *
 * ## The subject set is DERIVED, not listed
 *
 * ⚠️ `check-freeze-parity.mjs` USED TO hard-code two file constants, and that is exactly how it came
 * to be blind to `apps/qr/lib/pickup.ts` — two more lock-bearing mutations it had never opened
 * (OPEN-ITEMS T13; deleting `setPickupSlot`'s refusal left it GREEN). So this guard does not name
 * files or functions. It walks every `apps/qr/lib/*.ts`, finds every function that binds `locked`
 * from an authz call AND refuses on it, and treats THAT as the mutation set. A new lock-bearing
 * module joins automatically; it cannot be forgotten into invisibility.
 *
 * That parity earned its keep the day it was written: the two guards derived their sets
 * independently and came back one apart, which is how `apps/qr/lib/reorder.ts` was found — a
 * FOURTEENTH lock-bearing mutation neither guard had ever opened, missed by T13's own first fix
 * because that fix looked only for a destructured `locked` and `reorderOrder` keeps the whole authz
 * object. Two independent derivations disagreeing is a finding; one derivation agreeing with itself
 * is not.
 *
 * ## The three rules
 *
 * For every component under `apps/qr/components/` that IMPORTS one of those mutations:
 *   1. it destructures a `frozen` prop — the freeze fact is threaded, never re-derived from `locked`;
 *   2. the function enclosing each mutation call early-returns on `frozen` — `aria-disabled` is an
 *      announcement, not a gate, and a keyboard Enter or a programmatic click reaches the handler;
 *   3. the refusal REACHES THE DINER — and how that is checked is DERIVED from how the mutation
 *      refuses, not assumed.
 *
 * ## Rule 3 is derived, because "bind the result" is a shape, not the behaviour
 *
 * The first draft demanded one thing: the awaited call's result is BOUND. That is a MATCHER, and
 * LEARNINGS #60 is about exactly this — `const _ = await assignLine(…)` satisfies it and ships
 * nothing. Worse, it is wrong here: `assignLine` returns `Promise<void>` and refuses by THROWING, so
 * there is no result to bind and the rule was unsatisfiable-by-construction on the one component
 * that most needed it.
 *
 * So the derivation records WHICH WAY each mutation refuses (a `throw` in the `if (locked …)` branch,
 * or a `return` of a value), and rule 3 asks the matching question:
 *   • RETURN-style (`{ ok: false, reason }` — pickup.ts, most of cart.ts) → the caller must BIND the
 *     answer. Discarding it is the shipped `RewardField.remove()` bug verbatim.
 *   • THROW-style (`assignLine`, `addItem`, `setQty`) → the call must sit in a `try` whose `catch`
 *     CALLS ONE OF THIS COMPONENT'S OWN CHANNELS — a destructured prop callback or a `useState` /
 *     `useTransition` setter. A comment-only `catch {}` has zero statements (comments are not AST
 *     nodes, which is why this parses), and `console.error(e)` is not a channel: neither tells the
 *     diner the tap did nothing. That is the same silent no-op, one control shape over.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIB = "apps/qr/lib";
const COMPONENTS = "apps/qr/components";

const problems = [];
const fail = (m) => problems.push(m);

const parse = (rel) =>
  ts.createSourceFile(
    rel,
    readFileSync(path.join(ROOT, rel), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

/** Depth-first walk. `ts.forEachChild` is a SEARCH primitive — a truthy return aborts it. */
const walk = (n, fn) => {
  fn(n);
  ts.forEachChild(n, (c) => {
    walk(c, fn);
  });
};

/** Every named function-like, however spelled (declaration or arrow/expression bound to a const). */
const namedFunctions = (sf) => {
  const out = [];
  walk(sf, (n) => {
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

// ── 1. DERIVE the mutation set from every lib module, not from a list ───────────────────────────
const AUTHZ_CALLS = new Set(["assertCartMember", "assertCartItemMember"]);
const mutations = new Map(); // name -> { rel, kinds: Set<"throw"|"return"> }

for (const file of readdirSync(path.join(ROOT, LIB)).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
)) {
  const rel = `${LIB}/${file}`;
  const sf = parse(rel);
  for (const { fn, name } of namedFunctions(sf)) {
    let bindsLocked = false;
    /** HOW it refuses, not merely THAT it refuses — rule 3 asks a different question of each. */
    const kinds = new Set();
    // The locals holding an authorization result, so `authz.locked` can be BOUND to one rather than
    // matched as any `<anything>.locked` — the same bind-then-match rule `check-freeze-parity.mjs`
    // learned the hard way when a loose match caught `refusedPromoReason`'s diagnostic column read.
    const authzVars = new Set();
    walk(fn, (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        [...AUTHZ_CALLS].some((c) => n.initializer.getText(sf).includes(c))
      )
        authzVars.add(n.name.text);
    });
    walk(fn, (n) => {
      // `const { …, locked, … } = await assertCartMember(…)`
      if (
        ts.isVariableDeclaration(n) &&
        ts.isObjectBindingPattern(n.name) &&
        n.initializer &&
        [...AUTHZ_CALLS].some((c) => n.initializer.getText(sf).includes(c)) &&
        n.name.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === "locked")
      )
        bindsLocked = true;
      // …or `const authz = await assertCartMember(…)` then `authz.locked` — `setKioskTip`'s shape.
      // Missing it left one lock-refusing mutation outside this guard's subject set while
      // `check-freeze-parity.mjs` counted it, i.e. the two views of one rule disagreed by one.
      if (
        ts.isPropertyAccessExpression(n) &&
        n.name.text === "locked" &&
        ts.isIdentifier(n.expression) &&
        authzVars.has(n.expression.text)
      )
        bindsLocked = true;
      // `if (locked …) return|throw`
      if (ts.isIfStatement(n)) {
        let mentions = false;
        walk(n.expression, (x) => {
          if (ts.isIdentifier(x) && x.text === "locked") mentions = true;
          if (
            ts.isPropertyAccessExpression(x) &&
            x.name.text === "locked" &&
            ts.isIdentifier(x.expression) &&
            authzVars.has(x.expression.text)
          )
            mentions = true;
        });
        if (!mentions) return;
        const t = n.thenStatement;
        for (const st of ts.isBlock(t) ? t.statements : [t]) {
          if (ts.isThrowStatement(st)) kinds.add("throw");
          if (ts.isReturnStatement(st) && st.expression) kinds.add("return");
        }
      }
    });
    if (bindsLocked && kinds.size) mutations.set(name, { rel, kinds });
  }
}

if (mutations.size === 0)
  fail(
    "derived ZERO lock-refusing mutations from apps/qr/lib — the derivation is broken, not the code.\n" +
      "  This guard is worthless if its subject set is empty, so an empty set is a failure, never a pass.",
  );

// ── 2. Every component that imports one of them owes the three rules ────────────────────────────
for (const file of readdirSync(path.join(ROOT, COMPONENTS)).filter((f) => f.endsWith(".tsx"))) {
  const rel = `${COMPONENTS}/${file}`;
  const sf = parse(rel);

  const imported = new Set();
  walk(sf, (n) => {
    if (!ts.isImportDeclaration(n) || !n.importClause?.namedBindings) return;
    const nb = n.importClause.namedBindings;
    if (!ts.isNamedImports(nb)) return;
    for (const el of nb.elements) if (mutations.has(el.name.text)) imported.add(el.name.text);
  });
  if (imported.size === 0) continue;

  // Checkout renders its OWN controls and owns the derivation; it is the source of the prop, not a
  // consumer of it. It is covered by check-freeze-parity + cart-freeze.test.ts instead.
  if (file === "Checkout.tsx") continue;

  // Rule 1 — the freeze fact is threaded in.
  let takesFrozen = false;
  walk(sf, (n) => {
    if (ts.isBindingElement(n) && ts.isIdentifier(n.name) && n.name.text === "frozen")
      takesFrozen = true;
  });
  if (!takesFrozen)
    fail(
      `${rel} fires ${[...imported].sort().join(", ")} but takes no \`frozen\` prop.\n` +
        `  Those refuse on bare \`locked\` server-side, so every control here is live while the write\n` +
        "  is already decided against. Thread Checkout's `editsFrozen` in; never re-derive it here.",
    );

  // ⚠️ ATTRIBUTE EACH CALL TO ITS INNERMOST ENCLOSING FUNCTION, not to every function that contains
  // it. The first draft walked each named function's whole subtree, so the COMPONENT function was
  // reported as owing `if (frozen) return` for calls made by its inner handlers — which would be
  // absurd advice (a component that returns early renders nothing). Climb to the nearest
  // function-like instead, so the rule lands on the handler that actually makes the call.
  //
  // …and climb to the nearest NAMED one. These calls are routinely made inside an anonymous inner
  // callback (a `startTransition(async () => …)`, a promise-chain step), and demanding the refusal
  // at the top of an anonymous closure would be both unreportable ("(anonymous handler)") and the
  // wrong advice: the handler a human guards is the named one the control's onClick points at.
  const nameOf0 = new Map(namedFunctions(sf).map(({ fn, name }) => [fn, name]));
  const enclosing = (node) => {
    let firstFn = null;
    for (let n = node.parent; n; n = n.parent) {
      if (!(ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)))
        continue;
      if (!firstFn) firstFn = n;
      if (nameOf0.has(n)) return n; // the named handler — where the guard belongs
    }
    return firstFn; // nothing named above it; report the innermost so it is never silently skipped
  };
  const byOwner = new Map(); // function node -> calls[]
  walk(sf, (n) => {
    if (
      !ts.isCallExpression(n) ||
      !ts.isIdentifier(n.expression) ||
      !imported.has(n.expression.text)
    )
      return;
    const owner = enclosing(n);
    if (!owner) return;
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(n);
  });

  // The component's OWN ways of telling the diner something, derived from the file rather than
  // spelled: every destructured prop (`onStatus`, `onChanged`, `frozenNote`) and every
  // `useState`/`useReducer`/`useTransition` binding (`setError`, `startSplit`). Rule 3(b) demands a
  // catch call one of THESE — a list of blessed names would be the T13 mistake again.
  const HOOKS = new Set(["useState", "useReducer", "useTransition"]);
  const channels = new Set();
  walk(sf, (n) => {
    if (ts.isParameter(n) && ts.isObjectBindingPattern(n.name))
      for (const el of n.name.elements) if (ts.isIdentifier(el.name)) channels.add(el.name.text);
    if (
      ts.isVariableDeclaration(n) &&
      ts.isArrayBindingPattern(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      ts.isIdentifier(n.initializer.expression) &&
      HOOKS.has(n.initializer.expression.text)
    )
      for (const el of n.name.elements)
        if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) channels.add(el.name.text);
  });

  const nameOf = new Map(namedFunctions(sf).map(({ fn, name }) => [fn, name]));
  for (const [fn, calls] of byOwner) {
    const name = nameOf.get(fn) ?? "(anonymous handler)";

    // Rule 2 — the handler itself refuses. An attribute announces; only this stops the call.
    let guards = false;
    if (fn.body && ts.isBlock(fn.body))
      for (const st of fn.body.statements) {
        if (!ts.isIfStatement(st)) continue;
        const cond = st.expression;
        if (!(ts.isIdentifier(cond) && cond.text === "frozen")) continue;
        const t = st.thenStatement;
        const inner = ts.isBlock(t) ? t.statements : [t];
        if (inner.some((x) => ts.isReturnStatement(x))) guards = true;
      }
    if (!guards)
      fail(
        `${rel} — \`${name}()\` calls ${calls
          .map((c) => c.expression.getText(sf))
          .join(", ")} with no \`if (frozen) return\` at the top of its body.\n` +
          "  `aria-disabled` does not stop a keyboard Enter or a programmatic click, and native\n" +
          "  `disabled` is not the fix (it drops focus to <body> mid-interaction, WCAG 2.4.3).",
      );

    // Rule 3 — the refusal REACHES THE DINER, asked the way THIS mutation actually refuses.
    for (const c of calls) {
      const callee = c.expression.getText(sf);
      const kinds = mutations.get(callee).kinds;

      // (a) RETURN-style: the answer must be bound. Discarding it IS the shipped bug.
      if (kinds.has("return")) {
        const awaited = ts.isAwaitExpression(c.parent) ? c.parent : c;
        const p = awaited.parent;
        if (!(ts.isVariableDeclaration(p) || ts.isReturnStatement(p) || ts.isBinaryExpression(p)))
          fail(
            `${rel} — \`${name}()\` discards the result of \`${callee}(…)\`.\n` +
              "  It answers `{ ok: false }` under a freeze, so throwing that away is precisely the\n" +
              "  silent no-op J4 clause (b) names: the tap is taken, the screen refreshes, and the\n" +
              "  unchanged value comes back with nothing said. Bind it and read `ok`.",
          );
      }

      // (b) THROW-style: the throw must be caught AND the catch must speak through one of this
      // component's own channels. An empty `catch {}` (comments are not statements) or a bare
      // `console.error` leaves the diner staring at an unchanged screen.
      if (kinds.has("throw")) {
        let handler = null;
        for (let n = c.parent; n && n !== fn; n = n.parent)
          if (ts.isTryStatement(n) && n.catchClause) {
            handler = n.catchClause.block;
            break;
          }
        const speaks =
          handler !== null &&
          (() => {
            let found = false;
            walk(handler, (x) => {
              if (!ts.isCallExpression(x)) return;
              let root = x.expression;
              while (ts.isPropertyAccessExpression(root)) root = root.expression;
              if (ts.isIdentifier(root) && channels.has(root.text)) found = true;
            });
            return found;
          })();
        if (!speaks)
          fail(
            `${rel} — \`${name}()\` swallows \`${callee}(…)\`'s refusal.\n` +
              `  \`${callee}\` REFUSES BY THROWING, so there is no result to read: the answer arrives\n` +
              "  as an exception. It must land in a `catch` that calls one of this component's own\n" +
              `  channels (${[...channels].sort().join(", ") || "— none found"}). A comment-only\n` +
              "  `catch {}` or a `console.error` is the same silent no-op, one control shape over.",
          );
      }
    }
  }
}

if (problems.length) {
  console.error("child freeze gate … \x1b[31m✗\x1b[0m\n");
  for (const p of problems) console.error("  " + p + "\n");
  process.exit(1);
}
console.log(
  "child freeze gate … \x1b[32mclean\x1b[0m\x1b[2m" +
    ` — ${mutations.size} lock-refusing mutations derived from ${
      new Set([...mutations.values()].map((m) => m.rel)).size
    } lib modules; every component firing one takes \`frozen\`, refuses in the handler, and surfaces the answer\x1b[0m`,
);
