import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * M82 — the CALLER half of the `Sheet` `busy` guard.
 *
 * `packages/ui` owns the policy and asserts that `sheet.tsx` consults it. Neither of those notices
 * whether a caller actually PASSES `busy`, and the adversarial pass proved it: deleting
 * `busy={pending}` from `LossActionSheet` — re-opening the spent-PIN-attempt defect the whole slice
 * leads with — left `@mms/ui` at 85 passed and `apps/qr` at 821 passed. Every gate green, the fix
 * gone.
 *
 * That is the third time this repo has shipped a correct module whose caller defeated it (W22c's
 * freshness stamp, W22e's catalog mapping, W22f's arming), and the first time the guard for it was
 * written in the same commit. It lives HERE rather than beside the policy because a `packages/ui`
 * test reading `apps/qr` off disk would invert the one-way dependency rule.
 *
 * An ALLOWLIST, not a sweep. Most `Sheet` callers must NOT pass `busy` — they write nothing
 * irreversible, and a lock a user cannot predict is worse than no lock — so "every Sheet has busy"
 * would be the wrong assertion and would pressure a future author into adding it everywhere.
 *
 * M137 added the twelfth (`menu/DietFilterButton.tsx`) and this guard is why it was a decision
 * rather than an oversight: its sheet toggles CLIENT-SIDE dietary filters and writes nothing at
 * all, so it belongs in the unguarded list. Locking a filter picker mid-tap would be the "lock with
 * no reason" the prop's own doc forbids.
 *
 * ── Phase 2h (P2cz · decision 9a) — WHAT the flag must be, rewritten to PARSE ─────────────────────
 *
 * This guard used to REQUIRE `busy={pending}` from `useTransition`, on the theory that a transition's
 * pending "settles by construction". In the browser it does not: Next runs Server Actions one at a
 * time per tab, the router's update for an unanswered action shares the transition's lane, and the
 * transition's `pending` stays true until the RAW action answers — whatever bound its callback
 * races (measured in Chromium, LEARNINGS #149 · #200). A hung action therefore held every guarded
 * sheet's four exits, behind a trapped focus scope, for as long as the network liked.
 *
 * So the shape is now, for every GUARDED sheet (StaffModSheet traced into its parents):
 *  1. the ONE live `<Sheet busy={x}>` binds an identifier `x`;
 *  2. `x` is the value of a `useState` in the component — never `useTransition`'s (each hook
 *     RESOLVED through the file's react imports: an alias or a namespace is read, not spelled);
 *  3. its setter is only ever CALLED, with a literal `true` / `false` — never handed away by
 *     reference (`onBusy={setBusy}`), where code this guard cannot read could set it;
 *  4. every `setX(true)` is a top-level statement of a function F that then runs a `try` whose
 *     `finally` calls `setX(false)` as a top-level statement, and:
 *     - nothing between the raise and that `try` can hold the flag or skip the finally (an await,
 *       a return, a throw — run by F itself), and nothing before the clear in the finally can;
 *     - the `try` awaits a BOUNDED write in F itself — `await boundWrite(<the raw action call>)`
 *       with ONE argument (the bound is the contract's STAFF_HANG_MS; never
 *       `boundWrite(raceTimeout(…))`, which reads `threw` at the bound and drops the late answer),
 *       or the order pad's `await r.done` off `writes.attempt(…)` (`usePadWrites` bounds it at the
 *       tap's STAFF_HANG_MS) — and EVERY await the try or its catch runs in F is one of those
 *       (`await out.late` after a bounded write would hold the flag until the raw answers);
 *  5. F is live: referenced in the component, and never from inside a transition starter (9b — the
 *     action is called OUTSIDE any async transition) — `startTransition` aliased, read off a
 *     namespace, a `useTransition` second element, or a const copying any of them.
 *
 * ⚠️ PARSED, NEVER SCANNED (LEARNINGS #60). Comments are not AST nodes, and a `<Sheet>` (or a
 * bounded await, or a `setX(false)`) parked in a literal-dead shape — `{false && …}`, `{null && …}`,
 * `true ? … : <dead>`, `if (false) …` — is excluded, then ambiguity is REFUSED (exactly one live
 * `<Sheet>`), never resolved by position. The matcher is falsified red-first below against each of
 * those evasions, on fixtures.
 */

const COMPONENTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "components");
const readRaw = (rel: string) => readFileSync(path.join(COMPONENTS, rel), "utf8");
const parse = (rel: string, text: string) =>
  ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/**
 * Every component that renders the `Sheet` primitive, found on disk rather than listed by hand.
 *
 * Recursive, and `.tsx` only because a `Sheet` is JSX. The primitive itself lives in `packages/ui`
 * and is not swept — this is the caller side.
 */
function componentFiles(): string[] {
  return readdirSync(COMPONENTS, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".tsx") && !/\.test\.tsx?$/.test(f))
    .map((f) => f.split(path.sep).join("/"));
}

// ── the AST helpers ──────────────────────────────────────────────────────────────────────────────

type Jsx = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

/** Every node in the subtree, depth-first. ⚠️ The visitor returns nothing: `forEachChild` is a
 *  SEARCH primitive and a truthy return would abort the walk. */
function walk(root: ts.Node, each: (n: ts.Node) => void): void {
  const visit = (n: ts.Node) => {
    each(n);
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(root);
}

const isFunctionLike = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n);

/** The nearest enclosing function of a node (null at module level). */
function enclosingFunction(n: ts.Node): ts.FunctionLikeDeclaration | null {
  for (let p = n.parent; p; p = p.parent) if (isFunctionLike(p)) return p;
  return null;
}

