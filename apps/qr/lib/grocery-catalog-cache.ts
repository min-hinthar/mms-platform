/**
 * W7b — the cached barcode→name/price map: instant local feedback for OFFLINE scans ("Saved Shan
 * Noodles ≈$3.99 — adds when you're back online"). DISPLAY-ONLY by construction: the charged
 * amount is always `scanAdd`'s server-derived snapshot at replay time — a stale cached price can
 * differ from the charge, which is why every rendering of it is an ESTIMATE (≈) with the staleness
 * surfaced (the menu last-good precedent: stale is fine, silent staleness is not). Populated as a
 * side effect of the browse grid's normal catalog fetch; never fetched on its own.
 */

export type CachedCatalogItem = { barcode: string; name: string; priceCents: number };

const KEY = "mms.groceryCatalog.v1";

export function saveCatalogCache(items: CachedCatalogItem[]): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        fetchedAt: Date.now(),
        // Only the three display fields — the cache must never grow into a parallel catalog.
        items: items.map((i) => ({ barcode: i.barcode, name: i.name, priceCents: i.priceCents })),
      }),
    );
  } catch {
    /* deliberate: storage unavailable — offline feedback degrades to the generic copy */
  }
}

export function lookupCachedItem(
  barcode: string,
): (CachedCatalogItem & { fetchedAt: number }) | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt?: unknown; items?: unknown };
    if (typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.items)) return null;
    const hit = parsed.items.find(
      (i): i is CachedCatalogItem =>
        typeof i === "object" &&
        i !== null &&
        (i as CachedCatalogItem).barcode === barcode &&
        typeof (i as CachedCatalogItem).name === "string" &&
        typeof (i as CachedCatalogItem).priceCents === "number",
    );
    return hit ? { ...hit, fetchedAt: parsed.fetchedAt } : null;
  } catch {
    return null;
  }
}
