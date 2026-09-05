import {
  STAFF,
  STAFF_K15_HIGH,
  STAFF_LATIN_BY_DESIGN,
  STAFF_SETTLED,
  type StaffKey,
} from "./i18n/staff";

/**
 * P5 — the printed word-check sheet's row plan (`/staff/glossary`).
 *
 * WHY THIS IS DERIVED FROM THE MODULE AND NOT WRITTEN DOWN. `docs/PILOT_PLAN.md` §3 P5 asks for a
 * glossary "generated from `apps/qr/lib/i18n/staff.ts` so it can never drift from the shipped
 * strings; a hand-copied glossary is stale the day after it is printed." A committed artifact and a
 * freshness check would satisfy the letter of that — a page that READS the dictionary satisfies it
 * outright: there is no second copy to go stale, no `--check` to forget, and the sheet printed
 * tonight is the strings deployed tonight, by construction.
 *
 * PURE, so the rules below are falsified by values rather than by a render. It touches no database,
 * no clock and no request.
 *
 * ⚠️ THE TWO AUTONYMS ARE ABSENT AND MUST STAY ABSENT. `StaffLangSwitch` renders `မြန်မာ` and
 * `English` as component constants, and its docblock says why: a native-check pass that "corrects"
 * one into the other language makes the control unusable for exactly the person who needs it. They
 * are not dictionary keys, so they cannot reach this plan — `lib/i18n/autonyms.test.ts` refuses them
 * as dictionary VALUES so they cannot arrive by the back door either, and the sheet prints the
 * reason where a corrector will read it rather than leaving the omission to look like an oversight.
 *
 * ⚠️ A LOCKED ROW IS STILL A ROW. Settled and Latin-by-design strings are PRINTED, with their
 * reason, and simply carry no correction box. Omitting them would be the worse failure: a corrector
 * who cannot find မီးဖိုချောင် on the sheet concludes it was missed and writes it in the margin
 * anyway, and now the sheet disagrees with a decision the owner already made.
 */

/** Why a line is not open for correction. `null` on a row means: please check this one. */
export type GlossaryLock = { kind: "settled" | "latin"; why: string };

export type GlossaryRow = {
  key: StaffKey;
  en: string;
  my: string;
  locked: GlossaryLock | null;
};

/** `high` is the K15-HIGH band — the lines a wrong word takes service down over. */
export type GlossaryBandId = "high" | "rest";

export type GlossaryBand = { id: GlossaryBandId; rows: GlossaryRow[] };

export type Glossary = {
  bands: GlossaryBand[];
  /** Every key in the dictionary — locked rows included. */
  total: number;
  /** The rows that actually carry a correction box. This is the ask, and it is what the count says. */
  openForCorrection: number;
};

function lockFor(key: StaffKey): GlossaryLock | null {
  const settled = STAFF_SETTLED[key];
  if (settled) return { kind: "settled", why: settled };
  const latin = STAFF_LATIN_BY_DESIGN[key];
  if (latin) return { kind: "latin", why: latin };
  return null;
}

/**
 * Build the sheet.
 *
 * Rows are sorted by KEY within each band, which groups them by surface for free — the key's first
 * segment IS the surface (`kds.*`, `board.*`, `out.*`), and someone checking words reads by surface,
 * not alphabetically by English. Sorting also makes the printout STABLE: two prints a week apart
 * differ only where the dictionary did, so a marked-up sheet can be compared against a fresh one.
 *
 * Plain `<` rather than `localeCompare`: with no locale argument that resolves against the runtime's
 * default, so two machines could order the same keys differently. Keys are ASCII by construction
 * (`strings.test.ts` pins the namespace shape), so code-unit order is the total order this needs.
 */
export function buildGlossary(): Glossary {
  const keys = (Object.keys(STAFF) as StaffKey[])
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const rows: GlossaryRow[] = keys.map((key) => ({
    key,
    en: STAFF[key].en,
    my: STAFF[key].my,
    locked: lockFor(key),
  }));
  const bands: GlossaryBand[] = [
    { id: "high", rows: rows.filter((r) => STAFF_K15_HIGH.has(r.key)) },
    { id: "rest", rows: rows.filter((r) => !STAFF_K15_HIGH.has(r.key)) },
  ];
  return {
    bands,
    total: rows.length,
    openForCorrection: rows.filter((r) => r.locked === null).length,
  };
}
