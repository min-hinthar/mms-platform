import { PRICE_MAX_CENTS, PRICE_MIN_CENTS } from "@mms/db/bounds";

/**
 * menu-5 — WHY a typed price cannot be saved, decided once and said beside the field.
 *
 * The editor used to grey Save with no sentence: an out-of-range or unchanged amount was a dead
 * button, and the server's own bound sentence was unreachable because the client pre-filtered.
 * Every verdict here is a stated reason (`browse.price.draft.*`) and the bounds are the ones the
 * Server Action and the column CHECK enforce (`@mms/db/bounds`), so the field can never promise a
 * price the write will refuse.
 *
 * `draftCents` is strict: dollars with at most two decimals, digits only. `14.5` and `14.50` both
 * ring $14.50; `14.505`, `$14` and `14,50` are `nan` and the hint shows the shape.
 */
export type PriceDraftVerdict = "ok" | "empty" | "nan" | "below" | "above" | "unchanged";

const DRAFT = /^\d{1,6}(\.\d{1,2})?$/;

/** Integer cents for a well-formed draft, else `NaN`. */
export function draftCents(draft: string): number {
  const s = draft.trim();
  if (!DRAFT.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

export function priceDraftVerdict(draft: string, currentCents: number): PriceDraftVerdict {
  if (draft.trim() === "") return "empty";
  const cents = draftCents(draft);
  if (!Number.isFinite(cents)) return "nan";
  if (cents < PRICE_MIN_CENTS) return "below";
  if (cents > PRICE_MAX_CENTS) return "above";
  if (cents === currentCents) return "unchanged";
  return "ok";
}
