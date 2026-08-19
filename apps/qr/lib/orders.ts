"use server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { cartViewInput, trackFallbackInput } from "@mms/db/schemas";
import { liveOrderStatusWord, type LiveOrder, type LiveOrderKind } from "./live-order";
import { shapeTrackedOrder, TRACK_ORDER_SELECT, type TrackedOrder } from "./track-order";
import { settlementVerdict, type SettlementRead } from "./dropped-read";
import type { SettleCanceled } from "./dropped-view";

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

  // W11 (M29): a split payer's orders live behind `qr_order_payers`, not `earned_by` (only the host is
  // stamped there). Resolve the payer's order ids first, then one read authorized by EITHER proof. The
  // id list is bounded by the same window/limit as the read itself.
  const { data: payerRows, error: payerErr } = await db
    .from("qr_order_payers")
    .select("order_id")
    .eq("payer_uid", user.id)
    .gte("created_at", cutoff)
    .limit(LIVE_LIMIT);
  if (payerErr) console.error("[orders] payer order-id read failed", payerErr);
  const payerIds = (payerRows ?? []).map((r) => r.order_id);

  let live = db
    .from("qr_orders")
    .select(
      "id,togo_status,table_number,pickup_slot,created_at,arrived_at,session_id,stripe_payment_intent_id,cart_id,qr_order_items(fulfillment)",
    )
    .eq("status", "paid")
    .gte("created_at", cutoff);
  // Both values are SERVER-derived (a verified auth uid; order ids read two lines up under that uid's
  // own scope) — never client strings — so this `.or()` carries no injection risk. It is a SELECT, so
  // the PostgREST-14 or+representation trap (mutations only) does not apply.
  live = payerIds.length
    ? live.or(`earned_by.eq.${user.id},id.in.(${payerIds.join(",")})`)
    : live.eq("earned_by", user.id);
  const { data: rows, error } = await live
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
      statusWord: liveOrderStatusWord({ togoStatus: r.togo_status ?? null, kind, hasTogoFood }),
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
  /**
   * W23d — there is no order and there never will be: this diner's own pickup AUTHORIZATION was
   * cancelled by the settlement instead of captured. The only arm here that carries a payload,
   * because it is the only one where the app knows something the diner does not.
   */
  | { ok: false; reason: "settle_canceled"; settle: SettleCanceled }
  | { ok: false; reason: "error" };

/** The same field set `useOrderStatus` builds, so the tracker renders a fallback order
 *  identically — W22r made the contract structural: one shared select + mapper
 *  (lib/track-order.ts) instead of three hand-copied shapes. */
export type FallbackOrder = TrackedOrder;

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

  const q = db.from("qr_orders").select(TRACK_ORDER_SELECT).eq("earned_by", user.id); // ← the authorization. The key below only narrows it.
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
      // ⚠️ W11 (M29) — `qr_order_payers` is written at fulfillment and survives clear-table, so a split
      // payer is AUTHORIZED for the full tracker, not just honest copy. Scoped to `payer_uid = uid`:
      // reads nothing the caller does not own, reveals nothing about anyone else.
      const { data: payer, error: payerProbeErr } = await db
        .from("qr_order_payers")
        .select("order_id")
        .eq("order_id", orderId)
        .eq("payer_uid", user.id)
        .limit(1)
        .maybeSingle();
      if (payerProbeErr) {
        // An unreadable probe is not "not a payer" — that would tell a real payer their order does
        // not exist on a transient blip. Same rule as every W10 read.
        console.error("[orders] payer probe failed", payerProbeErr);
        return { ok: false, reason: "error" };
      }
      if (payer) {
        const { data: paid, error: paidErr } = await db
          .from("qr_orders")
          .select(TRACK_ORDER_SELECT)
          .eq("id", orderId)
          .maybeSingle();
        if (paidErr) {
          console.error("[orders] payer-authorized track read failed", paidErr);
          return { ok: false, reason: "error" };
        }
        if (paid) return { ok: true, order: shapeTrackedOrder(paid) };
      }
      // Pre-migration orders have no payers row; the share row still proves payment while it lives.
      const { data: mine } = await db
        .from("qr_cart_shares")
        .select("id")
        .eq("order_id", orderId)
        .eq("seat_id", user.id)
        .limit(1)
        .maybeSingle();
      if (mine) return { ok: false, reason: "share_payer" };
    }

    // W23d (registry M71) — the reason there is no order may be that the hold was CANCELLED, not
    // that fulfillment is slow. Every arm of the tracker's give-up card asserts a payment ("your
    // payment went through", "your payment is safe — show this screen to staff"), and all of them
    // are false for a cancelled authorization: the guest would be sent to the counter to ask about
    // money nobody took.
    //
    // Only on the PaymentIntent key: manual capture is single-pay pickup, so a split order's
    // order-id lookup can never reach a cancellation. The verdict is RECORDED, never inferred from
    // this absence — right after `paymentIntents.capture` and before `mms_fulfill_order`, "no order"
    // is exactly what a healthy capture looks like too.
    if (paymentIntent) {
      const verdict = await settlementVerdict(paymentIntent, user.id);
      // `undecided` and `error` both fall through to today's answer, deliberately and for different
      // reasons: undecided is the ordinary in-flight case, and an unreadable ledger must never
      // become a confident "nothing was charged". Only a recorded verdict speaks.
      if (verdict.state === "decided")
        return { ok: false, reason: "settle_canceled", settle: verdict.settle };
    }
    return { ok: false, reason: "not_found" };
  }

  return { ok: true, order: shapeTrackedOrder(data) };
}

