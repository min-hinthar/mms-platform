/**
 * W14 — pure view derivations for the /account profile card (M46: decision logic lives in lib/,
 * where a suite can pin it — no `.test.tsx` runner exists in this repo).
 */

// The Covina teahouse's local time — tenure reflects the restaurant's calendar, not Vercel UTC
// (the same TZ rule as OrderHistory's month grouping).
const TZ = "America/Los_Angeles";
const fmtMonthYear = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  month: "short",
  year: "numeric",
});

/** "Jun 2026" from a profile created_at ISO, or null when absent/unparseable (the card simply
 *  omits the tenure line — never a fabricated date; the honesty rule). */
export function memberSinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return fmtMonthYear.format(t);
}

/** W14 — the /account favorites strip's selection rule (FavoritesRail parity, pinned): in-stock
 *  only (an 86'd dish shouldn't tease from the profile), input order preserved (hearts are
 *  newest-first), capped at 8. */
export function pickFavoriteRail<T extends { soldOut: boolean }>(items: T[], cap = 8): T[] {
  return items.filter((i) => !i.soldOut).slice(0, cap);
}

/**
 * The avatar circle's single glyph: the first grapheme of the display name, else of the email's
 * local part, else the brand star. Grapheme-segmented so a Burmese or emoji initial renders whole
 * (a bare `[0]` would split a surrogate pair / combining cluster). Uppercased for latin initials;
 * identity for scripts without case.
 */
export function avatarGlyph(displayName: string | null, email: string | null): string {
  const source = displayName?.trim() || email?.split("@")[0]?.trim() || "";
  if (!source) return "✦";
  const first =
    typeof Intl.Segmenter === "function"
      ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(source)][0]?.segment
      : Array.from(source)[0];
  return (first ?? "✦").toLocaleUpperCase("en-US");
}
