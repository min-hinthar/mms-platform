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

/**
 * Live tracking of the diner's OWN order, keyed by the Stripe PaymentIntent id (Stripe appends
 * `payment_intent` to the Payment Element return_url). Fulfillment is async — the signature-verified
 * webhook inserts `qr_orders` a beat after the redirect — so this surfaces the order via Realtime
 * **Postgres Changes** with no manual refresh. Authorization is the existing `qr_order_read` RLS
 * (`is_member(session_id)`), enforced per-subscriber by Realtime, so a guessed `payment_intent`
 * reveals nothing. A bounded fallback re-fetch (≈30s) covers the redirect→insert race and a cold
 * socket, so the order reliably appears even if the live channel is slow. Returns `null` until the
 * order exists. Forward-compatible: S2's kitchen-status updates arrive on the same subscription.
 */
export function useOrderStatus(paymentIntent: string | null): TrackedOrder | null {
  const anon = useAnonSession();
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  useEffect(() => {
    if (!paymentIntent || !anon) return;
    const supa = browserClient();
    supa.realtime.setAuth(anon.accessToken); // anon-auth token → RLS authorizes the subscription
    let active = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      const { data } = await supa
        .from("qr_orders")
        .select("id,status,total_cents,qr_order_items(qty)")
        .eq("stripe_payment_intent_id", paymentIntent!)
        .maybeSingle();
      if (!active) return;
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
        timer = setTimeout(load, 3000);
      }
    }

    // Subscribe BEFORE the initial load so an INSERT landing between the two isn't missed.
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
        () => load(),
      )
      .subscribe();

    load();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      supa.removeChannel(channel);
    };
  }, [paymentIntent, anon]);

  return order;
}