/** A literal's truth value, or undefined when the expression is not a literal. */
function literalTruth(e: ts.Expression): boolean | undefined {
  if (ts.isParenthesizedExpression(e)) return literalTruth(e.expression);
  if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword) return false;
  if (ts.isIdentifier(e) && e.text === "undefined") return false;
  if (ts.isNumericLiteral(e)) return Number(e.text) !== 0;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text !== "";
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = literalTruth(e.operand);
    return inner === undefined ? undefined : !inner;
  }
  return undefined;
}

const within = (n: ts.Node, container: ts.Node | undefined) =>
  !!container && n.pos >= container.pos && n.end <= container.end;

/**
 * Is `n` parked in one of the enumerated LITERAL-dead shapes between it and `stop` (exclusive)?
 * This is liveness against parked dead copies, not a reachability proof.
 */
function isLiteralDead(n: ts.Node, stop?: ts.Node): boolean {
  for (let child: ts.Node = n, p = n.parent; p && p !== stop; child = p, p = p.parent) {
    if (ts.isBinaryExpression(p) && child === p.right) {
      const left = literalTruth(p.left);
      const op = p.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken && left === false) return true;
      if (op === ts.SyntaxKind.BarBarToken && left === true) return true;
      if (op === ts.SyntaxKind.QuestionQuestionToken && left !== undefined) {
        // `null ?? x` is live; any other literal on the left short-circuits.
        const nullish =
          p.left.kind === ts.SyntaxKind.NullKeyword ||
          (ts.isIdentifier(p.left) && p.left.text === "undefined");
        if (!nullish) return true;
      }
    }
    if (ts.isConditionalExpression(p)) {
      const c = literalTruth(p.condition);
      if (c === true && child === p.whenFalse) return true;
      if (c === false && child === p.whenTrue) return true;
    }
    if (ts.isIfStatement(p)) {
      const c = literalTruth(p.expression);
      if (c === false && child === p.thenStatement) return true;
      if (c === true && child === p.elseStatement) return true;
    }
  }
  return false;
}

/** The JSX elements named `tag` in a file. */
function jsxNamed(sf: ts.SourceFile, tag: string): Jsx[] {
  const out: Jsx[] = [];
  walk(sf, (n) => {
    if (
      (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
      n.tagName.getText(sf) === tag
    )
      out.push(n);
  });
  return out;
}

/** A JSX attribute by name (spreads are not a binding this guard can read). */
function attr(el: Jsx, name: string): ts.JsxAttribute | undefined {
  return el.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

/** `name={ident}` → the identifier; anything else → undefined. */
function boundIdentifier(a: ts.JsxAttribute | undefined): ts.Identifier | undefined {
  const init = a?.initializer;
  if (!init || !ts.isJsxExpression(init) || !init.expression) return undefined;
  return ts.isIdentifier(init.expression) ? init.expression : undefined;
}

/** `const [a, b] = <init>` declarations in a file, by the name bound at `index`. */
function arrayBindings(root: ts.Node, name: string, index: number): ts.VariableDeclaration[] {
  const out: ts.VariableDeclaration[] = [];
  walk(root, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isArrayBindingPattern(n.name)) return;
    const el = n.name.elements[index];
    if (el && ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === name)
      out.push(n);
  });
  return out;
}

/** The callee name of `f(…)` / `React.f(…)`. */
function calleeName(c: ts.CallExpression): string | undefined {
  if (ts.isIdentifier(c.expression)) return c.expression.text;
  if (ts.isPropertyAccessExpression(c.expression)) return c.expression.name.text;
  return undefined;
}

/** A module's bindings in this file: each LOCAL name a named import binds, mapped to the export it
 *  names (`import { a as b }` → b ↦ a — an alias is resolved, never trusted by spelling), plus the
 *  namespace / default bindings (`import * as R`, `import R`) its exports can be read through. */
type Imports = { named: Map<string, string>; namespaces: Set<string> };
function importsFrom(sf: ts.SourceFile, spec: string): Imports {
  const named = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.moduleSpecifier.text !== spec) continue;
    const clause = st.importClause;
    if (!clause) continue;
    if (clause.name) namespaces.add(clause.name.text);
    const b = clause.namedBindings;
    if (b && ts.isNamespaceImport(b)) namespaces.add(b.name.text);
    if (b && ts.isNamedImports(b))
      for (const e of b.elements) named.set(e.name.text, (e.propertyName ?? e.name).text);
  }
  return { named, namespaces };
}

/** The export of `spec` that `e` names — `x` bound by an import (its alias resolved) or `NS.x` off a
 *  namespace/default import — else undefined. */
function exportNamed(e: ts.Expression, from: Imports): string | undefined {
  if (ts.isIdentifier(e)) return from.named.get(e.text);
  if (
    ts.isPropertyAccessExpression(e) &&
    ts.isIdentifier(e.expression) &&
    from.namespaces.has(e.expression.text)
  )
    return e.name.text;
  return undefined;
}

/** Is `c` a call of React's `hook` (bare, aliased, or through a namespace)? */
const callsReact = (sf: ts.SourceFile, c: ts.Expression | undefined, hook: string) =>
  !!c && ts.isCallExpression(c) && exportNamed(c.expression, importsFrom(sf, "react")) === hook;

/**
 * Every way this file can START a transition: React's `startTransition` (aliased or not), `NS.
 * startTransition` off a namespace/default import, each `useTransition()` destructure's second
 * element, and any const that copies one of those (`const go = startTransition`) — to a fixpoint.
 */
