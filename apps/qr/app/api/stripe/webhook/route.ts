import { NextRequest, NextResponse, after } from "next/server";
import { getStripe } from "@/lib/stripe";
import { serviceClient } from "@mms/db/server";
import { getCartTotals } from "@/lib/totals";
import { releaseCartLock } from "@/lib/lock";
import { getPostHogClient } from "@/lib/posthog-server";
import { enqueueQboSync, syncOrderToQbo } from "@/lib/qbo/client";

// Fulfillment is webhook-driven, signature-verified, idempotent (QA checklist).
// Stripe retries non-200s for up to 72h, so this must be safe to run more than once.
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Config error, not a bad request: 500 so Stripe redelivers once the secret is wired (vs. the
    // old `!`, which fed `undefined` to constructEvent and masqueraded as a 400 "Bad signature").
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  const body = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 });
  }

  const posthog = getPostHogClient();

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const cartId = intent.metadata?.cartId;
    const tipRate = Number(intent.metadata?.tipRate ?? 0) || 0;
    const db = serviceClient();
    // idempotent: unique(stripe_payment_intent_id) means a retry is a no-op
    const { data: existing } = await db
      .from("qr_orders")
      .select("id")
      .eq("stripe_payment_intent_id", intent.id)
      .maybeSingle();
    if (!existing && cartId) {
      // Re-derive the server-authoritative breakdown and reconcile it against the actual charge
      // before fulfilling — the cart could have mutated between intent-create and this webhook.
      // mms_fulfill_order re-checks the sum == intent.amount and snapshots the order (in cents).
      let totals;
      try {
        totals = await getCartTotals(cartId, tipRate);
      } catch (e) {
        // The cart row may be unreadable/deleted between intent-create and delivery. Don't let the
        // bare throw 500 without context — log the cart + PI, then 500 so Stripe retries.
        console.error("[stripe webhook] getCartTotals failed", {
          cartId,
          paymentIntent: intent.id,
          error: e,
        });
        return NextResponse.json({ error: "Totals lookup failed; will retry" }, { status: 500 });
      }
      if (totals.totalCents !== intent.amount) {
        return NextResponse.json(
          { error: `amount mismatch: cart=${totals.totalCents} intent=${intent.amount}` },
          { status: 409 }, // non-2xx → Stripe retries; surfaces a tampered/stale cart
        );
      }
      const { data: orderId, error: fulfillErr } = await db.rpc("mms_fulfill_order", {
        p_cart_id: cartId,
        p_payment_intent: intent.id,
        p_amount_cents: intent.amount,
        p_subtotal_cents: totals.subtotalCents,
        p_discount_cents: totals.discountCents,
        p_service_charge_cents: totals.serviceChargeCents,
        p_tax_cents: totals.taxCents,
        p_tip_cents: totals.tipCents,
      });
      // supabase-js returns the Postgres error in `error` — it does NOT throw. Swallowing it would
      // 200 the event, so Stripe marks it handled and never retries → a charged diner with no order.
      // Return 5xx so Stripe redelivers (up to 72h); fulfillment is idempotent on the PI id, so a
      // later retry that succeeds is safe. Log the full error (code/details/hint) for triage.
      if (fulfillErr) {
        console.error("[stripe webhook] mms_fulfill_order failed", {
          cartId,
          paymentIntent: intent.id,
          error: fulfillErr,
        });
        return NextResponse.json({ error: "Fulfillment failed; will retry" }, { status: 500 });
      }
      // QBO accounting sync (M2·P2.4): enqueue the order durably, then post the Sales Receipt OUT OF
      // BAND in after() — QuickBooks latency/outage must never delay the Stripe ack or block the money
      // path. The sync is fail-safe (disabled/unconfigured → logged skip) and idempotent (one receipt
      // per order); if after() never runs, the 'pending' queue row is drained by processPendingQboSyncs.
      if (orderId) {
        await enqueueQboSync(db, orderId);
        after(() => syncOrderToQbo(orderId));
      }
      // Capture exactly once — on the delivery that actually fulfills. A duplicate Stripe redelivery
      // (existing != null) or a missing-cartId event no longer double-counts / mis-fires analytics.
      posthog.capture({
        distinctId: cartId,
        event: "payment_succeeded",
        properties: {
          cart_id: cartId,
          payment_intent_id: intent.id,
          amount_cents: intent.amount,
          currency: intent.currency,
        },
      });
    } else if (!existing && !cartId) {
      // Anomalous: a succeeded charge whose intent metadata has no cartId (our create-intent always
      // sets it). We can't fulfill and a retry won't help, so don't 5xx — but never let it vanish.
      console.error("[stripe webhook] succeeded intent missing cartId metadata", {
        paymentIntent: intent.id,
      });
    }
  } else if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    const cartId = intent.metadata?.cartId;
    // Free the pay-window lock (P3.2-lock): the charge failed, so the cart returns to editable for the
    // whole table (the diner can retry or change the order). Unconditional release by cart — the payer
    // is whoever held it. Idempotent + best-effort; the TTL is the backstop if this is missed.
    if (cartId) await releaseCartLock(cartId, null).catch(() => {});
    posthog.capture({
      distinctId: cartId ?? intent.id,
      event: "payment_failed",
      properties: {
        cart_id: cartId,
        payment_intent_id: intent.id,
        amount_cents: intent.amount,
        // `.code` (a fixed enum, e.g. card_declined / insufficient_funds), not the freeform `.message`
        // which can carry bank-issued, PI-adjacent text ("card reported stolen").
        failure_code: intent.last_payment_error?.code,
      },
    });
  }
  // (handle charge.refunded, … as needed)

  // Drain analytics AFTER the response is sent (Next `after`) — keeps the function alive for the
  // flush without coupling the Stripe 200 ack latency to PostHog (a hung endpoint can't delay the
  // ack). flushAt:1 already best-effort; this guarantees the drain attempt without blocking.
  after(async () => {
    try {
      await posthog.flush();
    } catch {
      // fulfillment already succeeded — never surface an analytics-drain failure
    }
  });

  return NextResponse.json({ received: true });
}
