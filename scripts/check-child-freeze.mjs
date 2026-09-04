#!/usr/bin/env node
/**
 * T9 — a component that renders a cart MUTATION must receive the freeze fact and honour it.
 *
 * ## Why this is a separate guard from `check-freeze-parity.mjs`
 *
 * That one asks a SERVER question: does every mutation refuse on bare `locked`, before it writes?
 * This one asks the CLIENT question one layer out: does every component that can FIRE such a
 * mutation know the cart is frozen, refuse the tap, and TELL THE DINER?
 *
 * J4's residual closed that gap for the controls Checkout renders itself. It did not close it for
 * the children Checkout renders — `RewardField`, `PickupWhenChoice`, `SendToKitchenButton` took no
 * lock prop at all, so they presented live controls while the server refused every write. The
 * sharpest instance was `RewardField.remove()`: it AWAITED `clearReward` and discarded the
 * `{ ok: false }` it got back, armed a focus handoff, refreshed, and put the still-applied reward
 * back with nothing said. That is J4 clause (b) — "renders fully editable and every edit silently
 * no-ops" — reproduced one component down from the screen J4 was filed against.
 *
 * ## Both subject sets are DERIVED, and the derivations were WRONG in the first draft
 *
 * ⚠️ Everything below is written the way it is because the first draft was green while missing HALF
 * the components it claimed to cover — the exact T13 blindness this guard was written to end,
 * reproduced on two other axes. Both were caught pre-merge, independently, by Codex and by a blind
 * adversarial pass; neither was caught by the guard, which cannot see its own reach:
 *
 *   • `readdirSync` is NOT recursive. `components/kiosk/KioskReview.tsx` (fires `addItem` and
 *     `setKioskTip`), `components/kiosk/KioskMenu.tsx` (`addItem`) and
 *     `components/menu/MenuBrowser.tsx` (`reorderOrder`) were never opened at all.
 *   • `ImportSpecifier.name` is the LOCAL binding, not the imported one. `TableCartProvider.tsx`
 *     writes `import { addItem as addItemAction, setQty as setQtyAction }`, so nothing matched and
 *     the whole component fell out before any rule ran.
 *
 * So: the component set is the recursive tree, imports resolve `propertyName ?? name`, and every
 * exclusion is an entry in EXEMPT with a written reason that must FIRE or this fails. A guard whose
 * coverage is an accident of `readdirSync` is worse than no guard, because CI prints the same word.
 *
 * ## The four rules
 *
 * For every component that IMPORTS one of the derived mutations:
 *   1. the COMPONENT's own parameter destructures `frozen` — bound to that function's parameter
 *      list, not to any `frozen` anywhere in the file (a `const { frozen } = metadata` in some
 *      helper used to satisfy it);
 *   2. the handler that fires it early-returns on `frozen`, POSITIONED BEFORE the call, and SAYS
 *      SOMETHING — `aria-disabled` is an announcement, not a gate, and a silent `return` is J4
 *      clause (b) with extra steps;
 *   3. the refusal REACHES THE DINER, asked the way THIS mutation actually refuses;
 *   4. and `Checkout.tsx` — the source of the prop, and the only file exempt from rules 1–3 —
 *      passes each of them the RAW edit-freeze binding, not `false` and not a narrower boolean.
 *
 * ## Rule 3 is derived, because "bind the result" is a shape, not the behaviour
 *
 * An early draft demanded one thing: the awaited call's result is BOUND. That is a MATCHER, and
 * LEARNINGS #60 is about exactly this — `const ignored = await clearReward(…)` satisfies it and
 * ships nothing. Worse, it is wrong for a thrower: `assignLine` returns `Promise<void>`, so there
 * was no result to bind and the rule was unsatisfiable-by-construction on the one component that
 * most needed it.
 *
 * So the derivation records WHICH WAY each mutation refuses, and rule 3 asks the matching question:
 *   • RETURN-style (`{ ok: false, reason }`) → the answer must be bound AND READ in a condition.
 *     Binding it and ignoring it is the shipped `RewardField.remove()` bug with a variable name on.
 *   • THROW-style (`assignLine`, `addItem`, `setQty`) → the call must sit in a `try` whose `catch`
 *     SPEAKS through one of this component's own channels. A comment-only `catch {}` has zero
 *     statements (comments are not AST nodes, which is why this parses), `console.error(e)` is not
 *     a channel, and `setBusy(false)` / `onChanged()` are channels that say NOTHING — so a call
 *     must carry an argument that is not merely `true`/`false`/`null`/`undefined`.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIB = "apps/qr/lib";
const COMPONENTS = "apps/qr/components";
/** The file that OWNS the freeze derivation and hands it down. Audited by rule 4, not by 1–3. */
const SOURCE = `${COMPONENTS}/Checkout.tsx`;

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