function transitionStarters(sf: ts.SourceFile): (c: ts.CallExpression) => boolean {
  const react = importsFrom(sf, "react");
  const names = new Set<string>(
    [...react.named].filter(([, exp]) => exp === "startTransition").map(([local]) => local),
  );
  const isStarter = (e: ts.Expression): boolean =>
    (ts.isIdentifier(e) && names.has(e.text)) || exportNamed(e, react) === "startTransition";
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isArrayBindingPattern(n.name)) return;
    if (!callsReact(sf, n.initializer, "useTransition")) return;
    const el = n.name.elements[1];
    if (el && ts.isBindingElement(el) && ts.isIdentifier(el.name)) names.add(el.name.text);
  });
  for (let grew = true; grew; ) {
    grew = false;
    walk(sf, (n) => {
      if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || !n.initializer) return;
      if (names.has(n.name.text) || !isStarter(n.initializer)) return;
      names.add(n.name.text);
      grew = true;
    });
  }
  return (c) => isStarter(c.expression);
}

/** The function's NAME as its callers write it: a declaration's, or the const it is assigned to. */
function functionName(f: ts.FunctionLikeDeclaration): string | undefined {
  if (ts.isFunctionDeclaration(f) && f.name) return f.name.text;
  if (
    (ts.isArrowFunction(f) || ts.isFunctionExpression(f)) &&
    ts.isVariableDeclaration(f.parent) &&
    ts.isIdentifier(f.parent.name)
  )
    return f.parent.name.text;
  return undefined;
}

/** `setX(<literal>)` as a TOP-LEVEL statement of a block. */
const isSetterStatement = (st: ts.Statement, setter: string, value: boolean) =>
  ts.isExpressionStatement(st) &&
  ts.isCallExpression(st.expression) &&
  ts.isIdentifier(st.expression.expression) &&
  st.expression.expression.text === setter &&
  st.expression.arguments.length === 1 &&
  st.expression.arguments[0]!.kind ===
    (value ? ts.SyntaxKind.TrueKeyword : ts.SyntaxKind.FalseKeyword);

/**
 * Is `aw` a BOUNDED await? `await boundWrite(<raw call>)` with `boundWrite` imported from the
 * contract (and the raw not a `raceTimeout`), or the pad's `await r.done` where `r` is a const of F
 * initialised by `writes.attempt(…)` and `writes` is the component's `usePadWrites(…)`.
 */
function isBoundedAwait(
  aw: ts.AwaitExpression,
  f: ts.FunctionLikeDeclaration,
  component: ts.FunctionLikeDeclaration,
  sf: ts.SourceFile,
): boolean {
  const e = aw.expression;
  if (
    ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === "boundWrite"
  ) {
    // The contract's own export under its own name — `track as boundWrite` is not a bound.
    if (exportNamed(e.expression, importsFrom(sf, "@/lib/bounded-write")) !== "boundWrite")
      return false;
    // ONE argument: the bound is the contract's STAFF_HANG_MS, never a caller's `Infinity` (F6).
    if (e.arguments.length !== 1) return false;
    const raw = e.arguments[0];
    return !!raw && ts.isCallExpression(raw) && calleeName(raw) !== "raceTimeout";
  }
  if (ts.isPropertyAccessExpression(e) && e.name.text === "done" && ts.isIdentifier(e.expression)) {
    const r = e.expression.text;
    let viaChain = false;
    walk(f, (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === r &&
        enclosingFunction(n) === f &&
        n.initializer &&
        ts.isCallExpression(n.initializer) &&
        ts.isPropertyAccessExpression(n.initializer.expression) &&
        n.initializer.expression.name.text === "attempt" &&
        ts.isIdentifier(n.initializer.expression.expression)
      ) {
        const writes = n.initializer.expression.expression.text;
        walk(component, (m) => {
          if (
            ts.isVariableDeclaration(m) &&
            ts.isIdentifier(m.name) &&
            m.name.text === writes &&
            m.initializer &&
            ts.isCallExpression(m.initializer) &&
            exportNamed(m.initializer.expression, importsFrom(sf, "./usePadWrites")) ===
              "usePadWrites"
          )
            viaChain = true;
        });
      }
    });
    return viaChain;
  }
  return false;
}

/**
 * What in `nodes` — run by `f` itself, not by a function nested in it — can hold or skip a clear:
 * an await (including `for await`), a return or a throw. The first one found, as words, else
 * undefined. (Any statement CAN throw; these are the ones that say so.)
 */
function holdsOrSkips(
  nodes: readonly ts.Node[],
  f: ts.FunctionLikeDeclaration,
): string | undefined {
  let found: string | undefined;
  for (const node of nodes)
    walk(node, (n) => {
      if (found || enclosingFunction(n) !== f) return;
      if (ts.isAwaitExpression(n) || (ts.isForOfStatement(n) && n.awaitModifier))
        found = "an await";
      else if (ts.isReturnStatement(n)) found = "a return";
      else if (ts.isThrowStatement(n)) found = "a throw";
    });
  return found;
}

/**
 * The busy binding's whole contract (steps 2–5 of the docblock) for `x` inside `component`. Returns
 * the problems found — empty when the binding is the bounded-state shape.
 */
