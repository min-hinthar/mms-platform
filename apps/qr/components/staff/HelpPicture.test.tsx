/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { HELP_CARD_COUNT, HELP_SCREENS, type HelpScreen } from "@/lib/help";
import { HelpPicture } from "./HelpPicture";

/**
 * P7·3 — every picture is the real control's OWN declaration, bound structurally: the class the
 * control wears, the style object the control spreads, or the one CSS rule that names both. The
 * first draft passed a green/inverted pair of takeaway stages, an undo pill in the bar's colours,
 * a Screens circle in the static mark's class and a kitchen strip on the takeaway card through a
 * suite that only checked `aria-hidden` — so this file checks the BINDINGS, not the look.
 */
afterEach(cleanup);
const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const pic = (screen: HelpScreen, n: number) =>
  render(<HelpPicture screen={screen} n={n} lang="en" />).container.querySelector(".help-pic")!;

describe("HelpPicture — the real control, inert", () => {
  it("every card's picture is hidden and never empty", () => {
    for (const screen of HELP_SCREENS)
      for (let n = 1; n <= HELP_CARD_COUNT; n++) {
        const p = pic(screen, n);
        expect(p.getAttribute("aria-hidden"), `${screen} ${n}`).toBe("true");
        expect(p.children.length, `${screen} ${n}`).toBeGreaterThan(0);
        cleanup();
      }
  });

  it("the undo replica sits in the real bar and shares the button's ONE rule — no rule of its own", () => {
    expect(pic("kitchen", 2).querySelector(".kds-undo > .help-pic-undo-btn")).not.toBeNull();
    // The rule that declares the real button's look names the replica in the SAME selector list…
    const rule = css.match(/([^{}]*\.kds-undo button[^{]*)\{/);
    expect(rule?.[1]).toMatch(/\.kds-undo \.help-pic-undo-btn/);
    // …and nothing declares the replica on its own (that second declaration is the drift).
    expect(css).not.toMatch(/^\s*\.help-pic-undo-btn\s*\{/m);
  });

  it("the Screens circle is the control's class, never the bar's static mark; Register is the real tile", () => {
    const circ = pic("counter", 3).querySelector(".staff-circ")!;
    expect(circ).not.toBeNull();
    expect(circ.className).not.toContain("staff-circ-here");
    cleanup();
    const tile = pic("counter", 1).querySelector(".staff-counter-primary.card-textured")!;
    expect(tile).not.toBeNull();
    expect(tile.querySelector(".staff-door-name")).not.toBeNull();
    cleanup();
    const table = pic("counter", 2);
    expect(table.querySelector(".card.card-textured")).not.toBeNull();
    expect(table.textContent).toContain("Table 7");
    expect(table.textContent).toContain("Ordering");
  });

  it("the takeaway stages spread the board's own style objects: first stage accent, second plain", () => {
    // jsdom keeps `var()` values on inline styles, so the spread can be read back.
    const first = pic("expo", 1).querySelector(".staff-btn") as HTMLElement;
    expect(first.style.background).toBe("var(--ac)");
    expect(first.style.color).toBe("var(--oa)");
    cleanup();
    const second = pic("expo", 2).querySelector(".staff-btn") as HTMLElement;
    expect(second.style.background).toBe("var(--cd)");
    expect(second.style.color).toBe("var(--tx)");
    cleanup();
    const pair = pic("expo", 3).querySelectorAll(".staff-btn");
    expect(pair.length).toBe(2);
    expect((pair[0] as HTMLElement).style.background).toBe("var(--ac)");
    expect((pair[1] as HTMLElement).style.background).toBe("var(--cd)");
  });

  it("the takeaway frozen card is the board's status line, never the kitchen strip", () => {
    const p = pic("expo", 4);
    expect(p.querySelector(".expo-status.expo-status-warn")).not.toBeNull();
    expect(p.querySelector(".kds-strip")).toBeNull();
    const warn = css.match(/\.expo-status-warn\s*\{([^}]*)\}/);
    expect(warn?.[1]).toMatch(/color:\s*var\(--warn\)/);
  });

  it("ExpoBoard wears the same declarations — the stage styles imported, the status line classed", () => {
    const src = readFileSync(join(__dirname, "ExpoBoard.tsx"), "utf8");
    const sf = ts.createSourceFile("ExpoBoard.tsx", src, ts.ScriptTarget.Latest, true);
    const imported = new Set<string>();
    const declared = new Set<string>();
    let statusClassed = false;
    let statusInlineStyle = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "./expo-stage" &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      )
        for (const e of node.importClause.namedBindings.elements) imported.add(e.name.text);
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
        declared.add(node.name.text);
      // The LIVE <p role="status"> — its className is the conditional over the two shared classes,
      // and it carries no inline style (an inline colour is the copy that drifts).
      if (ts.isJsxOpeningElement(node) && node.tagName.getText() === "p") {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const role = attrs.find((a) => a.name.getText() === "role");
        if (
          role?.initializer &&
          ts.isStringLiteral(role.initializer) &&
          role.initializer.text === "status"
        ) {
          const cls = attrs.find((a) => a.name.getText() === "className");
          if (
            cls?.initializer &&
            ts.isJsxExpression(cls.initializer) &&
            cls.initializer.expression
          ) {
            const e = cls.initializer.expression;
            if (
              ts.isConditionalExpression(e) &&
              ts.isStringLiteral(e.whenTrue) &&
              ts.isStringLiteral(e.whenFalse) &&
              e.whenTrue.text === "expo-status expo-status-warn" &&
              e.whenFalse.text === "expo-status"
            )
              statusClassed = true;
          }
          if (attrs.some((a) => a.name.getText() === "style")) statusInlineStyle = true;
        }
      }
      ts.forEachChild(node, (c) => {
        visit(c);
      });
    };
    visit(sf);
    for (const name of ["bumpBtn", "readyBtn", "pickedBtn"]) {
      expect(imported.has(name), `${name} imported`).toBe(true);
      expect(declared.has(name), `${name} not redeclared`).toBe(false);
    }
    expect(statusClassed).toBe(true);
    expect(statusInlineStyle).toBe(false);
  });
});
