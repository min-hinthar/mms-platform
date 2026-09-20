/**
 * counter-8 — the relative age every floor card, counter card, approval row and drill-down line
 * prints ("just now" · "3m ago" · "2h ago" · "1d ago"), as a dictionary KEY plus its count, never
 * as an English literal. `<RelativeTime>` renders the pair through `<Chrome>`, so a Burmese console
 * reads a marked Burmese label with Burmese numerals — `{n}` is a COUNT slot (`lib/i18n/fill.ts`) —
 * instead of an unmarked English tail on every card.
 *
 * Pure so each threshold is falsifiable by a value: under 45 s is "just now" (a card must not read
 * "1m ago" while the server is still writing the row), minutes below an hour, hours below a day,
 * days after that. A stamp in the future (a device clock behind the server) is a negative diff and
 * clamps to "just now" — the same absorb-the-skew rule the component's tick keeps.
 */
export type RelativeAge =
  | { k: "time.justNow"; n?: undefined }
  | { k: "time.minAgo" | "time.hrAgo" | "time.dayAgo"; n: number };

/** Below this many seconds the age is "just now" rather than a count. */
export const JUST_NOW_SEC = 45;

export function relativeAge(iso: string, nowMs: number): RelativeAge {
  const diffSec = Math.round((nowMs - Date.parse(iso)) / 1000);
  if (diffSec < JUST_NOW_SEC) return { k: "time.justNow" };
  const min = Math.round(diffSec / 60);
  if (min < 60) return { k: "time.minAgo", n: min };
  const hr = Math.round(min / 60);
  if (hr < 24) return { k: "time.hrAgo", n: hr };
  return { k: "time.dayAgo", n: Math.round(hr / 24) };
}