function stateShapeProblems(
  sf: ts.SourceFile,
  component: ts.FunctionLikeDeclaration,
  x: string,
): string[] {
  const problems: string[] = [];
  // Hooks are RESOLVED through the file's react imports — `useTransition as useState` is a
  // transition, `React.useState` is state.
  const fromTransition = arrayBindings(sf, x, 0).filter((d) =>
    callsReact(sf, d.initializer, "useTransition"),
  );
  if (fromTransition.length > 0) problems.push(`\`${x}\` is a useTransition pending`);
  const decls = arrayBindings(component, x, 0);
  if (decls.length !== 1) {
    problems.push(`\`${x}\` is not ONE array-destructured declaration in the component`);
    return problems;
  }
  const decl = decls[0]!;
  if (!callsReact(sf, decl.initializer, "useState")) {
    problems.push(`\`${x}\` is not a useState value`);
    return problems;
  }
  const setterEl = (decl.name as ts.ArrayBindingPattern).elements[1];
  if (!setterEl || !ts.isBindingElement(setterEl) || !ts.isIdentifier(setterEl.name)) {
    problems.push(`\`${x}\`'s useState has no named setter`);
    return problems;
  }
  const setter = setterEl.name.text;

  // Step 3 — the setter is only ever CALLED, and only with a literal true/false. A reference that is
  // not a call (`onBusy={setBusy}`, `[setBusy]`, `{ setBusy }`) hands it to code this guard cannot
  // read, which could set it with anything, from anywhere (critic F6).
  const sets: { call: ts.CallExpression; value: boolean }[] = [];
  let handedAway = false;
  walk(component, (n) => {
    if (!ts.isIdentifier(n) || n.text !== setter || n === setterEl.name) return;
    const call = n.parent;
    if (!ts.isCallExpression(call) || call.expression !== n) {
      handedAway = true;
      return;
    }
    const arg = call.arguments[0];
    const value =
      call.arguments.length === 1 && arg?.kind === ts.SyntaxKind.TrueKeyword
        ? true
        : call.arguments.length === 1 && arg?.kind === ts.SyntaxKind.FalseKeyword
          ? false
          : undefined;
    if (value === undefined) problems.push(`\`${setter}(…)\` is called with a non-literal`);
    else sets.push({ call, value });
  });
  if (handedAway)
    problems.push(
      `\`${setter}\` is handed away by reference (only a literal call here can be checked)`,
    );
  const raises = sets.filter((s) => s.value);
  if (raises.length === 0) problems.push(`\`${setter}(true)\` is never called`);

  const startsTransition = transitionStarters(sf);
  // Step 4 + 5 — every raise sits in a live, bounded, finally-cleared function.
  for (const { call } of raises) {
    const f = enclosingFunction(call);
    const where = `\`${setter}(true)\` at ${sf.getLineAndCharacterOfPosition(call.getStart()).line + 1}`;
    if (!f || !f.body || !ts.isBlock(f.body)) {
      problems.push(`${where}: not in a function body`);
      continue;
    }
    const stmts = f.body.statements;
    const at = stmts.findIndex((st) => isSetterStatement(st, setter, true) && within(call, st));
    if (at < 0) {
      problems.push(`${where}: not a top-level statement of its function`);
      continue;
    }
    const tryAt = stmts.findIndex(
      (st, i) =>
        i > at &&
        ts.isTryStatement(st) &&
        !!st.finallyBlock &&
        st.finallyBlock.statements.some((s) => isSetterStatement(s, setter, false)),
    );
    if (tryAt < 0) {
      problems.push(`${where}: no later try whose finally runs \`${setter}(false)\``);
      continue;
    }
    const cleared = stmts[tryAt] as ts.TryStatement;
    // F1 — nothing between the raise and the try may hold the flag (an await: the finally is not
    // reached until it settles) or skip the finally altogether (a return, a throw: latched).
    const between = holdsOrSkips(stmts.slice(at + 1, tryAt), f);
    if (between)
      problems.push(`${where}: ${between} sits between the raise and the try, outside its finally`);
    // F1 — the clear runs FIRST in the finally, or after nothing that can hold or skip it.
    const fin = cleared.finallyBlock!.statements;
    const clearAt = fin.findIndex((s) => isSetterStatement(s, setter, false));
    const beforeClear = holdsOrSkips(fin.slice(0, clearAt), f);
    if (beforeClear)
      problems.push(`${where}: ${beforeClear} in the finally before \`${setter}(false)\``);
    // F1 — EVERY await the try (or its catch) runs in F is a bounded one: `await out.late` after
    // a bounded write holds the flag until the raw answers — P2cz with the guard green.
    let bounded = false;
    for (const part of [cleared.tryBlock, cleared.catchClause?.block]) {
      if (!part) continue;
      walk(part, (n) => {
        if (enclosingFunction(n) !== f) return;
        if (ts.isForOfStatement(n) && n.awaitModifier) {
          problems.push(`${where}: the try awaits \`for await\` unbounded`);
          return;
        }
        if (!ts.isAwaitExpression(n)) return;
        if (!isBoundedAwait(n, f, component, sf)) {
          problems.push(
            `${where}: the try awaits \`${n.expression.getText(sf)}\` unbounded — the flag holds until it answers`,
          );
          return;
        }
        if (part === cleared.tryBlock && !isLiteralDead(n, f)) bounded = true;
      });
    }
    if (!bounded) problems.push(`${where}: the try awaits no bounded write in this function`);
    const name = functionName(f);
    if (!name) {
      problems.push(`${where}: the function has no name a caller can reach`);
      continue;
    }
    let liveRefs = 0;
    walk(component, (n) => {
      if (!ts.isIdentifier(n) || n.text !== name) return;
      if (ts.isFunctionDeclaration(n.parent) && n.parent.name === n) return;
      if (ts.isVariableDeclaration(n.parent) && n.parent.name === n) return;
      if (isLiteralDead(n, component)) return;
      for (let p = n.parent; p && p !== component; p = p.parent) {
        if (ts.isCallExpression(p) && startsTransition(p))
          problems.push(
            `\`${name}\` is called from inside a transition (\`${p.expression.getText(sf)}\`)`,
          );
      }
      liveRefs += 1;
    });
    if (liveRefs === 0) problems.push(`\`${name}\` is never reached (no live reference)`);
  }
  return problems;
}

