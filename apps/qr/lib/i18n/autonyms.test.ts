import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { STAFF, STAFF_CHANNEL_KEY, STAFF_K15_HIGH, STAFF_SETTLED } from "./staff";

/**
 * P5 — the guards behind the printed word-check sheet (`/staff/glossary`).
 *
 * The sheet enumerates this dictionary and puts a blank correction box beside every line, which
 * makes two invariants load-bearing that were previously only written down:
 *
 *   1. THE TWO AUTONYMS ARE NOT DICTIONARY ENTRIES. `StaffLangSwitch` renders `မြန်မာ` and `English`
 *      as component constants, and its own docblock says why: a native-check pass that "corrects"
 *      either one into the other language makes the control unusable for exactly the person it
 *      exists for. A sheet that printed them with a pen box beside them would be that pass, on
 *      paper. They cannot reach the sheet while they are not keys — so this refuses them as VALUES.
 *
 *   2. THE SEVERITY BAND IS DATA, AND THE DATA AGREES WITH THE SOURCE. `STAFF_K15_HIGH` decides
 *      which thirteen lines the sheet asks about first. Its twin is the trailing `// K15-HIGH`
 *      marker beside each entry, and two representations of one fact fork the moment nothing
 *      compares them: a key marked in a comment but absent from the set is a string nobody is asked
 *      about, and a key in the set with no marker is a severity claim with nothing behind it.
 *
 * ⚠️ WHY THIS PARSES AND DOES NOT SCAN (LEARNINGS #60). The marker lives in a COMMENT, so the
 * matcher has to read comments — which is precisely where a substring scan gets it wrong in both
 * directions: `/K15-HIGH/` over the raw text matches the words inside this very docblock, and it
 * cannot tell which entry a marker sits on when the entry spans five lines and the marker rides the
 * closing brace (five of the thirteen do). So the file is parsed, the markers are read through
 * `ts.getTrailingCommentRanges` at each property's own end position, and prose about K15-HIGH
 * anywhere else in the module is invisible to it.
 *
 * ⚠️ `ts.forEachChild` is a SEARCH primitive — a visitor returning a truthy value aborts the walk —
 * so the visitor below is written `(c) => { visit(c); }`.
 */

/** The language control's two labels, verbatim from `components/staff/StaffLangSwitch.tsx`. */
const AUTONYMS = ["မြန်မာ", "English"] as const;

const SOURCE = fileURLToPath(new URL("./staff.ts", import.meta.url));

/** Every `"key": …` in `staff.ts` whose own trailing comment carries `marker`. */
function keysMarked(marker: string): string[] {
  const src = readFileSync(SOURCE, "utf8");
  const sf = ts.createSourceFile(SOURCE, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hits: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) {
      // The property's `end` is BEFORE its comma, and `getTrailingCommentRanges` stops at the first
      // non-trivia character — so a comment after `},` is invisible from `end` alone. Scan from both
      // positions and union them: the single-line entries carry the marker at `end`, the five
      // multi-line ones carry it past the comma.
      let after = node.end;
      while (
        after < src.length &&
        (src[after] === "," || src[after] === " " || src[after] === "\t")
      )
        after++;
      // …and a marker written on its OWN LINE ABOVE the entry counts too. Trailing-only was a
      // matcher satisfied by POSITION (LEARNINGS #60): a human reads `// K15-HIGH` above a key and
      // sees it marked, while this returned nothing and the sheet's first band silently lost the
      // row. Not hypothetical — a sibling branch writes two money strings that way.
      //
      // ⚠️ TypeScript hands a same-line trailing comment to BOTH the previous node's trailing
      // ranges AND the next node's leading ranges, so a naive union would attribute every existing
      // marker to the FOLLOWING key as well and double the set. A leading range therefore counts
      // only when it begins on a LATER LINE than the previous token ends — a genuinely own-line
      // comment, which is exactly the shape being admitted.
      const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line;
      const prevEnd = node.pos; // end of the previous token's trivia-free text
      const leading = (ts.getLeadingCommentRanges(src, node.pos) ?? []).filter(
        (r) => lineOf(r.pos) > lineOf(prevEnd),
      );
      const ranges = [
        ...(ts.getTrailingCommentRanges(src, node.end) ?? []),
        ...(ts.getTrailingCommentRanges(src, after) ?? []),
        ...leading,
      ];
      if (ranges.some((r) => src.slice(r.pos, r.end).includes(marker))) hits.push(node.name.text);
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  }
  visit(sf);
  return hits;
}

