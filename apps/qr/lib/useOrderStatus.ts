"use client";
import { useEffect, useState } from "react";
import { browserClient } from "@mms/db";
import { useAnonSession } from "./useAnonSession";

export type TrackedOrder = {
  id: string;
  status: string; // payment status (paid | refunded | …); kitchen lifecycle is S2
  totalCents: number;
  itemCount: number;
};

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
export function useOrderStatus(paymentIntent: string | null): OrderStatus {
  const anon = useAnonSession();
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [exhausted, setExhausted] = useState(false);

  // Render-time validation (no setState-in-effect): Stripe PI ids are `pi_[A-Za-z0-9_]+`. Anything
  // else (a tampered/garbled return URL) never reaches the interpolated Realtime filter string —
  // defense-in-depth; RLS is the primary gate and the `.eq()` REST call is already parameterized.
  const validPi = paymentIntent != null && /^pi_[A-Za-z0-9_]+$/.test(paymentIntent);

  useEffect(() => {
    if (!paymentIntent || !validPi || !anon) return;
    const supa = browserClient();
    supa.realtime.setAuth(anon.accessToken); // anon-auth token → RLS authorizes the subscription
    let active = true;
    let tries = 0;
    let errs = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      const { data, error } = await supa
        .from("qr_orders")
        .select("id,status,total_cents,qr_order_items(qty)")
        .eq("stripe_payment_intent_id", paymentIntent!)
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
          paymentIntent,
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
        const items = (data.qr_order_items ?? []) as { qty: number }[];
        setOrder({
          id: data.id,
          status: data.status,
          totalCents: data.total_cents,
          itemCount: items.reduce((a, i) => a + i.qty, 0),
        });
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
        console.error("[useOrderStatus] polling exhausted without order", { paymentIntent });
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
      .channel(`order-status:${paymentIntent}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qr_orders",
          filter: `stripe_payment_intent_id=eq.${paymentIntent}`,
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
  }, [paymentIntent, validPi, anon]);

  // Derived (so a late order always wins): a recoverable dead-end is "poll gave up OR the PI is
  // malformed", but only while no order has arrived.
  const timedOut = !order && (exhausted || (paymentIntent != null && !validPi));
  return { order, timedOut };
}
