"use server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { trackFallbackInput } from "@mms/db/schemas";
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

/**
 * W9c — the /track order read that survives the table being cleared.
 *
 * The live tracker reads `qr_orders` from the BROWSER, so its authorization is the `qr_order_read`
 * RLS: `is_member(session_id)`. That membership lapses the moment a server clears the table
 * (`floor.ts` `clearTable`) or the ~4h session TTL sweeps — routinely, minutes after a dine-in diner
 * has paid and is still sitting there. The row is fine; the diner simply can't see it any more, so the
 * tracker polls itself out and tells them their paid meal "hasn't appeared yet".
 *
 * This is the same order, read the way `getOrderHistory` reads it: **uid-scoped on `earned_by`**,
 * which is stamped at fulfillment and outlives every session. Service-role does the fetch; the
 * authorization decision is ours and it is the uid.
 *
 * ⚠️ The key (order id / PaymentIntent) is a LOOKUP, never a credential. Both branches AND `earned_by
 * = uid`, so holding a /track URL grants nothing — which is the whole reason this can't simply key off
 * `stripe_payment_intent_id` the way the client subscription does.
 */
export type TrackFallback =
  | { ok: true; order: FallbackOrder }
  /** The caller paid a SHARE of this split order but isn't its earner — see the reason below. */
  | { ok: false; reason: "share_payer" }
  /** No order of the caller's own matches. Says nothing about whether one exists for someone else. */
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "error" };

/** The same field set `useOrderStatus` builds, so the tracker renders a fallback order identically. */
export type FallbackOrder = {
  id: string;
  status: string;
  totalCents: number;
  itemCount: number;
  pickupSlot: string | null;
  togoStatus: string | null;
  hasTogoFood: boolean;
  hasDineInFood: boolean;
  arrivedAt: string | null;
  hasGrocery: boolean;
  tableNumber: number | null;
};

export async function getMyOrderFallback(input: {
  orderId?: string | null;
  paymentIntent?: string | null;
}): Promise<TrackFallback> {
  const parsed = trackFallbackInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "not_found" };
  const { orderId, paymentIntent } = parsed.data;

  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { ok: false, reason: "not_found" };
  const db = serviceClient();

  const q = db
    .from("qr_orders")
    .select(
      "id,status,total_cents,table_number,pickup_slot,togo_status,arrived_at,qr_order_items(qty,fulfillment)",
    )
    .eq("earned_by", user.id); // ← the authorization. The key below only narrows it.
  const { data, error } = await (
    orderId ? q.eq("id", orderId) : q.eq("stripe_payment_intent_id", paymentIntent!)
  ).maybeSingle();

  if (error) {
    console.error("[orders] track fallback read failed", error);
    return { ok: false, reason: "error" };
  }

  if (!data) {
    // ⚠️ The known split gap: `mms_fulfill_split_order` stamps only the HOST as `earned_by`, so every
    // OTHER share payer legitimately fails the read above on an order they really did pay into. Their
    // own share row proves it — `seat_id = uid`, so this reveals nothing they don't already own — and
    // it earns them honest copy instead of the generic "we couldn't find it".
    if (orderId) {
      const { data: mine } = await db
        .from("qr_cart_shares")
        .select("id")
        .eq("order_id", orderId)
        .eq("seat_id", user.id)
        .limit(1)
        .maybeSingle();
      if (mine) return { ok: false, reason: "share_payer" };
    }
    return { ok: false, reason: "not_found" };
  }

  const items = (data.qr_order_items ?? []) as { qty: number; fulfillment: string }[];
  return {
    ok: true,
    order: {
      id: data.id,
      status: data.status,
      totalCents: data.total_cents,
      itemCount: items.reduce((a, i) => a + i.qty, 0),
      pickupSlot: data.pickup_slot ?? null,
      togoStatus: data.togo_status ?? null,
      hasTogoFood: items.some((i) => i.fulfillment === "togo"),
      hasDineInFood: items.some((i) => i.fulfillment === "dinein"),
      arrivedAt: data.arrived_at ?? null,
      hasGrocery: items.some((i) => i.fulfillment === "grocery"),
      tableNumber: data.table_number ?? null,
    },
  };
}