/** The ONE live `<tag busy=…>` element in a file, or the problem with it. */
function liveElement(sf: ts.SourceFile, tag: string): Jsx | string {
  const live = jsxNamed(sf, tag).filter((el) => !isLiteralDead(el));
  if (live.length !== 1) return `${live.length} live <${tag}> elements (ambiguity is refused)`;
  return live[0]!;
}

/** The component function a JSX element renders in: the nearest enclosing function that declares
 *  `x` (the binding is resolved by scope, never by name across the file). */
function componentDeclaring(el: ts.Node, x: string): ts.FunctionLikeDeclaration | null {
  for (let f = enclosingFunction(el); f; f = enclosingFunction(f)) {
    if (arrayBindings(f, x, 0).some((d) => enclosingFunction(d) === f)) return f;
  }
  return null;
}

/**
 * The whole M82 check for one source text: the live `<tag>`'s `busy`-carrying attribute (`prop`)
 * binds bounded STATE (see the docblock). Pure, so the matcher itself is falsified below.
 */
function busyBindingProblems(rel: string, text: string, tag = "Sheet", prop = "busy"): string[] {
  const sf = parse(rel, text);
  const el = liveElement(sf, tag);
  if (typeof el === "string") return [el];
  const x = boundIdentifier(attr(el, prop));
  if (!x) return [`<${tag} ${prop}={…}> does not bind an identifier`];
  const component = componentDeclaring(el, x.text);
  if (!component) return [`\`${x.text}\` is not declared in the component rendering <${tag}>`];
  return stateShapeProblems(sf, component, x.text);
}

/** Files that render a given JSX tag — parsed, so a comment naming the tag is not a caller. */
const rendering = (tag: string) =>
  componentFiles().filter((f) => jsxNamed(parse(f, readRaw(f)), tag).length > 0);

function sheetCallers(): string[] {
  return rendering("Sheet");
}

/** A live `<Sheet>` in the file passes `busy` at all. */
function passesBusy(rel: string): boolean {
  const sf = parse(rel, readRaw(rel));
  return jsxNamed(sf, "Sheet").some((el) => !isLiteralDead(el) && !!attr(el, "busy"));
}

/** The six that perform an irreversible write, and why each one earned the prop. */
const GUARDED: [file: string, because: string][] = [
  [
    "staff/LossActionSheet.tsx",
    "voidLine spends one of the manager's five PIN attempts before the RPC",
  ],
  ["staff/StaffModSheet.tsx", "the add's refusal renders only inside this sheet, behind the scrim"],
  [
    "LineOptionsSheet.tsx",
    "Send to kitchen now fires a line — one-way for the guest who tapped it (3c-i, D17)",
  ],
  ["staff/RefundActionSheet.tsx", "real money leaves the account"],
  // P7·4 — "Something's wrong": a row, an email and a GitHub issue leave on Send; dismissing
  // mid-flight would hide how it ended (the id the person reads back to us).
  ["staff/HelpButton.tsx", "a report is filed three ways on Send"],
  // K29(b) — the cash confirm moved into the sheet; the settle records the cash and closes the
  // order server-side. Phase 2h — its lock is bounded state, not a transition (P2cz).
  ["staff/CashSettleButton.tsx", "the settle records the cash and closes the order"],
  // Phase 2f — "They didn't come": the no-show cancels the order and records the sent food as a
  // loss, and its step-up spends one of the manager's PIN attempts (LossActionSheet's reason).
  ["staff/CounterNoShowButton.tsx", "the no-show cancels the order and records the loss"],
  // Phase 3c-ii (D27) — the Send-time table sheet: a chip binds the live session to a table, once
  // (`table_number` is set ONCE under the CAS) — dismissing mid-write would hide how it ended, with
  // the same send waiting on the answer.
  ["TableBindSheet.tsx", "the chip binds the live session to a table, once, then the send runs"],
];

/** StaffModSheet takes its busy as a PROP; the contract lives where the value is produced. */
const MOD_SHEET = "staff/StaffModSheet.tsx";
const MOD_SHEET_PARENTS = ["staff/OrderPad.tsx", "kiosk/KioskMenu.tsx"];

/** Sheets that must stay dismissible — pickers, viewers, and writes that land above the sheet. */
const UNGUARDED = [
  "InviteSheet.tsx",
  "JoinTable.tsx",
  "OrdersTray.tsx",
  "PickupSlotSheet.tsx",
  "grocery/GroceryBasketSheet.tsx",
  "grocery/GroceryItemSheet.tsx",
  // PD4 — the Name sheet over the live lens. Its add is the PAGE's `add()` (the one server-priced
  // scanAdd), whose outcome lands above the sheet — the chip in the stage, the Toast — and the sheet
  // closes only on the server's ok: a dismissal mid-write hides nothing (§16's unguarded shape).
  "grocery/GroceryNameSheet.tsx",
  "menu/DietFilterButton.tsx",
  "menu/ItemSheet.tsx",
  // Phase 1a → 3b (D9) — the door sheet behind every door eyebrow, carrying the table's exits: three
  // navigations (and a device-local forget), no server write. It absorbed `menu/TableOptions.tsx`.
  "DoorSheet.tsx",
  // Phase 2b · kitchen — the KDS line's ⋯ sheet. Its 86 IS a write, but a reversible one (a 6s undo
  // in the bar, then /staff/menu) that resolves into the board: dismissing mid-write lands on the
  // busy ⋯ and the write finishes at board level (§16 — `busy` here is the documented anti-pattern).
  "staff/KdsLineMenu.tsx",
  // Phase 2g · P2fz — the oldest-first counter list is a READ (pages of open orders, Show more, Try
  // again). Its rows hand off to the pane or the order's page, where each write has its own sheet.
  "staff/CounterOlderSheet.tsx",
];

