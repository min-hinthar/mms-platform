"use server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { liveOrderStatusWord, type LiveOrder, type LiveOrderKind } from "./live-order";

const LIVE_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h — an order older than a shift isn't "live" wayfinding
const LIVE_LIMIT = 20; // count-bound — the tray stays a glance, not a history (history lives on /account)

/**
 * The diner's LIVE (in-flight) orders (K4) — powering the orders tray + /account "Today". Server-
 * authoritative + DERIVED, uid-scoped: reads the caller's OWN orders (earned_by = the SSR-verified uid,
 * anon or upgraded — same uid), so a diner only ever sees their own. The read is service-role (the
 * authorization decision is ours), mirroring getOrderHistory. Cash-settled orders carry no earned_by
 * (they earn nothing), so they're invisible here — the same attribution rule as rewards, stated in the UI.
 *
 * "Live" = status 'paid' (pending/failed aren't trackable) AND placed in the last 12h AND not terminal AND
 * its SESSION is still open. Two reasons the session gate applies to EVERY kind (not just dine-in):
 *   • /track can only READ the order while the session lives — its RLS is `is_member(session_id)`, which
 *     requires expires_at>now() + not-closed. An order past its ~4h session is unreadable on /track for the
 *     diner, so surfacing it in the tray would deep-link to a tracker that never resolves. The tray must
 *     show only what /track can actually open.
 *   • a DINE-IN order has no pick-up signal (you eat there), so the session close IS its terminal signal —
 *     nothing in the diner settle flow closes a session; a staff-close or the 4h sliding-TTL sweep do.
 * (to-go/pickup also carry togo_status 'picked_up' as an earlier terminal signal, checked below.) qr_orders
 * has no mode column, so kind is derived from the line fulfillments (+ pickup_slot). Newest-first.
 */
export async function getMyLiveOrders(): Promise<LiveOrder[]> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return [];
  const db = serviceClient();
  const cutoff = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();

  const { data: rows, error } = await db
    .from("qr_orders")
    .select(
      "id,togo_status,table_number,pickup_slot,created_at,arrived_at,session_id,stripe_payment_intent_id,cart_id,qr_order_items(fulfillment)",
    )
    .eq("earned_by", user.id)
    .eq("status", "paid")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(LIVE_LIMIT);
  // A read FAILURE → no tray (the badge just won't show); never throw and never strand the header. Note
  // this is NOT filtered on togo_status at the DB: `togo_status <> 'picked_up'` is NULL for a dine-in
  // order (togo_status null) and would silently drop it — so the terminal check is done in JS below.
  if (error || !rows) return [];

  // Which referenced SESSIONS are still open? One extra query (vs. a per-row embed) keeps the gate explicit
  // and dependency-light. A session is live while not closed AND not past its sliding TTL — which is exactly
  // the window /track can read the order in, so every kind is gated on it below.
  const sessionIds = [...new Set(rows.map((r) => r.session_id).filter((s): s is string => !!s))];
  const liveSessions = new Set<string>();
  if (sessionIds.length) {
    const { data: sess } = await db
      .from("table_sessions")
      .select("id")
      .in("id", sessionIds)
      .neq("status", "closed")
      .gt("expires_at", new Date().toISOString());
    for (const s of sess ?? []) liveSessions.add(s.id);
  }

  const out: LiveOrder[] = [];
  for (const r of rows) {
    if (r.togo_status === "picked_up") continue; // terminal (to-go / pickup collected)
    // Session gate — EVERY kind: an order whose session has closed/expired is untrackable on /track (its
    // is_member RLS has lapsed), so the tray must not deep-link to it. A missing session_id is likewise
    // unreadable → drop it. (This subsumes the dine-in "the dinner's over" bound.)
    if (!r.session_id || !liveSessions.has(r.session_id)) continue;
    const items = (r.qr_order_items ?? []) as { fulfillment: string }[];
    const hasTogoFood = items.some((i) => i.fulfillment === "togo");
    const hasGrocery = items.some((i) => i.fulfillment === "grocery");
    const hasDinein = items.some((i) => i.fulfillment === "dinein");
    // Kind precedence: a dine-in line makes it a dine-in order (session-bound) even alongside a to-go box;
    // else a pickup slot ⇒ pickup; else to-go food ⇒ to-go; else a pure self-scanned grocery basket.
    const kind: LiveOrderKind = hasDinein
      ? "dinein"
      : r.pickup_slot
        ? "pickup"
        : hasTogoFood
          ? "togo"
          : "grocery";
    out.push({
      id: r.id,
      kind,
      togoStatus: r.togo_status ?? null,
      tableNumber: r.table_number ?? null,
      pickupSlot: r.pickup_slot ?? null,
      createdAt: r.created_at,
      hasTogoFood,
      hasGrocery,
      arrivedAt: r.arrived_at ?? null,
      paymentIntent: r.stripe_payment_intent_id ?? null,
      cartId: r.cart_id ?? null,
      statusWord: liveOrderStatusWord({ togoStatus: r.togo_status ?? null, kind }),
    });
  }
  return out;
}