/** Every `.tsx` under `dir`, RECURSIVELY. Non-recursion hid four firing components (see header). */
const tsxTree = (rel) => {
  const out = [];
  for (const e of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...tsxTree(`${rel}/${e.name}`));
    else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) out.push(`${rel}/${e.name}`);
  }
  return out.sort();
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

const isFn = (n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n);

/** Peel type-only wrappers — `"" as const` is an AsExpression around the literal, not the literal. */
const unwrapTypeOnly = (e) => {
  let x = e;
  for (;;) {
    if (
      ts.isParenthesizedExpression(x) ||
      ts.isAsExpression(x) ||
      ts.isSatisfiesExpression(x) ||
      ts.isNonNullExpression(x)
    )
      x = x.expression;
    else return x;
  }
};

// ── 1. DERIVE the mutation set from every lib module, not from a list ───────────────────────────
const AUTHZ_CALLS = new Set(["assertCartMember", "assertCartItemMember"]);
const mutations = new Map(); // exported name -> { rel, kinds: Set<"throw"|"return"> }

/** Every `.ts` under `apps/qr/lib`, RECURSIVELY — same reason the component walk is recursive. */
const tsTree = (rel) => {
  const out = [];
  for (const e of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...tsTree(`${rel}/${e.name}`));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(`${rel}/${e.name}`);
  }
  return out.sort();
};

