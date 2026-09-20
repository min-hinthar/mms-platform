/**
 * The menu list's ONE filter (menu-2's neighbour): the search needle over the English name, the
 * Burmese name and the category, and the sold-out chip. Pure, so the audit's case — a manager
 * hunting the flags that outlived their shift through 115 rows — is falsified by a VALUE.
 *
 * The Burmese match is on the RAW trimmed query: `toLowerCase()` is a no-op on Myanmar script and
 * the name is data, so a case fold would only ever hide a match, never find one.
 */
export type BrowseRow = {
  nameEn: string;
  nameMy: string | null;
  category: string;
  soldOut: boolean;
};

export function browseRows<T extends BrowseRow>(
  items: readonly T[],
  q: string,
  soldOutOnly: boolean,
): T[] {
  const raw = q.trim();
  const needle = raw.toLowerCase();
  return items.filter(
    (i) =>
      (!soldOutOnly || i.soldOut) &&
      (needle === "" ||
        i.nameEn.toLowerCase().includes(needle) ||
        (i.nameMy ?? "").includes(raw) ||
        i.category.toLowerCase().includes(needle)),
  );
}
