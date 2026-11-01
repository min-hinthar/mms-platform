import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * M331 — the WIRING the Stripe webhook carries. `app/api/stripe/webhook/route.ts` is
 * `verify:slice-exempt` glue, so no mutant reaches it; the rule lives in `webhookChargeGate`
 * (`lib/payment-recovery.ts`) and its verdict, and this suite proves the route still CALLS it, in the
 * right place: in the generic succeeded arm, the charge is read — awaited, in a statement that
 * finishes before the one that fulfils — and both of its refusals (`unread`, `refunded`) return
 * before `fulfillSucceededIntent` can run.
 *
 * Proved against the AST, never the text (LEARNINGS #60): a name in a comment, or a call after the
 * fulfilment, is not the wiring.
 */
const ROUTE = join(import.meta.dirname, "..", "app", "api", "stripe", "webhook", "route.ts");

function load() {
  const src = readFileSync(ROUTE, "utf8");
  return ts.createSourceFile("route.ts", src, ts.ScriptTarget.Latest, true);
}

/** `await <name>(...)` as a call, or null. */
function awaitedCall(e: ts.Expression | undefined, name: string): ts.CallExpression | null {
  if (!e || !ts.isAwaitExpression(e)) return null;
  const c = e.expression;
  return ts.isCallExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === name
    ? c
    : null;
}

/** The one statement `const x = await <name>(...)`, with its block and its place in it. */
function declaredAwait(sf: ts.SourceFile, name: string) {
  const found: { stmt: ts.VariableStatement; call: ts.CallExpression; binding: string }[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations) {
        const call = awaitedCall(d.initializer, name);
        if (call && ts.isIdentifier(d.name)) found.push({ stmt: n, call, binding: d.name.text });
      }
    }
    // ⚠️ `forEachChild` is a SEARCH primitive: a truthy return aborts the walk.
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(sf);
  return found;
}

/** Does this statement return on every path through its `then` branch (a return, or a block whose
 *  last statement is one)? */
function thenReturns(s: ts.Statement): boolean {
  if (ts.isReturnStatement(s)) return true;
  if (ts.isBlock(s)) {
    const last = s.statements.at(-1);
    return last !== undefined && ts.isReturnStatement(last);
  }
  return false;
}

/** `if (<binding> === "<word>") <returns>` */
function refusesOn(s: ts.Statement, binding: string, word: string): boolean {
  if (!ts.isIfStatement(s)) return false;
  const c = s.expression;
  return (
    ts.isBinaryExpression(c) &&
    c.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    ts.isIdentifier(c.left) &&
    c.left.text === binding &&
    ts.isStringLiteral(c.right) &&
    c.right.text === word &&
    thenReturns(s.thenStatement)
  );
}

describe("the webhook reads the charge before it fulfils (M331)", () => {
  it("one fulfilment, preceded in its own block by the awaited gate and both refusals", () => {
    const sf = load();
    const fulfils = declaredAwait(sf, "fulfillSucceededIntent");
    expect(fulfils).toHaveLength(1);
    const fulfil = fulfils[0]!;
    const block = fulfil.stmt.parent;
    expect(ts.isBlock(block)).toBe(true);
    const stmts = (block as ts.Block).statements;
    const at = stmts.indexOf(fulfil.stmt);

    // The gate: awaited, in an EARLIER statement of the same block, on the same intent's id.
    const gates = declaredAwait(sf, "webhookChargeGate").filter((g) => g.stmt.parent === block);
    expect(gates).toHaveLength(1);
    const gate = gates[0]!;
    expect(stmts.indexOf(gate.stmt)).toBeLessThan(at);
    const fulfilIntent = fulfil.call.arguments[0];
    const gateArg = gate.call.arguments[0];
    expect(fulfilIntent && ts.isIdentifier(fulfilIntent)).toBe(true);
    expect(
      gateArg !== undefined &&
        ts.isPropertyAccessExpression(gateArg) &&
        ts.isIdentifier(gateArg.expression) &&
        gateArg.expression.text === (fulfilIntent as ts.Identifier).text &&
        gateArg.name.text === "id",
    ).toBe(true);

    // Both refusals return between the gate and the fulfilment.
    const between = stmts.slice(stmts.indexOf(gate.stmt) + 1, at);
    expect(between.some((s) => refusesOn(s, gate.binding, "unread"))).toBe(true);
    expect(between.some((s) => refusesOn(s, gate.binding, "refunded"))).toBe(true);
  });
});
