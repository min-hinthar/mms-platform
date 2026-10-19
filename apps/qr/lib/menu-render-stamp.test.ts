import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Codex P2 on #362 (menu/page.tsx) — the render's sold-out stamp must be taken NO LATER than the
 * catalog read it stamps. /menu weighs that render against the cart view's `dbNow` and a refusal's
 * stamp (`freshestSoldOut`); a stamp STARTED beside the catalog query could be taken after the
 * snapshot, and the stale render then outvoted a fresher cart reading. So the clock is AWAITED, in a
 * top-level statement of the page that finishes before the statement issuing the catalog query.
 * Parsed, never grepped (LEARNINGS #60): exactly one `dbClockIso(…)` call and one
 * `.from("menu_items")` query in the page, each in its own top-level statement of the page body.
 */
const PAGE = path.resolve(__dirname, "../app/(order)/menu/page.tsx");

function pageBody(): { src: ts.SourceFile; body: ts.Block } {
  const src = ts.createSourceFile(
    PAGE,
    readFileSync(PAGE, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const fns = src.statements.filter(
    (s): s is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(s) &&
      !!s.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword),
  );
  expect(fns, "exactly one default-exported page function").toHaveLength(1);
  return { src, body: fns[0]!.body! };
}

function find(root: ts.Node, pred: (n: ts.Node) => boolean): ts.Node[] {
  const out: ts.Node[] = [];
  const visit = (n: ts.Node) => {
    if (pred(n)) out.push(n);
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(root);
  return out;
}

const isClockCall = (n: ts.Node) =>
  ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "dbClockIso";
const isCatalogFrom = (n: ts.Node) =>
  ts.isCallExpression(n) &&
  ts.isPropertyAccessExpression(n.expression) &&
  n.expression.name.text === "from" &&
  n.arguments.length === 1 &&
  ts.isStringLiteral(n.arguments[0]!) &&
  n.arguments[0]!.text === "menu_items";

/** The top-level statement of the page body that holds `n`. */
function topStatement(body: ts.Block, n: ts.Node): ts.Statement {
  let cur: ts.Node = n;
  while (cur.parent && cur.parent !== body) cur = cur.parent;
  return cur as ts.Statement;
}

describe("the /menu render stamp is taken before the catalog read it stamps", () => {
  it("awaits the ONE `dbClockIso` in a statement that finishes before the catalog query starts", () => {
    const { body } = pageBody();
    const clocks = find(body, isClockCall);
    const catalogs = find(body, isCatalogFrom);
    // Ambiguity refused, never resolved by position.
    expect(clocks).toHaveLength(1);
    expect(catalogs).toHaveLength(1);
    const clock = clocks[0]!;
    // MUTATION (lcb/menu/render-stamp-beside-the-read): start the clock beside the query and await
    // it later — the stamp can postdate the snapshot; red.
    expect(
      ts.isAwaitExpression(clock.parent) ||
        (ts.isParenthesizedExpression(clock.parent) && ts.isAwaitExpression(clock.parent.parent)),
      "the dbClockIso(…) call is itself awaited",
    ).toBe(true);
    const clockStmt = topStatement(body, clock);
    const catalogStmt = topStatement(body, catalogs[0]!);
    // A plain sequential statement (a declaration or an expression), so its await settles before the
    // next statement runs — not a branch that may never run.
    expect(ts.isVariableStatement(clockStmt) || ts.isExpressionStatement(clockStmt)).toBe(true);
    expect(body.statements.indexOf(clockStmt)).toBeGreaterThanOrEqual(0);
    expect(body.statements.indexOf(clockStmt)).toBeLessThan(body.statements.indexOf(catalogStmt));
  });
});
