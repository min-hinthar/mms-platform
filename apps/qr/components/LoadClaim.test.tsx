/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { LOAD_SEQ_KEY, isImmediatelyAfter, resetLoadForTests, thisLoad } from "@/lib/tab-load";
import { LoadClaim } from "./LoadClaim";

/**
 * Phase 2i (P2bi) · S0 critic F5 — every document claims its load, whether or not anything on it
 * reads the generation, so a page in between two lane documents breaks "immediately after".
 */
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("LoadClaim", () => {
  it("claims this document's load at mount, with no consumer on the page", () => {
    // MUTATION (p2i-load/claim-lazy): the claim is left to the feature that reads it — a page that
    // never reads it leaves the counter where it was; red.
    sessionStorage.setItem(LOAD_SEQ_KEY, "4");
    render(<LoadClaim />);
    expect(sessionStorage.getItem(LOAD_SEQ_KEY)).toBe("5");
  });

  it("a page in between (claimed here) is not 'immediately after' for the page before it", () => {
    // Lane document: seq 1, stash written at seq 1.
    const lane = thisLoad();
    const stash = { seq: lane.seq, path: lane.initialPath };
    // Another page of the origin, which reads nothing: LoadClaim alone claims it.
    resetLoadForTests();
    render(<LoadClaim />);
    // Back to the lane page: seq 3, not 2.
    resetLoadForTests();
    expect(isImmediatelyAfter(stash, thisLoad())).toBe(false);
  });
});

describe("the root layout mounts it — every document of the origin", () => {
  it("one live <LoadClaim /> in the root layout, imported from the component", () => {
    // Red-first: dropping the element (or parking it in `{false && …}`) fails here.
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "layout.tsx");
    const sf = ts.createSourceFile(
      "layout.tsx",
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let imported = false;
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const nb = st.importClause?.namedBindings;
      if (st.moduleSpecifier.text === "@/components/LoadClaim" && nb && ts.isNamedImports(nb))
        imported = nb.elements.some((e) => e.name.text === "LoadClaim" && !e.propertyName);
    }
    expect(imported).toBe(true);
    const live: ts.Node[] = [];
    const dead = (n: ts.Node): boolean => {
      for (let c: ts.Node = n; c.parent !== undefined; c = c.parent) {
        const p = c.parent;
        if (
          ts.isBinaryExpression(p) &&
          c === p.right &&
          p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
          [ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(p.left.kind)
        )
          return true;
        if (ts.isConditionalExpression(p)) {
          if (c === p.whenTrue && p.condition.kind === ts.SyntaxKind.FalseKeyword) return true;
          if (c === p.whenFalse && p.condition.kind === ts.SyntaxKind.TrueKeyword) return true;
        }
      }
      return false;
    };
    const visit = (n: ts.Node): void => {
      if (
        (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) &&
        n.tagName.getText(sf) === "LoadClaim" &&
        !dead(n)
      )
        live.push(n);
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
    expect(live).toHaveLength(1);
  });
});
