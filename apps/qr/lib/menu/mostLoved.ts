import "server-only";
import { unstable_cache } from "next/cache";
import { serviceClient } from "@mms/db/server";

/**
 * J2 — the REAL "most loved" signal (docs/JOURNEY_PLAN.md · guided start). Counts-only aggregate over
 * PAID orders: which menu items do tables actually order? Feeds the menu's "Start here" band and
 * upgrades the honest-but-manual `popular` catalog tag into a data-backed "Table favorite" badge —
 * the counts make the claim TRUE, which is exactly `badges.ts`'s never-fabricate rule.
 *
 * Privacy + safety, by construction:
 *  - NOT a Server Action — an internal server module (`server-only`), so it can't be POSTed directly.
 *  - Service-role read (order rows are RLS-scoped to their owners; an aggregate needs the wide read),
 *    but the ONLY thing that leaves this module is menu-item ids + counts — no uid, no order id, no
 *    amounts. Counts-only, as the journey plan requires.
 *  - Cached one hour (`unstable_cache`) — a menu render never adds an orders-table scan per request.
 *
 * Honesty bounds: last 60 days, paid orders only (refunded/failed excluded), and an item needs ≥2
 * DISTINCT orders before it can claim "table favorite" — one party's bulk order can't crown a dish.
 * The list is returned RANKED and `LOVED_POOL_MAX` long; the caller takes `LOVED_BADGE_MAX` off the
 * front for anything the diner reads as a claim (see the note on those two constants below).
 * Grocery barcode lines are excluded (menu_item_id is a soft text ref; only uuid-shaped ids are menu
 * dishes). The row read is capped generously (~5k line rows ≫ a single teahouse's 60-day volume); if
 * the cap is ever hit the newest rows win, which only recency-biases the ranking — never fabricates.
 */
export type MostLoved = { menuItemId: string; orders: number; qty: number };

/**
 * ⚠️ TWO BOUNDS, AND THE DIFFERENCE BETWEEN THEM IS A HONESTY RULE, not a tuning knob.
 *
 * `LOVED_BADGE_MAX` is how many dishes may wear a VISIBLE CLAIM — the "Table favorite" badge on
 * every menu row and in the item sheet (`itemBadges`), and the rank seals on the Start-here row.
 * It stays at 12. On a menu this size, a badge worn by fifty dishes is not a badge; it is a
 * decoration that says "most of the menu", and `badges.ts`'s founding rule is that a claim must be
 * true in the sense the diner reads it.
 *
 * `LOVED_POOL_MAX` is how far the same ranking is consulted as a SELECTION PREFERENCE — which
 * dishes get offered first in "a little of everything" and in the taste suggestions. Nothing about
 * that is shown to the diner as a claim; it only decides what gets surfaced, and surfacing a dish
 * that 40 tables ordered ahead of one nobody has is a better guess, not a statement.
 *
 * Both are exported so the two call sites read the bound by name rather than re-deriving it, and so
 * a future edit has to argue with this comment. Widening the badge bound is a product decision
 * about a claim; widening the pool bound is not.
 */
export const LOVED_BADGE_MAX = 12;
export const LOVED_POOL_MAX = 50;

// Strict canonical uuid (8-4-4-4-12) — matches the SQL discriminator in 20260623100000_s4_unified_basket,
// so the TS and SQL notions of "a menu dish vs a barcode line" can never drift.
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOW_DAYS = 60;
const MIN_DISTINCT_ORDERS = 2;
const ROW_CAP = 5000;

const getMostLovedCached = unstable_cache(
  async (): Promise<MostLoved[]> => {
    // The ENTIRE body is inside try/catch — not just the query. serviceClient() itself throws on a
    // missing/rotated SUPABASE_SERVICE_ROLE_KEY, and this module made the menu's highest-traffic page
    // service-role-dependent for a decorative signal: a config gap must degrade to "no band", never 500
    // the menu (which previously ran on the anon key alone).
    try {
      const db = serviceClient();
      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await db
        .from("qr_order_items")
        .select("menu_item_id,qty,order_id,qr_orders!inner(status,created_at)")
        .eq("qr_orders.status", "paid")
        .gte("qr_orders.created_at", since)
        // Order the PARENT rows by the to-one embed's timestamp (PostgREST supports this) so when a cap
        // truncates, the MOST RECENT order lines genuinely win. Note the effective cap is
        // min(ROW_CAP, project Max Rows — PostgREST defaults that to 1000): a clamp only narrows the
        // recency window (favorites of the last N-hundred orders), which stays an honest claim.
        .order("qr_orders(created_at)", { ascending: false })
        .limit(ROW_CAP);
      if (error) {
        // THROW, don't return [] — this body runs INSIDE the cache boundary, and a returned [] would
        // be CACHED for the full hour: one outage-window render poisoned the "most loved" band for
        // 60 minutes after recovery (W10a audit). The throw is caught outside the boundary below.
        console.error("[mostLoved] aggregate read failed", error.message);
        throw new Error("mostLoved read failed");
      }
      const acc = new Map<string, { orders: Set<string>; qty: number }>();
      for (const r of data ?? []) {
        if (!uuidRe.test(r.menu_item_id)) continue; // grocery barcode line — not a menu dish
        const a = acc.get(r.menu_item_id) ?? { orders: new Set<string>(), qty: 0 };
        a.orders.add(r.order_id);
        a.qty += r.qty;
        acc.set(r.menu_item_id, a);
      }
      return [...acc.entries()]
        .map(([menuItemId, a]) => ({ menuItemId, orders: a.orders.size, qty: a.qty }))
        .filter((x) => x.orders >= MIN_DISTINCT_ORDERS)
        .sort((a, b) => b.orders - a.orders || b.qty - a.qty)
        .slice(0, LOVED_POOL_MAX);
    } catch (e) {
      // Config-shaped failures (missing service key) still swallow INSIDE the boundary: they are
      // stable for the process lifetime, so caching their [] is accurate, and serviceClient() throws
      // before any query. ALL query errors (transport or otherwise) were re-thrown above and never
      // enter the cache — a non-transport query error is transient from the cache's point of view too.
      if (e instanceof Error && e.message === "mostLoved read failed") throw e;
      console.error("[mostLoved] aggregate unavailable", e instanceof Error ? e.message : e);
      return [];
    }
  },
  ["mms-most-loved"],
  { revalidate: 3600 },
);

/**
 * W10a — the public face: failures degrade to "no band" HERE, outside the cache boundary, so the
 * error-state [] is never cached (the pre-W10a shape cached it for the full hour) while a genuine
 * empty aggregate still caches normally.
 */
export async function getMostLoved(): Promise<MostLoved[]> {
  try {
    return await getMostLovedCached();
  } catch {
    /* deliberate: the band/badge simply don't render this request; the menu is unaffected */
    return [];
  }
}
