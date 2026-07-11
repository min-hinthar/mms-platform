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
 * Grocery barcode lines are excluded (menu_item_id is a soft text ref; only uuid-shaped ids are menu
 * dishes). The row read is capped generously (~5k line rows ≫ a single teahouse's 60-day volume); if
 * the cap is ever hit the newest rows win, which only recency-biases the ranking — never fabricates.
 */
export type MostLoved = { menuItemId: string; orders: number; qty: number };

const uuidRe = /^[0-9a-f-]{36}$/i;
const WINDOW_DAYS = 60;
const MIN_DISTINCT_ORDERS = 2;
const ROW_CAP = 5000;

export const getMostLoved = unstable_cache(
  async (): Promise<MostLoved[]> => {
    const db = serviceClient();
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("qr_order_items")
      .select("menu_item_id,qty,order_id,qr_orders!inner(status,created_at)")
      .eq("qr_orders.status", "paid")
      .gte("qr_orders.created_at", since)
      .order("id", { ascending: false })
      .limit(ROW_CAP);
    if (error) {
      // Deliberate swallow → []: the band/badge simply don't render (the menu is unaffected). A popularity
      // signal must never be able to take the menu down.
      console.error("[mostLoved] aggregate read failed", error.message);
      return [];
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
      .slice(0, 12);
  },
  ["mms-most-loved"],
  { revalidate: 3600 },
);