describe("M82 — the sheets that hold an irreversible write pass `busy`", () => {
  it.each(GUARDED)("%s passes busy — %s", (rel) => {
    expect(passesBusy(rel)).toBe(true);
  });

  it.each(GUARDED.filter(([f]) => f !== MOD_SHEET))(
    "⚠️ %s — busy is useState cleared in the finally of a bounded write, never a transition's pending (9a)",
    (rel) => {
      expect(busyBindingProblems(rel, readRaw(rel))).toEqual([]);
    },
  );

  it("⚠️ StaffModSheet's busy is a PROP — traced to EVERY parent, each producing bounded state", () => {
    // Codex round 2, P2. `StaffModSheet` takes busy as a PROP, so asserting on that file can only
    // ever confirm a boolean was declared; the contract lives where the value is produced. The prop
    // itself must be what the Sheet reads:
    const sf = parse(MOD_SHEET, readRaw(MOD_SHEET));
    const el = liveElement(sf, "Sheet");
    expect(typeof el).not.toBe("string");
    const x = boundIdentifier(attr(el as Jsx, "busy"));
    expect(x?.text).toBe("busy");
    const comp = enclosingFunction(el as Jsx);
    const param = comp?.parameters[0];
    expect(
      !!param &&
        ts.isObjectBindingPattern(param.name) &&
        param.name.elements.some(
          (e) => ts.isIdentifier(e.name) && e.name.text === "busy" && !e.propertyName,
        ),
    ).toBe(true);
    for (const rel of MOD_SHEET_PARENTS) {
      expect(busyBindingProblems(rel, readRaw(rel), "StaffModSheet", "busy")).toEqual([]);
    }
    // …and those are ALL of its parents, so no third one can wire it from somewhere else.
    expect(rendering("StaffModSheet").sort()).toEqual([...MOD_SHEET_PARENTS].sort());
  });

  it("⚠️ the sheets that write nothing irreversible stay freely dismissible", () => {
    // The negative half, and the one that keeps this honest. `busy` on a picker is a lock with no
    // reason: a diner tugs the handle, nothing happens, and no copy anywhere explains it. If one of
    // these ever needs the prop it will be because it grew a write — which should be a deliberate
    // edit to this list, not a quiet addition nobody reviewed.
    for (const rel of UNGUARDED) {
      expect(passesBusy(rel)).toBe(false);
    }
  });

  it("⚠️ the two lists ARE the Sheet callers — discovered, never transcribed", () => {
    // Codex round 2, P2. The first version asserted `GUARDED.length + UNGUARDED.length === 11`,
    // which checks the two arrays against each other and nothing against the app: a twelfth caller
    // could ship with no `busy` while a test claiming exhaustive coverage stayed green. That is the
    // "never transcribe a number into an assertion" rule, one level up — the LIST was transcribed.
    // Now the call sites are discovered on disk and the union must match them exactly, so a new
    // caller fails here until someone triages it into one list or the other.
    expect(sheetCallers().sort()).toEqual([...GUARDED.map(([f]) => f), ...UNGUARDED].sort());
  });
});

// ── the MATCHER, falsified red-first (LEARNINGS #60: "what text satisfies this without shipping
//    the behaviour?") — each fixture is one evasion, and each must be REFUSED. ───────────────────

/** A minimal sheet in the shipped shape; each case below breaks exactly one part of it. */
const GOOD = `
import { useState } from "react";
import { boundWrite } from "@/lib/bounded-write";
import { settle } from "@/lib/x";
export function Pay() {
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const out = await boundWrite(settle({ a: 1 }));
      void out;
    } finally {
      setBusy(false);
    }
  }
  return <Sheet open busy={busy} onOpenChange={() => {}}><button onClick={submit} /></Sheet>;
}
`;
const swap = (from: string, to: string) => {
  expect(GOOD).toContain(from); // the evasion must actually change the fixture
  return GOOD.replace(from, to);
};