describe("P5 — the word-check sheet's own invariants", () => {
  it("neither language-control autonym is a dictionary VALUE in either tongue", () => {
    // Equality, not containment: `အခု မြန်မာစာ` ("Burmese now") is a legitimate column heading and
    // must stay legal, while a bare `မြန်မာ` as an entry's value is the exact edit that would put
    // the control's own label on a sheet with a correction box beside it.
    const offenders = Object.entries(STAFF)
      .filter(([, v]) => (AUTONYMS as readonly string[]).some((a) => v.en === a || v.my === a))
      .map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  it("the autonyms are still the strings this guard thinks they are", () => {
    // A guard naming two literals is worth nothing if the component has since changed them: it would
    // keep passing over a dictionary entry that now IS the button's label. So the claim is checked
    // against the component, in the position that renders — a JSX child of a `.staff-lang-btn`.
    const file = fileURLToPath(
      new URL("../../components/staff/StaffLangSwitch.tsx", import.meta.url),
    );
    const src = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const rendered: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxElement(node)) {
        const cls = node.openingElement.attributes.properties.find(
          (a) =>
            ts.isJsxAttribute(a) &&
            a.name.getText(sf) === "className" &&
            a.initializer &&
            ts.isStringLiteral(a.initializer) &&
            a.initializer.text === "staff-lang-btn",
        );
        if (cls)
          for (const child of node.children)
            if (ts.isJsxText(child) && child.text.trim()) rendered.push(child.text.trim());
      }
      ts.forEachChild(node, (c) => {
        visit(c);
      });
    }
    visit(sf);
    expect(rendered.sort()).toEqual([...AUTONYMS].sort());
  });

  it("STAFF_K15_HIGH equals the set of entries carrying a K15-HIGH marker, above or beside", () => {
    const marked = keysMarked("K15-HIGH").sort();
    expect(marked.length).toBeGreaterThan(0); // the parse ran at all
    expect([...STAFF_K15_HIGH].sort()).toEqual(marked);
  });

  it("every K15-HIGH key is a real dictionary key", () => {
    const orphans = [...STAFF_K15_HIGH].filter((k) => !(k in STAFF));
    expect(orphans).toEqual([]);
  });

  it("STAFF_SETTLED names real keys, each with a reason, and covers the OWNER-VERIFIED one", () => {
    const orphans = Object.keys(STAFF_SETTLED).filter((k) => !(k in STAFF));
    expect(orphans).toEqual([]);
    const reasonless = Object.entries(STAFF_SETTLED)
      .filter(([, why]) => !why.trim())
      .map(([k]) => k);
    expect(reasonless).toEqual([]);
    // The one marker that exists for this class in the source. A key the owner has already corrected
    // must never be re-asked; listing it here is what stops the sheet asking.
    const missing = keysMarked("OWNER-VERIFIED").filter((k) => !(k in STAFF_SETTLED));
    expect(missing).toEqual([]);
  });

  it("a settled key is never also asked first — the two bands are disjoint", () => {
    const both = Object.keys(STAFF_SETTLED).filter((k) => STAFF_K15_HIGH.has(k as never));
    expect(both).toEqual([]);
  });

  it("STAFF_CHANNEL_KEY covers exactly the three session modes, each a real key", () => {
    expect(Object.keys(STAFF_CHANNEL_KEY).sort()).toEqual(["dinein", "pickup", "scango"]);
    const bad = Object.values(STAFF_CHANNEL_KEY).filter((k) => !(k in STAFF));
    expect(bad).toEqual([]);
  });
});