/**
 * W23d — has this diner's own pickup authorization been CANCELLED? (registry M71)
 *
 * A thin, uid-scoped probe so the tracker can correct itself in the first few seconds rather than
 * after its ~30s give-up. It exists separately from `getMyOrderFallback` because the two answer
 * different questions on different clocks: the fallback runs ONCE, after the live read has given
 * up, and does real work (order read + two payer probes); this runs on a short poll while the
 * celebration is on screen and does one indexed lookup.
 *
 * ⚠️ Called ONLY on the manual-capture path (`awaitingCapture`), which is dark until
 * `PICKUP_MANUAL_CAPTURE` is on — so every automatic-capture diner pays nothing for it. An
 * automatic-capture PI can never have a cancellation row anyway (only `settleAuthorizedPickup`
 * writes them), so the probe would be a guaranteed miss on a hot path.
 *
 * Returns the OUTCOME. `undecided` is the ordinary answer for a healthy payment AND for a capture
 * still in flight; `error` is a failed read. Neither may become "you weren't charged".
 */
export async function getSettleVerdict(paymentIntent: string): Promise<SettlementRead> {
  const parsed = trackFallbackInput.safeParse({ paymentIntent });
  if (!parsed.success || !parsed.data.paymentIntent) return { state: "undecided" };
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { state: "undecided" };
  return settlementVerdict(parsed.data.paymentIntent, user.id);
}

/**
 * W9c — did the CALLER themselves pay for this cart? Uid-scoped, and that is the entire point.
 *
 * `/cart` wants to tell a diner who back-navigated onto their own finished order that it is complete,
 * rather than the flat "isn't available on this device". The obvious route — discriminating
 * `AuthzError.code` — is unsafe: `assertCartMember` raises `cart_closed` and `session_expired` BEFORE
 * it checks membership, so branching on them tells any visitor whether an arbitrary cart id exists and
 * what state it is in. That is a cart-lifecycle oracle on a forwarded URL.
 *
 * This asks a question the caller is entitled to have answered: is there an order of MY OWN behind
 * this cart? A non-member always gets `false` and therefore the generic copy, so nothing leaks.
 *
 * TWO uid-scoped proofs, because `earned_by` alone covers only single-pay card orders:
 *   • `qr_orders.earned_by = uid` — the diner who paid by card. Also guarantees the "see it in your
 *     account" route this unlocks will find the order (`getOrderHistory` reads the same column).
 *   • `qr_cart_shares.seat_id = uid` — a SPLIT payer. `mms_fulfill_split_order` stamps only the host
 *     as `earned_by` (OPEN-ITEMS M29), so without this every other share payer — who paid real money —
 *     fell to "This order isn't available on this device" on their own finished bill.
 *
 * ⚠️ KNOWN GAP: a CASH-settled order carries no diner uid at all (`mms_fulfill_cash_order` records
 * `settled_by`, which is the STAFF member) and no share rows. There is nothing to match on, so a cash
 * diner keeps the generic copy. Fail-closed is the right direction here, and inventing a match would
 * mean trusting something the caller sent.
 */
export async function didIPayForCart(cartId: string): Promise<boolean> {
  const parsed = cartViewInput.safeParse({ cartId });
  if (!parsed.success) return false;
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return false;
  const db = serviceClient();
  const { data: own, error } = await db
    .from("qr_orders")
    .select("id")
    .eq("cart_id", parsed.data.cartId)
    .eq("earned_by", user.id)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[orders] didIPayForCart failed", error);
    return false; // fail closed — the generic copy is always safe to show
  }
  if (own) return true;

  // W11 (M29): the durable proof — a payers row written at fulfillment, surviving clear-table.
  const { data: paidOrder } = await db
    .from("qr_orders")
    .select("id")
    .eq("cart_id", parsed.data.cartId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();
  if (paidOrder) {
    const { data: payer, error: payerErr } = await db
      .from("qr_order_payers")
      .select("order_id")
      .eq("order_id", paidOrder.id)
      .eq("payer_uid", user.id)
      .limit(1)
      .maybeSingle();
    if (payerErr) console.error("[orders] didIPayForCart payer probe failed", payerErr);
    if (payer) return true;
  }

  // Split payer: their own share row. Scoped to `seat_id = uid`, so this reads nothing the caller does
  // not already own and cannot reveal whether anyone ELSE paid.
  const { data: share, error: shareErr } = await db
    .from("qr_cart_shares")
    .select("id")
    .eq("cart_id", parsed.data.cartId)
    .eq("seat_id", user.id)
    .not("order_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (shareErr) {
    console.error("[orders] didIPayForCart share probe failed", shareErr);
    return false;
  }
  return !!share;
}
