/**
 * The menu list's ONE filter (menu-2's neighbour): the search needle over the English name, the
 * Burmese name and the category, and the sold-out chip. Pure, so the audit's case — a manager
 * hunting the flags that outlived their shift through 115 rows — is falsified by a VALUE.
 *
 * The Burmese match is on the RAW trimmed query: `toLowerCase()` is a no-op on Myanmar script and
 * the name is data, so a case fold would only ever hide a match, never find one.
 */
export type BrowseRow = {
  id: string;
  nameEn: string;
  nameMy: string | null;
  category: string;
  soldOut: boolean;
};

/**
 * `keep` — the row the last action was about stays under the chip whatever its state now: a dish
 * put back while the chip is pressed leaves with the NEXT action, not the instant the server
 * confirms (which unmounted it under the focused pill). The needle is never bypassed: typing is
 * the manager's own narrowing.
 */
export function browseRows<T extends BrowseRow>(
  items: readonly T[],
  q: string,
  soldOutOnly: boolean,
  keep: string | null = null,
): T[] {
  const raw = q.trim();
  const needle = raw.toLowerCase();
  return items.filter(
    (i) =>
      (!soldOutOnly || i.soldOut || i.id === keep) &&
      (needle === "" ||
        i.nameEn.toLowerCase().includes(needle) ||
        (i.nameMy ?? "").includes(raw) ||
        i.category.toLowerCase().includes(needle)),
  );
}
