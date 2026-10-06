import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { DOORS, currentDoor } from "./doors";
import { dineInMenuHref } from "./table-pick";

/**
 * Phase 3b (D9) — the three doors are ONE table. The home renders it and the DoorSheet renders it,
 * so the two can never disagree about a name, a Burmese line or an href. This suite pins the table's
 * shape and the two places its copy must agree with: the v7.2 prototype (the Dine-in line is
 * verbatim from it — computed from the file, never transcribed) and `app/page.tsx` (which must
 * render `DOORS.map(…)`, not three hand-typed cards that drift from the sheet).
 */
const QR = path.join(__dirname, "..");
const V72 = readFileSync(path.join(QR, "..", "..", "docs", "prototype", "v7.2.html"), "utf8");

describe("DOORS — the one door table", () => {
  it("is the three doors, in the home's order, each mode and href unique", () => {
    expect(DOORS.map((d) => d.mode)).toEqual(["dinein", "pickup", "grocery"]);
    expect(new Set(DOORS.map((d) => d.href)).size).toBe(DOORS.length);
    for (const d of DOORS) {
      expect(d.href.startsWith("/")).toBe(true);
      expect(d.name.trim()).not.toBe("");
      expect(d.description.trim()).not.toBe("");
      // The Burmese companion is real content (lang="my"), so it must actually be Myanmar script.
      expect(d.my).toMatch(/[က-႟]/);
    }
  });

  it("the Dine-in line is v7.2's, verbatim — read from the prototype's own modecard", () => {
    const m = V72.match(/pickMode\('dinein'\)[^\n]*?<div class="d">([^<]+)<\/div>/);
    expect(m?.[1]).toBeTruthy();
    expect(DOORS.find((d) => d.mode === "dinein")?.description).toBe(m![1]);
    // The retired line promised a pre-menu picker that a later slice retires; it may not return.
    expect(DOORS.map((d) => d.description)).not.toContain(
      "Pick your table, invite friends, order together",
    );
  });

  it("3c-ii (D27) — the Dine-in door enters the MENU on a bare host-start: the ONE builder's href, as a literal (doors cannot import table-pick — table-pick imports doors)", () => {
    // The pre-menu picker (/dine-in → TablePicker) retired; the table is asked inside the first Send.
    // A door whose href still named /dine-in would cost the diner a redirect on every entry and put
    // a `?table=N` claim back in front of the menu.
    const href = DOORS.find((d) => d.mode === "dinein")!.href;
    expect(href).toBe(dineInMenuHref({}));
    expect(href).not.toBe("/dine-in");
  });

  it("currentDoor maps the menu's internal modes onto the doors (scango IS the market)", () => {
    expect(currentDoor("dinein").mode).toBe("dinein");
    expect(currentDoor("pickup").mode).toBe("pickup");
    expect(currentDoor("scango").mode).toBe("grocery");
    // An unknown mode falls back to the market — the same word `doorFor` (below in this module) shows in the
    // eyebrow for an unknown mode, so the trigger and the lit row never name two different doors.
    expect(currentDoor("garbled").mode).toBe("grocery");
  });
});

describe("app/page.tsx renders the table, never three hand-typed doors", () => {
  const file = "app/page.tsx";
  const src = readFileSync(path.join(QR, file), "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  /** The literal-dead shapes a parked copy hides under (LEARNINGS #60). */
  const isDead = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n; p; p = p.parent) {
      if (ts.isBinaryExpression(p) && p.left.kind === ts.SyntaxKind.FalseKeyword) return true;
      if (ts.isConditionalExpression(p) && p.condition.kind === ts.SyntaxKind.FalseKeyword)
        return true;
      if (ts.isIfStatement(p) && p.expression.kind === ts.SyntaxKind.FalseKeyword) return true;
    }
    return false;
  };

  it('has exactly one live `DOORS.map(…)` call, and no <ModeCard href="…"> literal', () => {
    const maps: ts.CallExpression[] = [];
    const literalCards: string[] = [];
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.expression) &&
        n.expression.expression.text === "DOORS" &&
        n.expression.name.text === "map" &&
        !isDead(n)
      )
        maps.push(n);
      if (
        (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
        ts.isIdentifier(n.tagName) &&
        n.tagName.text === "ModeCard"
      ) {
        for (const a of n.attributes.properties) {
          if (
            ts.isJsxAttribute(a) &&
            ts.isIdentifier(a.name) &&
            a.name.text === "href" &&
            a.initializer &&
            ts.isStringLiteral(a.initializer)
          )
            literalCards.push(a.initializer.text);
        }
      }
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
    expect(maps).toHaveLength(1);
    expect(literalCards).toEqual([]);
    // And the table it maps is THIS module's, not a local copy.
    const imports = sf.statements.filter(ts.isImportDeclaration).map((d) => ({
      from: (d.moduleSpecifier as ts.StringLiteral).text,
      names:
        d.importClause?.namedBindings && ts.isNamedImports(d.importClause.namedBindings)
          ? d.importClause.namedBindings.elements.map((e) => e.name.text)
          : [],
    }));
    expect(imports.some((i) => i.from === "@/lib/doors" && i.names.includes("DOORS"))).toBe(true);
  });
});