describe("M82 — the matcher refuses every shape that does not ship the behaviour", () => {
  it("accepts the shipped shape (the control)", () => {
    expect(busyBindingProblems("Good.tsx", GOOD)).toEqual([]);
  });

  it("refuses a transition's pending — the pre-Phase-2h shape", () => {
    const src = GOOD.replace(
      `import { useState } from "react";`,
      `import { useState, useTransition } from "react";`,
    )
      .replace(
        "  const [busy, setBusy] = useState(false);",
        "  const [busy, setBusy] = useState(false);\n  const [pending, startTransition] = useTransition();",
      )
      .replace("busy={busy}", "busy={pending}");
    expect(busyBindingProblems("T.tsx", src).join("\n")).toMatch(/useTransition pending/);
  });

  it("refuses a COMMENT carrying the binding — comments are not nodes", () => {
    // The live Sheet passes no busy at all; the binding survives only as comment text — inside the
    // JSX (a `{/* */}` child) and before it (a JS comment).
    const src = swap(
      "return <Sheet open busy={busy} onOpenChange={() => {}}>",
      "return /* <Sheet busy={busy}> */ <Sheet open onOpenChange={() => {}}>{/* busy={busy} */}",
    );
    expect(busyBindingProblems("C.tsx", src)).toEqual([
      "<Sheet busy={…}> does not bind an identifier",
    ]);
  });

  it("refuses a live `busy={pending}` beside a DEAD `{false && <Sheet busy={busy} />}`", () => {
    const src = swap(
      "return <Sheet open busy={busy}",
      "const [pending] = useState(true);\n  return <>{false && <Sheet open busy={busy} onOpenChange={() => {}} />}<Sheet open busy={pending}",
    ).replace("</Sheet>;", "</Sheet></>;");
    // The dead copy is excluded (no ambiguity); the LIVE one is judged — a state with no setter,
    // never raised or cleared in a bounded finally.
    expect(busyBindingProblems("D.tsx", src)).toEqual(["`pending`'s useState has no named setter"]);
  });

  it("refuses two LIVE sheets — ambiguity is refused, never resolved by position", () => {
    const src = swap(
      "return <Sheet open busy={busy}",
      "return <><Sheet open busy={busy} onOpenChange={() => {}} /><Sheet open busy={busy}",
    ).replace("</Sheet>;", "</Sheet></>;");
    expect(busyBindingProblems("A.tsx", src).join("\n")).toMatch(/ambiguity/);
  });

  it("refuses a clear that is not in a finally", () => {
    const src = swap(
      "      void out;\n    } finally {\n      setBusy(false);\n    }",
      "      void out;\n      setBusy(false);\n    } finally {\n    }",
    );
    expect(busyBindingProblems("F.tsx", src).join("\n")).toMatch(/finally/);
  });

  it("refuses a clear parked in a dead `if (false)` inside the finally", () => {
    const src = swap("      setBusy(false);\n    }", "      if (false) setBusy(false);\n    }");
    expect(busyBindingProblems("G.tsx", src).join("\n")).toMatch(/finally/);
  });

  it("refuses an UNBOUNDED await — the raw action, not boundWrite", () => {
    const src = swap("await boundWrite(settle({ a: 1 }))", "await settle({ a: 1 })");
    expect(busyBindingProblems("U.tsx", src).join("\n")).toMatch(/bounded/);
  });

  it("refuses `boundWrite(raceTimeout(…))` — the race reads `threw` at the bound and drops the late answer", () => {
    const src = swap(
      "await boundWrite(settle({ a: 1 }))",
      "await boundWrite(raceTimeout(settle({ a: 1 })))",
    );
    expect(busyBindingProblems("R.tsx", src).join("\n")).toMatch(/bounded/);
  });

  it("refuses a bounded await parked in a dead branch", () => {
    const src = swap(
      "      const out = await boundWrite(settle({ a: 1 }));\n      void out;",
      "      if (false) await boundWrite(settle({ a: 1 }));\n      await settle({ a: 1 });",
    );
    expect(busyBindingProblems("B.tsx", src).join("\n")).toMatch(/bounded/);
  });

  it("refuses a `boundWrite` that is not the contract's", () => {
    const src = swap(
      `import { boundWrite } from "@/lib/bounded-write";`,
      `const boundWrite = <T,>(p: T) => p;`,
    );
    expect(busyBindingProblems("I.tsx", src).join("\n")).toMatch(/bounded/);
  });

  it("refuses a setter fed a non-literal (a flag a branch can strand)", () => {
    const src = swap(
      "      setBusy(false);\n    }",
      "      setBusy(false);\n      setBusy(busy);\n    }",
    );
    expect(busyBindingProblems("N.tsx", src).join("\n")).toMatch(/non-literal/);
  });

  it("refuses a write function nothing reaches, or one reached only from a dead branch", () => {
    const never = swap("<button onClick={submit} />", "<button />");
    expect(busyBindingProblems("V.tsx", never).join("\n")).toMatch(/never reached/);
    const dead = swap("<button onClick={submit} />", "{false && <button onClick={submit} />}");
    expect(busyBindingProblems("W.tsx", dead).join("\n")).toMatch(/never reached/);
  });

  it("refuses a write called from INSIDE a transition (9b — the action must run outside one)", () => {
    const src = GOOD.replace(
      `import { useState } from "react";`,
      `import { startTransition, useState } from "react";`,
    ).replace(
      "onClick={submit}",
      "onClick={() => startTransition(async () => { await submit(); })}",
    );
    expect(busyBindingProblems("S.tsx", src).join("\n")).toMatch(/inside a transition/);
  });

  it("refuses a raise outside the write function's top level (a busy that a branch can skip clearing)", () => {
    const src = swap("    setBusy(true);\n", "    if (busy === false) setBusy(true);\n");
    expect(busyBindingProblems("L.tsx", src).join("\n")).toMatch(/top-level/);
  });
});

// ── critic F1 · F6 (Phase 2h S1 review) — a busy that LATCHES, or a bound hidden behind a name ──
//    The first matcher checked only that a raise, a clearing finally and SOME bounded await
//    existed. Each fixture below satisfied it while holding the flag past the bound — or forever.

