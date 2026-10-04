import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Deep pass on #312 (money semantics, HIGH) — the DoorSheet's To-go row from a dine-in table links
 * `/menu?mode=pickup&door=togo`: the SAME pathname, so Next keeps the page's client tree and
 * `TableCartProvider` lived on with the table's session and shared cart under `mode="pickup"` — the
 * menu re-skinned as To-go while every Add wrote to the table bill the diner believed they had left.
 * `useTableSession` says it in so many words ("a *runtime* mode change still no-ops — remount the
 * route to switch modes"), so the page keys the provider on the door: a new door is a new provider,
 * a new mint, a new cart. Parsed, never grepped: the `key` must be a JSX attribute on the ONE
 * `<TableCartProvider>` the page renders and its expression must read `mode` — and NOTHING else
 * (Codex round 1 on #313): `code` is the `?t=`/`?j=` credential `useTableSession` strips from the URL
 * after the mint, so a key that carried it changed on the next `router.refresh()` and remounted (and
 * re-minted) a provider whose door had not moved.
 */
const PAGE = path.resolve(__dirname, "../app/(order)/menu/page.tsx");

function providerOpenings(): ts.JsxOpeningLikeElement[] {
  const src = ts.createSourceFile(
    PAGE,
    readFileSync(PAGE, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const out: ts.JsxOpeningLikeElement[] = [];
  const visit = (n: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
      n.tagName.getText(src) === "TableCartProvider"
    )
      out.push(n);
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(src);
  return out;
}

describe("the menu page remounts its cart provider when the door changes", () => {
  it("renders exactly one <TableCartProvider> (ambiguity is refused, not resolved by position)", () => {
    expect(providerOpenings()).toHaveLength(1);
  });
  it("keys it on `mode` ALONE — a same-pathname door switch mints the new door's own session and cart, and a stripped credential cannot remount it", () => {
    const [el] = providerOpenings();
    const key = el!.attributes.properties.find(
      (a) => ts.isJsxAttribute(a) && a.name.getText() === "key",
    ) as ts.JsxAttribute | undefined;
    expect(key, "a `key` attribute on <TableCartProvider>").toBeDefined();
    const init = key!.initializer;
    expect(init && ts.isJsxExpression(init) && init.expression, "key={<expression>}").toBeTruthy();
    const ids = new Set<string>();
    const visit = (n: ts.Node) => {
      if (ts.isIdentifier(n)) ids.add(n.text);
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit((init as ts.JsxExpression).expression!);
    expect([...ids]).toEqual(["mode"]);
  });
});
