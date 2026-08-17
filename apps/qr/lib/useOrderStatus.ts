"use client";
import { useEffect, useState } from "react";
import { browserClient } from "@mms/db";
import { useAnonSession } from "./useAnonSession";
import { shapeTrackedOrder, TRACK_ORDER_SELECT, type TrackedOrder } from "./track-order";

// W22r — the shape moved to lib/track-order.ts (one select + one mapper shared with the two
// fallback reads in lib/orders.ts, so the live and snapshot orders can never drift apart).
// Re-exported so existing importers keep working.
// verify:slice-exempt — thin subscription/poll wiring with no money derivation of its own: every
// money field it carries is mapped in lib/track-order.ts, where the track/breakdown-drops-the-tip
// mutant and lib/track-order.test.ts pin the carriage.
export type { TrackedOrder } from "./track-order";

export type OrderStatus = {
  order: TrackedOrder | null;
  /** Recoverable dead-end: the order never showed (poll exhausted) or the PI id is malformed —
   *  OrderTracker surfaces a Refresh prompt rather than stranding the diner post-payment. */
  timedOut: boolean;
};

/**
 * Live tracking of the diner's OWN order, keyed by the Stripe PaymentIntent id (Stripe appends
 * `payment_intent` to the Payment Element return_url). Fulfillment is async — the signature-verified
 * webhook inserts `qr_orders` a beat after the redirect — so this surfaces the order via Realtime
 * **Postgres Changes** with no manual refresh. Authorization is the existing `qr_order_read` RLS
 * (`is_member(session_id)`), enforced per-subscriber by Realtime, so a guessed `payment_intent`
 * reveals nothing. A bounded fallback re-fetch (≈30s) covers the redirect→insert race and a cold
 * socket; if it still doesn't arrive, `timedOut` lets the UI offer a refresh. Forward-compatible:
 * S2's kitchen-status updates arrive on the same subscription.
 */
export function useOrderStatus(
  paymentIntent: string | null,
  orderId: string | null = null,
): OrderStatus {
  const anon = useAnonSession();
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [exhausted, setExhausted] = useState(false);

  // Two keys: single-pay tracks by the Stripe PaymentIntent id (appended to the return_url); a
  // split-tender order has NO PI (the N share PIs live on qr_cart_shares), so it tracks by the resolved
  // order id (uuid). An explicit `orderId` takes precedence. Render-time validation (no setState-in-
  // effect): a tampered/garbled value never reaches the interpolated Realtime filter — defense-in-depth;
  // RLS is the primary gate and the `.eq()` REST call is parameterized.
  const validPi = paymentIntent != null && /^pi_[A-Za-z0-9_]+$/.test(paymentIntent);
  const validOrderId = orderId != null && /^[0-9a-f-]{36}$/i.test(orderId);
  const byOrderId = orderId != null;
  const key = byOrderId ? orderId : paymentIntent;
  const valid = byOrderId ? validOrderId : validPi;

  useEffect(() => {
    if (!key || !valid || !anon) return;
    const supa = browserClient();
    supa.realtime.setAuth(anon.accessToken); // anon-auth token → RLS authorizes the subscription
    const column = byOrderId ? "id" : "stripe_payment_intent_id";
    let active = true;
    let tries = 0;
    let errs = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      const { data, error } = await supa
        .from("qr_orders")
        .select(TRACK_ORDER_SELECT)
        .eq(column, key!)
        .maybeSingle();
      if (!active) return;
      // maybeSingle treats "no rows yet" as data:null/error:null, so `error` here is a genuine fetch
      // failure (RLS denied / auth lost / network). Fail fast after a few CONSECUTIVE ones instead of
      // burning the full ~30s poll on an unrecoverable state (LEARNINGS: wrap every swallowed error);
      // a transient blip resets `errs` and self-heals via the retry below. (An error also falls through
      // to the `tries` retry, so a mixed error/empty run still hits the ~30s `tries` cap before errs≥3.)
      if (error) {
        errs += 1;
        console.error("[useOrderStatus] order fetch failed", {
          key,
          attempt: errs,
          error,
        });
        if (errs >= 3) {
          setExhausted(true);
          return;
        }
      } else {
        errs = 0;
      }
      if (data) {
        setOrder(shapeTrackedOrder(data));
      } else if (tries < 10) {
        // Not fulfilled yet — Realtime will deliver the INSERT, but poll a few times as a safety net
        // for the redirect→webhook race / a cold socket. Stops once the order arrives or after ~30s.
        tries += 1;
        if (timer) clearTimeout(timer); // a Realtime-triggered load can race the poll — keep ONE timer
        timer = setTimeout(load, 3000);
      } else {
        // Poll exhausted without the order — don't strand the diner on a post-payment screen with no
        // feedback. `timedOut` (below) drives a Refresh prompt; the Realtime sub stays open, so a
        // late INSERT still resolves `order` and clears it.
        console.error("[useOrderStatus] polling exhausted without order", { key });
        setExhausted(true);
      }
    }

    // Subscribe BEFORE the initial load so an INSERT landing between the two isn't missed.
    // postgres_changes is RLS-gated by qr_order_read regardless of channel privacy, so this is safe
    // as-is for M1. NOTE(S2): if kitchen status is pushed via BROADCAST on this channel, make it
    // `{ config: { private: true } }` + add a realtime.messages policy for `order-status:*` (like
    // rt_member_read) — broadcast is NOT covered by the table RLS. NOTE(S2): a DELETE event won't
    // match this filter under default REPLICA IDENTITY (old row carries PK only; see the migration) —
    // add `replica identity full` if S2 adds a deletion/correction path.
    const channel = supa
      .channel(`order-status:${key}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qr_orders",
          filter: `${column}=eq.${key}`,
        },
        () => {
          if (timer) clearTimeout(timer); // a fresh event supersedes any pending poll
          load();
        },
      )
      .subscribe();

    load();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      supa.removeChannel(channel);
    };
  }, [key, valid, byOrderId, anon]);

  // Derived (so a late order always wins): a recoverable dead-end is "poll gave up OR the key is
  // malformed", but only while no order has arrived.
  const timedOut = !order && (exhausted || (key != null && !valid));
  return { order, timedOut };
}
