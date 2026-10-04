import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Phase 3a (D5) — the counter home's zone strip jumps to heading IDS the page TRANSCRIBES
 * (`app/staff/page.tsx`'s `zones` list), while the headings themselves are rendered by five
 * components. A renamed heading id would leave a dead chip with every other test green (blind pass
 * on #312, guard integrity). This guard PARSES both sides (LEARNINGS #60 — never a substring scan):
 * every `{ id: "…", k: "…" }` object literal in the page is a zone, and each zone's id must be the
 * string value of exactly ONE JSX `id=` attribute across the page and the staff components.
 */
const QR = join(__dirname, "..");
const PAGE = join(QR, "app", "staff", "page.tsx");
const STAFF_DIR = join(QR, "components", "staff");

function parse(file: string) {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

/** Every `{ id: "<lit>", k: "<lit>" }` in the page. */
function zonesDeclared(): { id: string; k: string }[] {
  const out: { id: string; k: string }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n)) {
      const get = (name: string) => {
        const p = n.properties.find(
          (q): q is ts.PropertyAssignment =>
            ts.isPropertyAssignment(q) && ts.isIdentifier(q.name) && q.name.text === name,
        );
        return p && ts.isStringLiteral(p.initializer) ? p.initializer.text : null;
      };
      const id = get("id");
      const k = get("k");
      if (id && k) out.push({ id, k });
    }
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(parse(PAGE));
  return out;
}

/**
 * The files the page RENDERS: itself and every staff component it imports. Deep pass on #312: the
 * first draft listed the whole `components/staff` directory, so a zone whose component was dropped
 * from the page (or whose heading moved into a component `/staff` never renders) kept its chip with
 * the guard green — the dead chip the guard exists to catch. Bound to the imports instead; a
 * heading that lives deeper than one import is reported as missing, which is the honest failure.
 */
function renderedFiles(): string[] {
  const files = [PAGE];
  const visit = (n: ts.Node) => {
    if (
      ts.isImportDeclaration(n) &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      n.moduleSpecifier.text.startsWith("@/components/staff/")
    ) {
      const rel = n.moduleSpecifier.text.slice("@/components/staff/".length);
      files.push(join(STAFF_DIR, rel.endsWith(".tsx") || rel.endsWith(".ts") ? rel : `${rel}.tsx`));
    }
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(parse(PAGE));
  return files;
}

/** Every JSX `id="<lit>"` across the files the page renders, with its file. */
function jsxIds(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of renderedFiles()) {
    const visit = (n: ts.Node) => {
      // An `id=` on an INTRINSIC element (lowercase tag) is a DOM id; the same prop on a component
      // (`<ZoneFocus id="…">`) is an argument, not an anchor.
      const owner = n.parent?.parent;
      const intrinsic =
        owner &&
        (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner)) &&
        /^[a-z]/.test(owner.tagName.getText());
      if (
        intrinsic &&
        ts.isJsxAttribute(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === "id" &&
        n.initializer &&
        ts.isStringLiteral(n.initializer)
      ) {
        const v = n.initializer.text;
        found.set(v, [...(found.get(v) ?? []), file]);
      }
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(parse(file));
  }
  return found;
}

describe("the counter zone strip's anchors resolve", () => {
  const zones = zonesDeclared();
  const ids = jsxIds();
  it("the page declares the six zones (a count that rises or falls is a design change, not drift)", () => {
    expect(zones.map((z) => z.id)).toEqual([
      "start-h",
      "floor-zone",
      "expo-h",
      "appr-zone",
      "day-cash-h",
      "settled-h",
    ]);
  });
  it("the Tables chip is NOT the pane's close sentinel (`#floor-h` = FLOOR_HASH closes an open table at split width)", () => {
    expect(zones.map((z) => z.id)).not.toContain("floor-h");
  });
  it("scans the page and the staff components it imports — never a staff file /staff does not render", () => {
    const files = renderedFiles().map((f) => f.split("/").pop());
    expect(files).toContain("page.tsx");
    expect(files).toContain("FloorBoard.tsx");
    expect(files).toContain("ApprovalsBoard.tsx");
    expect(files).not.toContain("KdsBoard.tsx");
  });
  it.each(zonesDeclared())("zone $id is rendered as exactly one JSX id= somewhere", (z) => {
    expect(ids.get(z.id) ?? []).toHaveLength(1);
  });
});
