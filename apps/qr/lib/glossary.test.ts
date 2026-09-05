import { describe, expect, it } from "vitest";
import { buildGlossary } from "./glossary";
import {
  STAFF,
  STAFF_K15_HIGH,
  STAFF_LATIN_BY_DESIGN,
  STAFF_SETTLED,
  type StaffKey,
} from "./i18n/staff";

/**
 * P5 — the sheet's completeness, which is the only property that matters to the person holding it.
 *
 * A glossary that quietly omits a string is worse than no glossary: the omission is invisible to the
 * corrector (they cannot miss what is not printed) and invisible to the next reader of the code
 * (the sheet looks complete). So the assertions below are about the SET, derived from the real
 * dictionary — never a transcribed list or a hard-coded count.
 */
const g = buildGlossary();
const allRows = g.bands.flatMap((b) => b.rows);

describe("buildGlossary — the printed word-check sheet", () => {
  it("prints every dictionary key exactly once", () => {
    const printed = allRows.map((r) => r.key).sort();
    const dictionary = (Object.keys(STAFF) as StaffKey[]).sort();
    expect(printed).toEqual(dictionary);
    expect(new Set(printed).size).toBe(printed.length);
    expect(g.total).toBe(dictionary.length);
  });

  it("carries each row's two tongues verbatim from the dictionary", () => {
    // The whole point of deriving the sheet: a value that differed here would be a correction
    // written against a string the console never shows.
    const drifted = allRows.filter((r) => r.en !== STAFF[r.key].en || r.my !== STAFF[r.key].my);
    expect(drifted).toEqual([]);
  });

  it("puts exactly the K15-HIGH keys in the first band", () => {
    const high = g.bands.find((b) => b.id === "high");
    expect(high).toBeDefined();
    expect(high!.rows.map((r) => r.key).sort()).toEqual([...STAFF_K15_HIGH].sort());
    // …and none of them also appears in the second band.
    const rest = g.bands.find((b) => b.id === "rest")!;
    expect(rest.rows.filter((r) => STAFF_K15_HIGH.has(r.key))).toEqual([]);
  });

  it("locks the settled and the Latin-by-design rows, with the REASON attached", () => {
    for (const key of Object.keys(STAFF_SETTLED) as StaffKey[]) {
      const row = allRows.find((r) => r.key === key);
      expect(row?.locked).toEqual({ kind: "settled", why: STAFF_SETTLED[key] });
    }
    for (const key of Object.keys(STAFF_LATIN_BY_DESIGN) as StaffKey[]) {
      const row = allRows.find((r) => r.key === key);
      expect(row?.locked).toEqual({ kind: "latin", why: STAFF_LATIN_BY_DESIGN[key] });
    }
  });

  it("prints the locked rows rather than dropping them", () => {
    // A corrector who cannot find မီးဖိုချောင် on the sheet concludes it was missed and writes it in
    // the margin — and now the sheet disagrees with a decision the owner already made.
    const lockedKeys = [...Object.keys(STAFF_SETTLED), ...Object.keys(STAFF_LATIN_BY_DESIGN)];
    for (const key of lockedKeys) expect(allRows.some((r) => r.key === key)).toBe(true);
  });

  it("counts as OPEN only the rows that actually carry a correction box", () => {
    const locked = new Set([...Object.keys(STAFF_SETTLED), ...Object.keys(STAFF_LATIN_BY_DESIGN)]);
    expect(g.openForCorrection).toBe(g.total - locked.size);
    expect(g.openForCorrection).toBe(allRows.filter((r) => r.locked === null).length);
  });

  it("never prints either language-control autonym as a correctable line", () => {
    // The one thing the pilot brief forbids outright. Belt AND braces: `autonyms.test.ts` keeps them
    // out of the dictionary; this keeps them off the SHEET even if that guard were relaxed.
    const open = allRows.filter((r) => r.locked === null);
    for (const autonym of ["မြန်မာ", "English"])
      expect(open.filter((r) => r.en === autonym || r.my === autonym)).toEqual([]);
  });

  it("is stable and grouped by surface — the same keys print in the same order every time", () => {
    // A marked-up sheet is compared against a fresh print; rows that moved would make that useless.
    for (const band of g.bands) {
      const keys = band.rows.map((r) => r.key);
      expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    // Sorting by key groups by surface for free, which is how someone actually checks words: the
    // `board.*` run must be contiguous rather than scattered through the sheet.
    const rest = g.bands.find((b) => b.id === "rest")!.rows.map((r) => r.key.split(".")[0]!);
    const firstSeen = new Map<string, number>();
    rest.forEach((surface, i) => {
      if (!firstSeen.has(surface)) firstSeen.set(surface, i);
    });
    for (const [surface, start] of firstSeen) {
      const last = rest.lastIndexOf(surface);
      const run = rest.slice(start, last + 1);
      expect(run.every((s) => s === surface)).toBe(true);
    }
  });

  it("has something in both bands — a sheet with an empty band is a broken derivation", () => {
    for (const band of g.bands) expect(band.rows.length).toBeGreaterThan(0);
  });
});
