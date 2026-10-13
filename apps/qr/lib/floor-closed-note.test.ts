import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { closedFloorHref, closedNoteOf, withoutClosedParam } from "./floor-closed-note";
import { STAFF_DOOR_TARGET } from "./staff-door";

/**
 * The lifecycle audit — a table closed under a server's page says so on the floor it lands on. Every
 * case is one a `lck/closed-note/*` mutant turns red.
 */
describe("closedFloorHref — the bounce carries the table's name", () => {
  it("a registered table carries its NUMBER (what the floor calls it)", () => {
    // lck/closed-note/bounce-unnamed — the floor never hears which table closed.
    expect(closedFloorHref({ kind: "closed", label: "T6", tableNumber: 6 })).toBe(
      `${STAFF_DOOR_TARGET.counter}&closed=6`,
    );
  });

  it("an unregistered table carries its label, encoded", () => {
    expect(closedFloorHref({ kind: "closed", label: "Patio 2", tableNumber: null })).toBe(
      `${STAFF_DOOR_TARGET.counter}&closed=Patio%202`,
    );
  });

  it("a COUNTER order (its verdict carries the handoff key) keeps the plain floor — no table to name", () => {
    // lck/closed-note/counter-named-a-table — "Table reg-7f3a closed" on the floor.
    for (const handoff of [null, undefined]) {
      const v = { kind: "closed" as const, label: "reg-7f3a", tableNumber: null, handoff };
      expect(closedFloorHref(v)).toBe(
        handoff === undefined
          ? `${STAFF_DOOR_TARGET.counter}&closed=reg-7f3a`
          : STAFF_DOOR_TARGET.counter,
      );
    }
  });

  it("a verdict with no row has nothing to say: the plain floor", () => {
    expect(closedFloorHref({ kind: "closed" })).toBe(STAFF_DOOR_TARGET.counter);
  });

  it("a name the floor would not say is never carried", () => {
    expect(closedFloorHref({ kind: "closed", label: "x".repeat(40), tableNumber: null })).toBe(
      STAFF_DOOR_TARGET.counter,
    );
  });
});

describe("closedNoteOf — the server page's read of the param", () => {
  it("a table's name passes; anything else is no note", () => {
    expect(closedNoteOf("6")).toBe("6");
    expect(closedNoteOf("Patio 2")).toBe("Patio 2");
    // lck/closed-note/any-text-said — a typed address puts its own sentence in the floor's region.
    for (const bad of ["", " 6", "<b>6</b>", "x".repeat(25), "6\n7"])
      expect(closedNoteOf(bad)).toBe(null);
    expect(closedNoteOf(["6", "7"])).toBe(null);
    expect(closedNoteOf(undefined)).toBe(null);
  });
});

describe("withoutClosedParam — said once", () => {
  it("drops only the note's param, keeping the floor's own and the hash", () => {
    // lck/closed-note/param-kept — a reload says the closed table again.
    expect(withoutClosedParam("https://x.test/staff?floor=1&closed=6#appr-h")).toBe(
      "/staff?floor=1#appr-h",
    );
    expect(withoutClosedParam("https://x.test/staff?closed=6")).toBe("/staff");
  });
});

describe("the counter home hands the floor the note (app/staff/page.tsx)", () => {
  it("the ONE <FloorBoard> takes `closedTable` from `closedNoteOf` over the request's `closed`", () => {
    // PARSED, never scanned (LEARNINGS #60): a comment naming the prop satisfies nothing.
    // lck/staff-home/closed-note-unread — the bounce carries the name and nobody reads it; red.
    const file = join(__dirname, "..", "app", "staff", "page.tsx");
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const boards: string[] = [];
    const visit = (n: ts.Node) => {
      if (
        (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) &&
        n.tagName.getText(sf) === "FloorBoard"
      ) {
        const a = n.attributes.properties.find(
          (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === "closedTable",
        );
        const e =
          a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : null;
        boards.push(e ? e.getText(sf) : "(none)");
      }
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
    expect(boards).toEqual(["closedNoteOf(sp.closed)"]);
  });
});
