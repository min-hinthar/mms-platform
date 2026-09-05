import { STAFF, type StaffKey } from "./staff";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * P2 — slot filling for the staff dictionary, and the ONE place the numeral rule lives.
 *
 * SLOTS, and what each means (the name decides the numeral system, so it is not decoration):
 *   {n} {total} — a COUNT in prose. Localized: Burmese numerals under `my`.
 *   {id}        — an identifier: a table number off the physical tent, a pickup code. ALWAYS Latin.
 *   {m}         — preformatted money from `fmt()`. ALWAYS Latin.
 *   {t}         — a preformatted clock time. ALWAYS Latin.
 *   {x}         — a name or label: a dish, a guest, a ticket id. Verbatim, whatever script it is.
 *   {head} {what} {tail} — outage parts, each itself a dictionary value.
 *
 * ⚠️ THAT LIST IS THE VOCABULARY IN USE, NOT THE SET OF LEGAL NAMES, and the difference matters. The
 * only slots this module treats specially are the two COUNT ones; every other name passes its value
 * through verbatim. So when ONE sentence needs two amounts or two identifiers — `fill` substitutes by
 * NAME, and a name can appear twice but cannot carry two values — do not reach for `{x}` a second
 * time. NAME THE SECOND SLOT FOR WHAT IT IS: `{tip}` beside `{m}` in the cash breakdown, `{into}`
 * beside `{id}` in the merge question, `{old}` beside `{m}` in the price change. A reader (and the
 * printed K15 glossary, which shows these braces to Mom and Dad) learns the meaning from the name;
 * `{x}` used for money teaches them the opposite of the rule this list opens with.
 *
 * The names are lowercase LETTERS only — `fill`'s pattern is `\{([a-z]+)\}`, so `{m2}` renders as a
 * literal brace. That constraint is why the convention is semantic rather than positional.
 *
 * The owner's rule (2026-09-05): Burmese numerals in prose counts, Latin for money, clocks, table
 * numbers and pickup codes. The KDS stat row is Latin too — its column is `tabular-nums` and Padauk
 * ships no tabular Myanmar figures, so Burmese digits there would make the row ragged — and it is
 * Latin by CONSTRUCTION rather than by discipline: the stat values are rendered as plain numbers,
 * never through a `{n}` slot.
 */

const MY_DIGITS = ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"] as const;

/** Count-class slots. Everything else passes through verbatim. */
const COUNT_SLOTS = new Set(["n", "total"]);

/**
 * Render a count in the reader's numerals. Digit-by-digit on the decimal string, so it is correct
 * for any magnitude and leaves a sign or separator alone.
 */
export function localizeCount(value: number | string, lang: StaffLang): string {
  const s = String(value);
  if (lang !== "my") return s;
  return s.replace(/[0-9]/g, (d) => MY_DIGITS[Number(d)]!);
}

/**
 * Substitute every slot in a template.
 *
 * ⚠️ NEVER THROWS on an unknown or missing slot — it leaves the brace intact and renders on. A throw
 * here happens inside `KdsBoard`'s render, where `app/staff/error.tsx` would catch it and take the
 * whole kitchen board down mid-service. A visible `{n}` at the pass is strictly the better failure,
 * and the compile-time type on `tf` is what actually prevents it: `SlotsOf<K>` makes a missing var a
 * typecheck error, so the runtime path exists only for the case types cannot see.
 *
 * The replace is GLOBAL: a template may name the same slot twice.
 */
export function fill(
  template: string,
  vars: Record<string, string | number>,
  lang: StaffLang,
): string {
  return template.replace(/\{([a-z]+)\}/g, (whole, name: string) => {
    if (!(name in vars)) return whole;
    const raw = vars[name]!;
    return COUNT_SLOTS.has(name) ? localizeCount(raw, lang) : String(raw);
  });
}

/** The slot names a template declares, as a union — so `tf` demands exactly the right vars. */
type Slots<S extends string> = S extends `${string}{${infer K}}${infer R}` ? K | Slots<R> : never;
type SlotsOf<K extends StaffKey> = Slots<(typeof STAFF)[K]["en"]>;

/**
 * Look up a key and fill its slots. The var object is typed from the EN template's slot names, so a
 * forgotten or misspelled var is a compile error rather than a `{n}` on the pass tablet.
 */
export function tf<K extends StaffKey>(
  lang: StaffLang,
  key: K,
  vars: Record<SlotsOf<K>, string | number>,
): string {
  return fill(STAFF[key][lang], vars as Record<string, string | number>, lang);
}

/**
 * Pick the EN singular or plural key. Burmese ignores the distinction — both keys carry the same MY
 * value (`STAFF_PLURAL_PAIRS`, guarded) — so this exists for English alone and stays a plain
 * two-key choice rather than a mini plural syntax that the slot guard would then have to parse.
 */
export function plural<A extends StaffKey, B extends StaffKey>(n: number, one: A, many: B): A | B {
  return n === 1 ? one : many;
}