describe("M82 — the matcher refuses a flag that can latch, and a bound or a transition behind a name", () => {
  it("refuses a LATE answer awaited inside the try — busy holds until the raw answers (E1, P2cz again)", () => {
    const src = swap("      void out;\n", '      if (out.kind === "waiting") await out.late;\n');
    expect(busyBindingProblems("E1.tsx", src).join("\n")).toMatch(/awaits `out\.late` unbounded/);
  });

  it("refuses an unbounded await BEFORE the bounded one in the try (E2)", () => {
    const src = swap(
      "      const out = await boundWrite(settle({ a: 1 }));\n",
      "      await settle({ a: 0 });\n      const out = await boundWrite(settle({ a: 1 }));\n",
    );
    expect(busyBindingProblems("E2.tsx", src).join("\n")).toMatch(
      /awaits `settle\(\{ a: 0 \}\)` unbounded/,
    );
  });

  it("refuses an await between the raise and the try (E3)", () => {
    const src = swap(
      "    setBusy(true);\n    try {\n",
      "    setBusy(true);\n    await settle({ a: 0 });\n    try {\n",
    );
    expect(busyBindingProblems("E3.tsx", src).join("\n")).toMatch(
      /an await sits between the raise and the try/,
    );
  });

  it("refuses a return or a throw between the raise and the try — the finally never runs (E4)", () => {
    const ret = swap(
      "    setBusy(true);\n    try {\n",
      "    setBusy(true);\n    if (Date.now() % 2) return;\n    try {\n",
    );
    expect(busyBindingProblems("E4.tsx", ret).join("\n")).toMatch(
      /a return sits between the raise and the try/,
    );
    const thr = swap(
      "    setBusy(true);\n    try {\n",
      '    setBusy(true);\n    if (Date.now() % 2) throw new Error("x");\n    try {\n',
    );
    expect(busyBindingProblems("E4b.tsx", thr).join("\n")).toMatch(
      /a throw sits between the raise and the try/,
    );
  });

  it("refuses a finally that can skip or hold its clear — a return or an await before it (E10)", () => {
    const ret = swap(
      "    } finally {\n      setBusy(false);\n",
      "    } finally {\n      if (Date.now() % 2) return;\n      setBusy(false);\n",
    );
    expect(busyBindingProblems("E10.tsx", ret).join("\n")).toMatch(
      /a return in the finally before `setBusy\(false\)`/,
    );
    const wait = swap(
      "    } finally {\n      setBusy(false);\n",
      "    } finally {\n      await settle({ a: 0 });\n      setBusy(false);\n",
    );
    expect(busyBindingProblems("E10b.tsx", wait).join("\n")).toMatch(
      /an await in the finally before `setBusy\(false\)`/,
    );
  });

  it("refuses an unbounded await in the CATCH, and a `for await` in the try", () => {
    const caught = swap(
      "      void out;\n    } finally {",
      "      void out;\n    } catch {\n      await settle({ a: 0 });\n    } finally {",
    );
    expect(busyBindingProblems("E11.tsx", caught).join("\n")).toMatch(
      /awaits `settle\(\{ a: 0 \}\)` unbounded/,
    );
    const loop = swap(
      "      void out;\n",
      "      for await (const x of [settle({ a: 0 })]) void x;\n",
    );
    expect(busyBindingProblems("E12.tsx", loop).join("\n")).toMatch(/awaits `for await` unbounded/);
  });

  it("refuses `boundWrite(raw, ms)` — the bound is the contract's STAFF_HANG_MS, never the caller's (E5)", () => {
    const src = swap(
      "await boundWrite(settle({ a: 1 }))",
      "await boundWrite(settle({ a: 1 }), Infinity)",
    );
    expect(busyBindingProblems("E5.tsx", src).join("\n")).toMatch(/Infinity\)` unbounded/);
  });

  it("refuses a `boundWrite` that is another export renamed (`track as boundWrite`)", () => {
    const src = swap(
      `import { boundWrite } from "@/lib/bounded-write";`,
      `import { track as boundWrite } from "@/lib/bounded-write";`,
    );
    expect(busyBindingProblems("E14.tsx", src).join("\n")).toMatch(/no bounded write/);
  });

  it("refuses a write started through `React.startTransition` — a namespace or a default import (E6)", () => {
    for (const imp of [
      `import * as React from "react";\nimport { useState } from "react";`,
      `import React, { useState } from "react";`,
    ]) {
      const src = swap(`import { useState } from "react";`, imp).replace(
        "onClick={submit}",
        "onClick={() => React.startTransition(async () => { await submit(); })}",
      );
      expect(busyBindingProblems("E6.tsx", src).join("\n")).toMatch(
        /called from inside a transition \(`React\.startTransition`\)/,
      );
    }
  });

  it("refuses a write started through an ALIASED starter — an import alias or a local const (E7)", () => {
    const imported = swap(
      `import { useState } from "react";`,
      `import { startTransition as go, useState } from "react";`,
    ).replace("onClick={submit}", "onClick={() => go(async () => { await submit(); })}");
    expect(busyBindingProblems("E7.tsx", imported).join("\n")).toMatch(
      /called from inside a transition \(`go`\)/,
    );
    const local = swap(
      `import { useState } from "react";`,
      `import { startTransition, useState } from "react";`,
    )
      .replace(
        "  const [busy, setBusy] = useState(false);\n",
        "  const [busy, setBusy] = useState(false);\n  const go = startTransition;\n",
      )
      .replace("onClick={submit}", "onClick={() => go(async () => { await submit(); })}");
    expect(busyBindingProblems("E7b.tsx", local).join("\n")).toMatch(
      /called from inside a transition \(`go`\)/,
    );
  });

  it("refuses `useTransition` imported under useState's name", () => {
    const src = swap(
      `import { useState } from "react";`,
      `import { useTransition as useState } from "react";`,
    );
    expect(busyBindingProblems("E13.tsx", src).join("\n")).toMatch(/useTransition pending/);
  });

  it("refuses the setter handed away by REFERENCE — a child could set it with anything (E8)", () => {
    const src = swap(
      "<button onClick={submit} />",
      "<button onClick={submit} /><Child onBusy={setBusy} />",
    );
    expect(busyBindingProblems("E8.tsx", src).join("\n")).toMatch(
      /`setBusy` is handed away by reference/,
    );
  });

  it("still accepts React's hooks read through a namespace (the resolution is not a refusal by spelling)", () => {
    const src = swap(
      `import { useState } from "react";`,
      `import * as React from "react";`,
    ).replace("useState(false)", "React.useState(false)");
    expect(busyBindingProblems("NS.tsx", src)).toEqual([]);
  });
});
