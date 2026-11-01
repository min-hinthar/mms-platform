import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * M331 — the WIRING the Stripe webhook carries. The charge gate itself lives in the fulfilment
 * (`webhookChargeGate`, `lib/fulfill-intent.ts`, after its order read and its cartId check, where its
 * mutants reach it). `app/api/stripe/webhook/route.ts` is `verify:slice-exempt` glue that maps the
 * fulfilment's outcome to the status Stripe reads, so this suite pins the two answers the gate
 * depends on (the blind pass on #375: "the route's 500 and 200 replies are not pinned by anything"):
 *
 *   • a `retry` — an unreadable charge among them — answers 500, so Stripe redelivers;
 *   • `charge_refunded` answers 200, so Stripe stops: a redelivery cannot un-refund a charge.
 *
 * Proved against the AST, never the text (LEARNINGS #60): a status in a comment, or a reply in a dead
 * branch, is not the wiring.
 */
const ROUTE = join(import.meta.dirname, "..", "app", "api", "stripe", "webhook", "route.ts");

function load() {
  const src = readFileSync(ROUTE, "utf8");
  return ts.createSourceFile("route.ts", src, ts.ScriptTarget.Latest, true);
}

/** Every `switch (<binding>.kind)` whose binding is `const <binding> = await fulfillSucceededIntent(…)`
 *  declared earlier in the same block. */
function fulfilmentSwitches(sf: ts.SourceFile): ts.SwitchStatement[] {
  const found: ts.SwitchStatement[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isBlock(n)) {
      const bindings = new Set<string>();
      for (const st of n.statements) {
        if (ts.isVariableStatement(st)) {
          const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
          for (const d of st.declarationList.declarations) {
            const init = d.initializer;
            if (
              isConst &&
              ts.isIdentifier(d.name) &&
              init !== undefined &&
              ts.isAwaitExpression(init) &&
              ts.isCallExpression(init.expression) &&
              ts.isIdentifier(init.expression.expression) &&
              init.expression.expression.text === "fulfillSucceededIntent"
            )
              bindings.add(d.name.text);
          }
        }
        if (
          ts.isSwitchStatement(st) &&
          ts.isPropertyAccessExpression(st.expression) &&
          st.expression.name.text === "kind" &&
          ts.isIdentifier(st.expression.expression) &&
          bindings.has(st.expression.expression.text)
        )
          found.push(st);
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

/** The `NextResponse.json(…)` call a case clause returns, or null when it returns anything else. */
function returnedJson(sw: ts.SwitchStatement, label: string): ts.CallExpression | null {
  const clause = sw.caseBlock.clauses.find(
    (c): c is ts.CaseClause =>
      ts.isCaseClause(c) && ts.isStringLiteral(c.expression) && c.expression.text === label,
  );
  if (!clause) return null;
  const ret = clause.statements.find(ts.isReturnStatement);
  const e = ret?.expression;
  if (!e || !ts.isCallExpression(e)) return null;
  const callee = e.expression;
  return ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "NextResponse" &&
    callee.name.text === "json"
    ? e
    : null;
}

/** The value of a literal object's `name: <literal>` property, or undefined. */
function literalProp(e: ts.Expression | undefined, name: string): string | undefined {
  if (!e || !ts.isObjectLiteralExpression(e)) return undefined;
  for (const p of e.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      const v = p.initializer;
      if (ts.isNumericLiteral(v)) return v.text;
      if (v.kind === ts.SyntaxKind.TrueKeyword) return "true";
      if (v.kind === ts.SyntaxKind.FalseKeyword) return "false";
      if (ts.isStringLiteral(v)) return v.text;
    }
  }
  return undefined;
}

describe("the webhook answers the charge gate's two outcomes as Stripe must read them (M331)", () => {
  const switches = fulfilmentSwitches(load());

  it("one switch maps the fulfilment's outcome", () => {
    expect(switches).toHaveLength(1);
  });

  it("a `retry` (an unreadable charge among them) answers 500, so Stripe redelivers", () => {
    const call = returnedJson(switches[0]!, "retry");
    expect(call).not.toBeNull();
    expect(literalProp(call!.arguments[1], "status")).toBe("500");
  });

  it("`charge_refunded` answers 200 with `received: true`, so Stripe stops redelivering", () => {
    const call = returnedJson(switches[0]!, "charge_refunded");
    expect(call).not.toBeNull();
    // One argument: no init, so no status — 200.
    expect(call!.arguments).toHaveLength(1);
    expect(literalProp(call!.arguments[0], "received")).toBe("true");
  });
});
