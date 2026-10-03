import { readdirSync, readFileSync } from "node:fs";
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

/** Every JSX `id="<lit>"` across the staff components and the page, with its file. */
function jsxIds(): Map<string, string[]> {
  const files = [
    PAGE,
    ...readdirSync(STAFF_DIR)
      .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
      .map((f) => join(STAFF_DIR, f)),
  ];
  const found = new Map<string, string[]>();
  for (const file of files) {
    const visit = (n: ts.Node) => {
      if (
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
      "floor-h",
      "expo-h",
      "appr-h",
      "day-cash-h",
      "settled-h",
    ]);
  });
  it.each(zonesDeclared())("zone $id is rendered as exactly one JSX id= somewhere", (z) => {
    expect(ids.get(z.id) ?? []).toHaveLength(1);
  });
});
