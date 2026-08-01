import "server-only";
import type { MenuItem } from "@/components/menu/MenuBrowser";

/**
 * W10a — the menu's last-good catalog, per warm server instance. Deliberately module state, not
 * unstable_cache: the data cache gives no stale-on-error guarantee, and this must never hold a
 * FAILURE — only ever the newest success. Empty on a cold instance (the page then renders the full
 * outage state); refreshed on every successful read, so staleness is bounded by traffic, not a TTL.
 * Lives in its own module (not the page) because a Server Component body must stay render-pure —
 * the mutation happens here, behind a plain function call.
 */
let lastGood: MenuItem[] | null = null;

export function readLastGoodCatalog(): MenuItem[] | null {
  return lastGood;
}

export function storeLastGoodCatalog(items: MenuItem[]): void {
  if (items.length > 0) lastGood = items; // never store an empty/error shape
}