for (const rel of tsTree(LIB)) {
  const sf = parse(rel);
  for (const { fn, name } of namedFunctions(sf)) {
    let bindsLocked = false;
    /** HOW it refuses, not merely THAT it refuses — rule 3 asks a different question of each. */
    const kinds = new Set();
    // The locals holding an authorization result, so `authz.locked` is BOUND to one rather than
    // matched as any `<anything>.locked` — the bind-then-match rule `check-freeze-parity.mjs`
    // learned the hard way when a loose match caught `refusedPromoReason`'s diagnostic column read.
    const authzVars = new Set();
    /** Locals bound from the authz result's `locked` PROPERTY — under any local name. */
    const lockedIdents = new Set(["locked"]);
    walk(fn, (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        [...AUTHZ_CALLS].some((c) => n.initializer.getText(sf).includes(c))
      )
        authzVars.add(n.name.text);
      // ⚠️ AND THE ASSIGNMENT FORM. `grocery.ts` writes `let authz; try { authz = await
      // assertCartMember(…) } catch {…}` so it can answer a discriminated reason on the catch —
      // a DECLARATION-only selector never saw it, `scanAdd` stayed outside this guard's subject
      // set, and `components/kiosk/KioskScan.tsx` (which fires it) was audited by nothing. Found
      // by the same cross-check that found `reorder.ts`: this guard said 14 where
      // `check-freeze-parity.mjs` said 15.
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(n.left) &&
        [...AUTHZ_CALLS].some((c) => n.right.getText(sf).includes(c))
      )
        authzVars.add(n.left.text);
    });
    const mentionsLocked = (expr) => {
      let hit = false;
      walk(expr, (x) => {
        // ⚠️ THE LOCAL BINDING, NOT THE LITERAL NAME (Codex round 6 on #247). A semantics-preserving
        // refactor to `const { locked: isLocked } = await assertCartMember(…)` left `bindsLocked`
        // false AND this blind, so the mutation vanished from the subject set entirely and its
        // component could drop the gate with this guard green. The PARITY guard already tracked the
        // alias via `lockedIdents` — round 3 taught it there and not here, which is the fourth time
        // this PR that a lesson stopped at one of two siblings.
        if (ts.isIdentifier(x) && lockedIdents.has(x.text)) hit = true;
        if (
          ts.isPropertyAccessExpression(x) &&
          x.name.text === "locked" &&
          ts.isIdentifier(x.expression) &&
          authzVars.has(x.expression.text)
        )
          hit = true;
      });
      return hit;
    };
    walk(fn, (n) => {
      // `const { …, locked, … } = await assertCartMember(…)`
      if (
        ts.isVariableDeclaration(n) &&
        ts.isObjectBindingPattern(n.name) &&
        n.initializer &&
        [...AUTHZ_CALLS].some((c) => n.initializer.getText(sf).includes(c)) &&
        n.name.elements.some((el) => {
          const key = el.propertyName ?? el.name;
          if (!(ts.isIdentifier(key) && key.text === "locked")) return false;
          if (ts.isIdentifier(el.name)) lockedIdents.add(el.name.text);
          return true;
        })
      )
        bindsLocked = true;
      // …or `const authz = await assertCartMember(…)` then `authz.locked` — `setKioskTip`'s shape.
      if (
        ts.isPropertyAccessExpression(n) &&
        n.name.text === "locked" &&
        ts.isIdentifier(n.expression) &&
        authzVars.has(n.expression.text)
      )
        bindsLocked = true;
      // …or destructured OFF that local a statement later — `scanAdd`'s shape:
      // `const { uid, locked, settling } = authz;`
      if (
        ts.isVariableDeclaration(n) &&
        ts.isObjectBindingPattern(n.name) &&
        n.initializer &&
        ts.isIdentifier(n.initializer) &&
        authzVars.has(n.initializer.text) &&
        n.name.elements.some((el) => {
          const key = el.propertyName ?? el.name;
          if (!(ts.isIdentifier(key) && key.text === "locked")) return false;
          if (ts.isIdentifier(el.name)) lockedIdents.add(el.name.text);
          return true;
        })
      )
        bindsLocked = true;
      if (ts.isIfStatement(n) && mentionsLocked(n.expression)) {
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

/**
 * ⚠️ EVERY EXCLUSION IS A WRITTEN DECISION, and it must FIRE (the dead-exemption rule below).
 *
 * These components DO fire a derived mutation and do NOT take the freeze prop. That is a real gap in
 * each case — filed, not fixed here, because each needs freeze UI on a screen that has none, which
 * is a slice rather than a prop. What this map buys is that the gap is VISIBLE: before it, they were
 * excluded by a non-recursive `readdirSync` and an unresolved import alias, i.e. by accident.
 */
const EXEMPT = new Map([
  [
    `${COMPONENTS}/TableCartProvider.tsx`,
    "the MENU-side cart. ⚠️ THE REASON THAT STOOD HERE WAS FALSE, and an adversarial round on " +
      "#248 caught it: it said the catches 'already re-sync and speak', which they did — by " +
      "flashing 'Reconnecting to your table…' and re-minting the table session for EVERY throw, a " +
      "lock included. That is the M116 fabricated diagnosis, excused by this very entry. T14 is " +
      "CLOSED (#248): both catches route through `explainCaught` → `classifyRefusedWrite`, which " +
      "re-reads and names only what that read established, and only the unreachable arm re-mints. " +
      "The RULE is pinned in lib (cart-freeze.test.ts + the refusal/* mutants), and since M46/T18 (PR " +
      "#252) the WIRING is pinned too — `components/TableCartProvider.test.tsx` drives both catches " +
      "through the context under jsdom, with seven `refusal/*` mutants naming that suite. The exemption " +
      "REMAINS, for the two structural reasons that were always the real ones: rules 1-3 demand `if " +
      "(frozen) return` BEFORE the mutation, and the ABSENCE of that pre-write gate IS the T14 fix (a " +
      "gate on a cached lock intercepts the very write that would correct it); and rule 4 requires an " +
      "audited component to be rendered by Checkout.tsx, which never renders the /menu provider. What " +
      "changed is the reason, not the verdict. OPEN-ITEMS T18.",
  ],
  [
    `${COMPONENTS}/kiosk/KioskMenu.tsx`,
    "the STAFF kiosk, a single-purpose terminal that mints its own session and is the only client " +
      "on its cart — there is no peer to hold the lock and no review step to freeze. OPEN-ITEMS T15.",
  ],
  [
    `${COMPONENTS}/kiosk/KioskReview.tsx`,
    "same kiosk flow as KioskMenu. Its `chooseTip` catch is a DELIBERATE silent swallow with a " +
      "written reason (a failed tip write must never strand a guest who has committed to paying, " +
      "since the cashier's entry is the authority) — that is a decision, not an oversight. " +
      "OPEN-ITEMS T15.",
  ],
  [
    `${COMPONENTS}/kiosk/KioskScan.tsx`,
    "same kiosk flow as KioskMenu — and it only became visible here once the derivation learned " +
      "`grocery.ts`'s assignment form (`let authz; try { authz = await assertCartMember(…) }`), " +
      "which is the third coverage hole this guard has had. It DOES bind `scanAdd`'s result and " +
      "switch exhaustively on the reason, including `locked`, so its refusal already reaches the " +
      "guest. OPEN-ITEMS T15.",
  ],
  [
    `${COMPONENTS}/menu/MenuBrowser.tsx`,
    "fires `reorderOrder` ONCE on mount from a `?reorder=` param, not from a control a diner can " +
      "tap — there is nothing to gate. It already reads `res.ok` and announces `res.error`, which " +
      "is what rule 3 exists to force, and that string is SERVER-authored data rather than a " +
      "thrown message, so Next's production redaction never touches it. Re-verified when T14 " +
      "closed (#248); this entry needs no freeze wiring of its own.",
  ],
]);

// ── 2. Every component that imports one of them owes the rules ──────────────────────────────────
const audited = [];
const exempted = [];

for (const rel of tsxTree(COMPONENTS)) {
  const sf = parse(rel);

  // ⚠️ RESOLVE THE ALIAS. `el.name` is the LOCAL binding; `el.propertyName` is the imported name
  // when they differ. Reading only `el.name` made `import { addItem as addItemAction }` match
  // nothing, and `TableCartProvider` fell out of the guard entirely.
  const localToExported = new Map();
  /** Modules that hold at least one derived mutation — used to fail closed on shapes we cannot read. */
  // ⚠️ STRIP THE EXTENSION ON THE SET SIDE. The first draft stripped `.ts` from the import
  // SPECIFIER (which never has one) and compared it against entries that still did, so the check
  // matched nothing and its red-first probe came back green — a fix that could not fail, caught
  // only by watching it fail.
  const MUTATION_MODULES = new Set(
    [...mutations.values()].map((m) => m.rel.replace(/^apps\/qr\//, "@/").replace(/\.ts$/, "")),
  );
  const namespaceImports = [];
  walk(sf, (n) => {
    if (!ts.isImportDeclaration(n) || !n.importClause?.namedBindings) return;
    const spec = ts.isStringLiteral(n.moduleSpecifier) ? n.moduleSpecifier.text : "";
    const nb = n.importClause.namedBindings;
    // ⚠️ FAIL CLOSED ON A NAMESPACE IMPORT (Codex round 2 on #247). `import * as cart from
    // "@/lib/cart"` followed by `cart.applyReward(…)` is a perfectly ordinary refactor, and it used
    // to drop the component out of `audited` entirely — lowering the printed count while the
    // required check stayed green. Resolving `cart.X` properly means tracking the alias through
    // every call site; refusing the shape instead is the honest smaller move, and it is LOUD.
    if (ts.isNamespaceImport(nb)) {
      if (MUTATION_MODULES.has(spec)) namespaceImports.push({ spec, name: nb.name.text });
      return;
    }
    if (!ts.isNamedImports(nb)) return;
    for (const el of nb.elements) {
      const exported = (el.propertyName ?? el.name).text;
      if (mutations.has(exported)) localToExported.set(el.name.text, exported);
    }
  });
  if (namespaceImports.length && rel !== SOURCE && !EXEMPT.has(rel))
    fail(
      `${rel} imports a mutation module as a NAMESPACE (${namespaceImports
        .map((n) => `* as ${n.name} from "${n.spec}"`)
        .join(", ")}), which this guard cannot resolve.\n` +
        "  A `cart.applyReward(…)` call would be invisible to every rule below, so the component\n" +
        "  would silently leave the audited set with the check still green. Use named imports here,\n" +
        "  or teach this guard to resolve the namespace — do not leave the shape unreadable.",
    );
  if (localToExported.size === 0) continue;

  if (rel === SOURCE) continue; // rule 4 audits it instead
  if (EXEMPT.has(rel)) {
    exempted.push(rel);
    continue;
  }
  audited.push(rel);

  // The component's OWN ways of telling the diner something, derived from the file rather than
  // spelled: every destructured prop (`onStatus`, `onChanged`) and every `useState`/`useReducer`/
  // `useTransition` binding (`setError`, `startSplit`).
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

  /**
   * Does this call SAY something to the diner?
   *
   * ⚠️ "CALLS A CHANNEL" WAS NOT ENOUGH. The channel set is every prop callback and every state
   * setter, so `catch { setBusy(false); }` and `catch { onChanged(); }` satisfied it while telling
   * the diner nothing — the same silent no-op one syntax over. A call that speaks carries an
   * argument, and that argument is not merely a flag: `setBusy(false)`, `setError(null)` and a
   * zero-argument `onChanged()` are all rejected, `onStatus(FROZEN_NOTE)` and
   * `setMsg({ kind: "err", text })` are not. One hop through a local helper counts, because
   * `refuseFrozen()` is exactly how a component with two refusal sites avoids writing it twice.
   */
  const localFns = new Map(namedFunctions(sf).map(({ fn, name }) => [name, fn]));
  const FLAGS = new Set([
    ts.SyntaxKind.TrueKeyword,
    ts.SyntaxKind.FalseKeyword,
    ts.SyntaxKind.NullKeyword,
  ]);
  /** An empty or whitespace-only literal says nothing — `setError("")` renders no announcement at
   *  all, which preserved the silent-catch hole under a different literal (Codex round 2 on #247). */
  const isBlankLiteral = (a) => {
    const x = unwrapTypeOnly(a);
    if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return x.text.trim() === "";
    return false;
  };
  const isFlagArg = (a) =>
    FLAGS.has(unwrapTypeOnly(a).kind) ||
    (ts.isIdentifier(a) && a.text === "undefined") ||
    ts.isFunctionLike(a) ||
    isBlankLiteral(a);
  const speaksIn = (node, depth = 0) => {
    let found = false;
    walk(node, (x) => {
      if (found || !ts.isCallExpression(x)) return;
      let root = x.expression;
      while (ts.isPropertyAccessExpression(root)) root = root.expression;
      if (!ts.isIdentifier(root)) return;
      if (channels.has(root.text) && x.arguments.some((a) => !isFlagArg(a))) found = true;
      // One hop: a local helper whose own body speaks.
      else if (depth === 0 && localFns.has(root.text) && speaksIn(localFns.get(root.text), 1))
        found = true;
    });
    return found;
  };

  // ⚠️ ATTRIBUTE EACH CALL TO ITS INNERMOST *NAMED* ENCLOSING FUNCTION — the handler a human
  // guards is the named one the control's onClick points at, not the anonymous
  // `startTransition(async () => …)` inside it, and certainly not the component function (whose
  // "early return" would render nothing). And attribute the PROP to the OUTERMOST named function:
  // that is the component, and rule 1 is a question about its parameter list.
  const nameOf = new Map(namedFunctions(sf).map(({ fn, name }) => [fn, name]));
  const enclosing = (node) => {
    let inner = null;
    let handler = null;
    let component = null;
    for (let n = node.parent; n; n = n.parent) {
      if (!isFn(n)) continue;
      if (!inner) inner = n;
      if (nameOf.has(n)) {
        if (!handler) handler = n;
        component = n;
      }
    }
    return { handler: handler ?? inner, component };
  };

  const byHandler = new Map();
  const components = new Set();
  walk(sf, (n) => {
    if (
      !ts.isCallExpression(n) ||
      !ts.isIdentifier(n.expression) ||
      !localToExported.has(n.expression.text)
    )
      return;
    const { handler, component } = enclosing(n);
    if (!handler) return;
    if (component) components.add(component);
    if (!byHandler.has(handler)) byHandler.set(handler, []);
    byHandler.get(handler).push(n);
  });

  // Rule 1 — the freeze fact is threaded into THIS component's parameter list.
  //
  // ⚠️ BOUND TO THE PARAMETER, NOT TO THE FILE. An earlier draft walked every BindingElement named
  // `frozen` anywhere in the source, so an unrelated `const { frozen } = metadata` in a helper
  // proved the exported component received the prop when it did not.
  for (const comp of components) {
    // ⚠️ THE PROPERTY KEY, NOT THE LOCAL NAME (Codex round 2 on #247). `{ ignored: frozen, frozen:
    // ignoredFrozen }` declares BOTH props, type-checks, satisfies rule 4's JSX attribute check, and
    // gates every handler on `ignored` while Checkout's authoritative `frozen` goes unused — the
    // local binding merely happens to be spelled `frozen`. `propertyName ?? name` is the key.
    const takes = comp.parameters.some(
      (p) =>
        ts.isObjectBindingPattern(p.name) &&
        p.name.elements.some((el) => {
          const key = el.propertyName ?? el.name;
          return (
            ts.isIdentifier(key) &&
            key.text === "frozen" &&
            ts.isIdentifier(el.name) &&
            el.name.text === "frozen"
          );
        }),
    );
    if (!takes)
      fail(
        `${rel} — \`${nameOf.get(comp)}\` fires ${[...new Set([...localToExported.values()])]
          .sort()
          .join(", ")} but its own parameter list has no \`frozen\` prop.\n` +
          "  Those refuse on bare `locked` server-side, so every control here is live while the write\n" +
          "  is already decided against. Thread Checkout's `editsFrozen` in; never re-derive it here,\n" +
          "  and never satisfy this with a `frozen` bound somewhere else in the file.",
      );
  }

  for (const [fn, calls] of byHandler) {
    const name = nameOf.get(fn) ?? "(anonymous handler)";
    const firstCallAt = Math.min(...calls.map((c) => c.getStart()));

    // Rule 2 — the handler refuses, BEFORE the call, and says so.
    //
    // ⚠️ POSITION IS PART OF IT (Codex on #247). Accepting the guard anywhere among the top-level
    // statements let `await clearReward(…)` run first with the freeze check after it — a frozen tap
    // reaching the server while this printed clean. That is T11 (b) in the sibling guard, arriving
    // here one file over: the same lesson, not yet taught to this concept (LEARNINGS #65).
    let guard = null;
    if (fn.body && ts.isBlock(fn.body))
      for (const st of fn.body.statements) {
        if (!ts.isIfStatement(st)) continue;
        const cond = st.expression;
        if (!(ts.isIdentifier(cond) && cond.text === "frozen")) continue;
        const t = st.thenStatement;
        const inner = ts.isBlock(t) ? t.statements : [t];
        // ⚠️ THE EXIT, NOT THE `if` (Codex round 2 on #247) — and this is T11 (b) for the THIRD
        // time: the same lesson, taught to the parity guard, then re-broken here. Comparing the
        // `if`'s own start lets the audited mutation run INSIDE the frozen branch before the
        // return: `if (frozen) { const r = await applyReward(…); …; return; }` satisfied ordering,
        // speaking and result-consumption while sending the exact frozen write rule 2 exists to
        // stop. The statement that leaves the function is the only position that orders anything.
        const exit = inner.find((x) => ts.isReturnStatement(x));
        if (exit && exit.getStart() < firstCallAt) {
          guard = st;
          break;
        }
      }
    if (!guard) {
      fail(
        `${rel} — \`${name}()\` calls ${calls
          .map((c) => c.expression.getText(sf))
          .join(", ")} with no \`if (frozen) return\` above it in its body.\n` +
          "  `aria-disabled` does not stop a keyboard Enter or a programmatic click, and native\n" +
          "  `disabled` is not the fix (it drops focus to <body> mid-interaction, WCAG 2.4.3).\n" +
          "  The guard must also PRECEDE the call: one placed after it refuses nothing.",
      );
      continue;
    }
    // ⚠️ THE THEN BRANCH ONLY (Codex round 6 on #247). `speaksIn(guard)` walked the whole
    // IfStatement, so `if (frozen) { return; } else { setError("…"); }` satisfied the rule while the
    // FROZEN tap said nothing — the exact silent refusal rule 2 exists to prevent, passing because
    // the speech lived on the branch that never runs when frozen.
    if (!speaksIn(guard.thenStatement))
      fail(
        `${rel} — \`${name}()\` refuses on \`frozen\` SILENTLY.\n` +
          "  The tap is taken, nothing changes, and nothing is said — which is J4 clause (b), the\n" +
          "  defect this guard exists to prevent, arriving through the fix for it. Call one of this\n" +
          `  component's channels (${[...channels].sort().join(", ") || "— none found"}) with a\n` +
          "  message; a bare `return`, `setBusy(false)` or `onChanged()` says nothing.",
      );

    // Rule 3 — the refusal REACHES THE DINER, asked the way THIS mutation actually refuses.
    for (const c of calls) {
      const callee = c.expression.getText(sf);
      const kinds = mutations.get(localToExported.get(callee)).kinds;

      // (a) RETURN-style: the answer must be bound AND READ. Binding it is not reading it.
      if (kinds.has("return")) {
        const awaited = ts.isAwaitExpression(c.parent) ? c.parent : c;
        const decl = awaited.parent;
        const bound =
          ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) ? decl.name.text : null;
        let read = false;
        if (bound)
          walk(fn, (x) => {
            // The binding tested in a condition: `if (!res.ok)`, `res.ok ? … : …`, `r.ok && …`.
            const cond = ts.isIfStatement(x)
              ? x.expression
              : ts.isConditionalExpression(x)
                ? x.condition
                : ts.isBinaryExpression(x) &&
                    (x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                      x.operatorToken.kind === ts.SyntaxKind.BarBarToken)
                  ? x
                  : null;
            if (!cond) return;
            // ⚠️ IT MUST INSPECT THE OUTCOME (Codex round 2 on #247). Any mention of the name in any
            // condition used to count, so `if (res) void 0;` passed — and a result OBJECT is always
            // truthy, so that discriminates nothing and the `{ ok: false }` stayed discarded. What
            // reads the answer is a PROPERTY of the binding (`res.ok`, `r.reason`), so that is what
            // is required; a bare truthiness test on the object is refused.
            walk(cond, (y) => {
              if (
                ts.isPropertyAccessExpression(y) &&
                ts.isIdentifier(y.expression) &&
                y.expression.text === bound
              )
                read = true;
            });
          });
        if (!read)
          fail(
            `${rel} — \`${name}()\` never READS \`${callee}(…)\`'s answer.\n` +
              (bound
                ? `  It is bound to \`${bound}\` and then ignored, which is the shipped bug with a\n` +
                  `  variable name on. Test it (\`if (!${bound}.ok) …\`) and say what happened.\n`
                : "  The result is discarded outright.\n") +
              "  It answers `{ ok: false }` under a freeze, so throwing that away is precisely the\n" +
              "  silent no-op J4 clause (b) names: the tap is taken, the screen refreshes, and the\n" +
              "  unchanged value comes back with nothing said.",
          );
      }

      // (b) THROW-style: caught, and the catch SPEAKS.
      if (kinds.has("throw")) {
        // ⚠️ A DESCENDANT OF THE TRY BLOCK, not merely of the TryStatement (Codex round 2 on #247).
        // A call sitting in the `catch` or `finally` of a try/catch is NOT protected by that
        // catch — its exception propagates uncaught — yet the ancestor walk happily claimed the
        // handler, and a mutation moved into an existing catch printed clean.
        let handler = null;
        for (let n = c.parent; n && n !== fn; n = n.parent) {
          const parent = n.parent;
          if (parent && ts.isTryStatement(parent) && parent.tryBlock === n && parent.catchClause) {
            handler = parent.catchClause.block;
            break;
          }
        }
        if (!handler || !speaksIn(handler))
          fail(
            `${rel} — \`${name}()\` swallows \`${callee}(…)\`'s refusal.\n` +
              `  \`${callee}\` REFUSES BY THROWING, so there is no result to read: the answer arrives\n` +
              "  as an exception. It must land in a `catch` that calls one of this component's own\n" +
              `  channels (${[...channels].sort().join(", ") || "— none found"}) WITH A MESSAGE.\n` +
              "  A comment-only `catch {}`, a `console.error`, and a `setBusy(false)` that merely\n" +
              "  tidies up are all the same silent no-op, one control shape over.",
          );
      }
    }
  }
}

// ⚠️ EVERY EXEMPTION MUST FIRE. A stale one reads as a considered decision while excusing a file
// that no longer exists or no longer fires anything, and the next reader trusts the reason.
const deadExemptions = [...EXEMPT.keys()].filter((k) => !exempted.includes(k));
if (deadExemptions.length)
  fail(
    `these exemptions never fired: ${deadExemptions.join(", ")}.\n` +
      "  Either the file was renamed/removed, or it stopped importing a derived mutation. A\n" +
      "  documented exemption that matches nothing excuses nothing — delete it or fix the path.",
  );

// ── 3. Rule 4 — Checkout must hand each child the RAW edit-freeze binding ───────────────────────
//
// ⚠️ NOTHING CHECKED THE WIRING (Codex on #247). Rules 1–3 audit how a child uses its own `frozen`
// parameter and skip `Checkout.tsx` by name, so every one of them stayed green if a call site
// changed to `frozen={false}` or `frozen={payFrozen}` — the child would faithfully honour a freeze
// fact that never arrives. Required props make tsc demand *a* boolean; only this demands the RIGHT
// one. The binding's NAME is derived from Checkout (`const X = freezeBlocksEdits(…)`), never spelled
// here, so renaming it is a rename and not a silent hole.
{
  const sf = parse(SOURCE);
  let editsFrozenName = null;
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      ts.isIdentifier(n.initializer.expression) &&
      n.initializer.expression.text === "freezeBlocksEdits"
    )
      editsFrozenName = n.name.text;
  });
  if (!editsFrozenName)
    fail(
      `${SOURCE} has no \`const … = freezeBlocksEdits(…)\` binding.\n` +
        "  That is the raw edit-freeze fact every gated child must receive. Without it this rule\n" +
        "  cannot say what correct wiring looks like, so its absence is a failure, not a skip.",
    );

  // ⚠️ RESOLVE THE TAG THROUGH THE IMPORT (Codex round 2 on #247). Comparing JSX text to the audited
  // file's BASENAME meant an alias defeated the rule: import `RewardField as Rewards`, render the
  // real `<Rewards frozen={false}>`, and leave any dead or unrelated `<RewardField frozen={editsFrozen}>`
  // behind — `seen` fills, the wiring check passes, and the live component gets the wrong value. So
  // the local JSX name is derived from what Checkout actually imported from each audited module.
  const owedModules = new Map(
    audited.map((r) => [
      r.replace(/^apps\/qr\//, "@/").replace(/\.tsx$/, ""),
      path.basename(r, ".tsx"),
    ]),
  );
  const localToComponent = new Map(); // local JSX tag -> audited component name
  walk(sf, (n) => {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier)) return;
    // Checkout imports its children by relative path ("./RewardField"); normalise both sides.
    const specBase = n.moduleSpecifier.text.replace(/^.*\//, "");
    const match = [...owedModules.values()].find((c) => c === specBase);
    const clause = n.importClause;
    if (!clause) return;
    if (clause.name && match) localToComponent.set(clause.name.text, match);
    const nb = clause.namedBindings;
    if (nb && ts.isNamedImports(nb))
      for (const el of nb.elements) {
        const exported = (el.propertyName ?? el.name).text;
        if ([...owedModules.values()].includes(exported))
          localToComponent.set(el.name.text, exported);
      }
  });

  const owed = new Set(audited.map((r) => path.basename(r, ".tsx")));
  const unresolved = [...owed].filter((c) => ![...localToComponent.values()].includes(c));
  if (unresolved.length)
    fail(
      `${SOURCE} does not import these audited components under a resolvable name: ${unresolved.join(", ")}.\n` +
        "  Rule 4 binds the JSX tag to the import so an alias cannot defeat it; a component it cannot\n" +
        "  resolve is one it cannot check the wiring of.",
    );
  const seen = new Set();
  walk(sf, (n) => {
    if (!ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) return;
    const local = n.tagName.getText(sf);
    const tag = localToComponent.get(local);
    if (!tag) return;
    seen.add(tag);
    const attr = n.attributes.properties.find(
      (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "frozen",
    );
    const expr =
      attr && attr.initializer && ts.isJsxExpression(attr.initializer)
        ? attr.initializer.expression
        : null;
    const ok = expr && ts.isIdentifier(expr) && expr.text === editsFrozenName;
    if (!ok)
      fail(
        `${SOURCE} renders <${local}> (${tag}) with frozen={${expr ? expr.getText(sf) : "—"}}, not \`${editsFrozenName}\`.\n` +
          "  That child gates every one of its mutations on this value, and those mutations refuse\n" +
          "  on the RAW `locked`. A narrower boolean (the suppressed notice freeze, the pay gate) or\n" +
          "  a literal re-opens exactly the hole this guard exists to close, with rules 1-3 green.",
      );
  });
  const unrendered = [...owed].filter((t) => !seen.has(t));
  if (unrendered.length)
    fail(
      `these audited components are never rendered by ${SOURCE}: ${unrendered.join(", ")}.\n` +
        "  Rule 4 cannot check wiring it cannot find. Either the component moved to another parent\n" +
        "  (which then owes the same wiring check) or the tag name changed — do not drop the rule.",
    );
}

if (problems.length) {
  console.error("child freeze gate … \x1b[31m✗\x1b[0m\n");
  for (const p of problems) console.error("  " + p + "\n");
  process.exit(1);
}
console.log(
  "child freeze gate … \x1b[32mclean\x1b[0m\x1b[2m" +
    ` — ${mutations.size} lock-refusing mutations from ${
      new Set([...mutations.values()].map((m) => m.rel)).size
    } lib modules; ${audited.length} components audited (${exempted.length} exempt, each with a reason that fired)\x1b[0m`,
);
