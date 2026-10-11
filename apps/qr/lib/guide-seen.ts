/**
 * PD12 · PD11 (PATH_DESIGN 2026-10-07, round 3: "one seen-key helper, marked at open") — the ONE
 * first-run rule every guide reads: the staff step guides (the counter's idle pane, the kitchen's
 * empty board — `lib/staff-guide.ts`) and the diner's first-visit guide (m11, built later). m11's
 * B12 asked for exactly this module: the key builder with its revision, and the at-open read, mark
 * and refusal, stated ONCE so no guide grows a second copy of the rule.
 *
 * THE RULE (the shipped Help door's, `HelpButton.tsx`, kept):
 *   - a guide is DUE only when the store holds no mark for its key AND the screen is quiet at that
 *     open — a busy first open is not a missed chance, the guide waits for the next quiet one, so a
 *     busy open marks NOTHING;
 *   - it is marked seen the moment it SHOWS, never on close — a reload mid-guide, a Close, the last
 *     step, or work pushing it away all leave it seen, and nothing re-shows it on its own;
 *   - a store that refuses (a private window, a full or blocked store) means it never shows by
 *     itself: a refused READ is never "unseen", and a refused WRITE never opens — an interruption on
 *     every load is worse than none.
 *
 * THE KEY: `mms.guide.seen:<surface>:<rev>[:<who>]`. The surface is the screen the guide lives on
 * (`counter`, `kitchen`; m11's `dinein`); the revision is the guide's SHAPE — a guide whose steps
 * changed is a new first morning, under a new key, so nothing is ever un-marked; `who` is the
 * person when the guide is per person (the staff guides key the signed-in staff id: once per
 * person, per station, per tablet — m12 change 1) and absent when it is per device (the diner's).
 * Every segment is validated, so a key can never be built from a value that would collide with
 * another key's segments.
 *
 * Pure and dependency-free: the store is HANDED in (a getter, because touching `localStorage`
 * itself can throw a SecurityError), so every clause is falsified by a value, never a render.
 * `lib/hooks/useGuideFirstRun.ts` is the one React seam over it.
 */

export const GUIDE_SEEN_PREFIX = "mms.guide.seen:";

/** The value a shown guide leaves behind. Any non-null value reads as seen. */
export const GUIDE_SEEN_MARK = "1";

/** What a store that refused a READ answers — distinct from `null` (nothing stored). */
export const GUIDE_STORE_REFUSED: unique symbol = Symbol("guide-store-refused");

/** A read of the mark: the stored value, `null` (never shown), or the store's refusal. */
export type GuideStored = string | null | typeof GUIDE_STORE_REFUSED;

/** The slice of `Storage` a guide needs. */
export type GuideStore = Pick<Storage, "getItem" | "setItem">;

/** A key segment: letters, digits, `-` and `_` — never the `:` that separates segments. */
const SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * The seen key for one guide on one surface, at one revision, for one person (or for the device
 * when `who` is omitted). Throws `RangeError` on a malformed segment or a revision that is not a
 * positive integer — a bad key is a programming error, never a key that might happen to collide.
 */
export function guideSeenKey(surface: string, rev: number, who?: string): string {
  if (!SEGMENT.test(surface))
    throw new RangeError(`guide surface "${surface}" is not a key segment`);
  if (!Number.isInteger(rev) || rev < 1)
    throw new RangeError(`guide revision ${rev} is not a positive integer`);
  if (who !== undefined && !SEGMENT.test(who))
    throw new RangeError(`guide owner "${who}" is not a key segment`);
  const base = `${GUIDE_SEEN_PREFIX}${surface}:${rev}`;
  return who === undefined ? base : `${base}:${who}`;
}

/** Read the mark. A store that throws (on access or on read) answers `GUIDE_STORE_REFUSED`. */
export function readGuideMark(store: () => GuideStore, key: string): GuideStored {
  try {
    return store().getItem(key);
  } catch {
    return GUIDE_STORE_REFUSED;
  }
}

/** Due: nothing stored for the key (never shown, and the store answered) and the screen is quiet. */
export function guideDue({ stored, quiet }: { stored: GuideStored; quiet: boolean }): boolean {
  return stored === null && quiet;
}

/**
 * Record a guide as seen because it was SHOWN some other way — a person opened it themselves (the
 * staff Help door's first row; PD11's Account row). A guide seen there is seen: the first run must
 * not offer it again on a later quiet open (Codex round 1 on #345). An explicit open still always
 * shows; this only writes. Answers whether the store took the mark (a refusal is not an error here —
 * nothing else depends on it).
 */
export function markGuideSeen(store: () => GuideStore, key: string): boolean {
  try {
    store().setItem(key, GUIDE_SEEN_MARK);
    return true;
  } catch {
    return false; // refused: the explicit open still shows; the next quiet open may offer it
  }
}

/**
 * The at-open claim: read, decide, and — only when due — mark, BEFORE the caller shows anything.
 * True means "show it now; it is already marked". False means "do not show": seen, refused, or not
 * quiet (in which case nothing was written, so the next quiet open may still show it).
 */
export function claimGuideFirstRun(store: () => GuideStore, key: string, quiet: boolean): boolean {
  if (!guideDue({ stored: readGuideMark(store, key), quiet })) return false;
  try {
    store().setItem(key, GUIDE_SEEN_MARK);
  } catch {
    return false; // the mark was refused: an interruption on every load is worse than none
  }
  return true;
}
