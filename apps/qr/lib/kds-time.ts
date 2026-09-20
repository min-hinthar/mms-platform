import { localizeCount, tf } from "./i18n/fill";
import type { StaffLang } from "./staff-lang";

/**
 * K28 — the ONE elapsed-time formatter for the kitchen surfaces.
 *
 * The board used to format every age as `m:ss` with no ceiling, so a ticket at 164 minutes read
 * `164:01` and the day's average read `61375:52` — forty-two days of stale rows averaged in. A cook
 * at two metres parses `164:01` as a clock time. The bands here are the ones a person actually
 * reasons in: seconds matter under an hour, minutes matter under a day, and past a day the number
 * is not an age of food any more — it is a data problem, and the display says so once instead of
 * counting it up.
 *
 * Visible forms stay LATIN and clock-shaped (`3:42` · `2h 44m` · `1d+`) under the owner's numerals
 * rule — an elapsed time is read against a wall clock and a printed ticket, and the `.kds-clock`
 * span is `aria-hidden`. The SPOKEN form is a dictionary key (`spokenElapsed`) with prose-count
 * slots, so a Burmese board announces a Burmese sentence with Burmese numerals — the sr-only
 * sentence was a bare English template literal before, which `check-staff-lang` rule 5 cannot see
 * because it is not a dictionary string.
 *
 * Pure, so a VALUE falsifies each band edge (`kds-time.test.ts`).
 */
export type Elapsed =
  | { kind: "mmss"; m: number; s: number }
  | { kind: "hm"; h: number; m: number }
  | { kind: "days" };

const HOUR_S = 3_600;
const DAY_S = 86_400;

/** Whole seconds, floored, never negative — a clock-skewed tablet never shows a countdown. */
export function elapsedParts(ms: number): Elapsed {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total >= DAY_S) return { kind: "days" };
  if (total >= HOUR_S)
    return { kind: "hm", h: Math.floor(total / HOUR_S), m: Math.floor((total % HOUR_S) / 60) };
  return { kind: "mmss", m: Math.floor(total / 60), s: total % 60 };
}

/** `3:42` under an hour · `2h 44m` under a day · `1d+` past it. */
export function fmtElapsed(ms: number): string {
  const e = elapsedParts(ms);
  switch (e.kind) {
    case "mmss":
      return `${e.m}:${String(e.s).padStart(2, "0")}`;
    case "hm":
      return `${e.h}h ${e.m}m`;
    case "days":
      return "1d+";
  }
}

/** The sentence a screen reader gets, in the device language, through the dictionary — never
 *  assembled English. Each band is its own literal key so `tf()`'s per-key slot typing holds, and
 *  the figures are PROSE COUNTS, so they take the reader's numerals (`fill` localizes only its
 *  `n`/`total` slots by name; every other count localizes where it is made, as `al()`'s qty does). */
export function spokenElapsed(lang: StaffLang, ms: number): string {
  const e = elapsedParts(ms);
  const c = (v: number) => localizeCount(v, lang);
  switch (e.kind) {
    case "mmss":
      return tf(lang, "kds.age.mmss", { m: c(e.m), s: c(e.s) });
    case "hm":
      return tf(lang, "kds.age.hm", { h: c(e.h), m: c(e.m) });
    case "days":
      return tf(lang, "kds.age.days", {});
  }
}

/**
 * K28(b) — the Ready shelf's wait on the /board wall, from the route's WHOLE-MINUTE count (a TV
 * does no clock arithmetic of its own — `readyMinutes` is derived server-side against the DB clock,
 * and re-deriving it here would be the two-clock-domain skew `staff-outage.ts` documents). Under an
 * hour the minutes carry information; past it they do not — a bag on the shelf for `1440 min` tells
 * the room nothing `Over an hour` does not, and reads as a broken clock. The ceiling is a guest-wall
 * decision, distinct from the KDS's `2h 44m` (a cook wants the figure; a guest wants the verdict).
 * Returns the KEY and its slot, never a string, so the card renders it through the dictionary.
 */
export type ShelfWait =
  | { k: "board.card.justNow" }
  | { k: "board.card.wait"; mins: number }
  | { k: "board.card.waitLong" };

export const SHELF_WAIT_CEILING_MIN = 60;

export function shelfWait(mins: number): ShelfWait {
  const m = Math.max(0, Math.floor(mins));
  if (m === 0) return { k: "board.card.justNow" };
  if (m >= SHELF_WAIT_CEILING_MIN) return { k: "board.card.waitLong" };
  return { k: "board.card.wait", mins: m };
}
