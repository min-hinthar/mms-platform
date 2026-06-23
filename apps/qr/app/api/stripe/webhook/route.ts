import { NextRequest, NextResponse, after } from "next/server";
import { getStripe } from "@/lib/stripe";
import { serviceClient } from "@mms/db/server";
import { getCartTotals } from "@/lib/totals";
import { releaseCartLock, releaseSettlement } from "@/lib/lock";
import { logTabEvent } from "@/lib/tab-events";
import { getPostHogClient } from "@/lib/posthog-server";
import { enqueueQboSync, syncOrderToQbo } from "@/lib/qbo/client";
import {
  onShareAuthorized,
  onShareCaptured,
  onShareFailed,
  onShareCanceled,
} from "@/lib/split-settle";

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
    const db = serviceClient();
    if (intent.metadata?.kind === "split_share") {
      // Split-tender (M3·P3.3b): a share's capture landed. Mark it captured; once EVERY share is
      // captured, mms_fulfill_split_order snapshots the ONE order (idempotent) and the freeze lifts.
      try {
        const orderId = await onShareCaptured(intent.id);
        if (orderId) {
          await enqueueQboSync(db, orderId);
          after(() => syncOrderToQbo(orderId));
          posthog.capture({
            distinctId: intent.metadata?.cartId ?? intent.id,
            event: "payment_succeeded",
            properties: { cart_id: intent.metadata?.cartId, order_id: orderId, split: true },
          });
          // Tab-close audit (S3.3 / T13): a split-tender settle that closed a tab — completes the
          // open→close arc for the split path (cash/single-card are logged elsewhere). orderId is
          // returned only on the open→paid transition (null on redelivery), so this fires exactly once.
          // Actor 'diner' — the table split the bill. Best-effort, out of band.
          const splitCartId = intent.metadata?.cartId;
          if (splitCartId) {
            const { data: closedCart } = await db
              .from("qr_carts")
              .select("tab_type")
              .eq("id", splitCartId)
              .maybeSingle();
            if (closedCart?.tab_type && closedCart.tab_type !== "none") {
              const { data: ord } = await db
                .from("qr_orders")
                .select("total_cents")
                .eq("id", orderId)
                .maybeSingle();
              after(() =>
                logTabEvent({
                  cartId: splitCartId,
                  event: "closed",
                  actorKind: "diner",
                  tabType: closedCart.tab_type as "trust" | "secure",
                  amountCents: ord?.total_cents ?? null,
                }),
              );
            }
          }
        }
      } catch (e) {
        console.error("[stripe webhook] split capture/fulfill failed", {
          paymentIntent: intent.id,
          error: e,
        });
        return NextResponse.json(
          { error: "Split fulfillment failed; will retry" },
          { status: 500 },
        );
      }
    } else {
      const cartId = intent.metadata?.cartId;
      const tipRate = Number(intent.metadata?.tipRate ?? 0) || 0;
      // idempotent: unique(stripe_payment_intent_id) means a retry is a no-op
      const { data: existing } = await db
        .from("qr_orders")
        .select("id")
        .eq("stripe_payment_intent_id", intent.id)
        .maybeSingle();
      if (!existing && cartId) {
        // Cross-tender guard (S1.3): if the cart was already settled by ANOTHER tender (a cash settle
        // taken while this PI's pay-lock was stale), this card charge is a double-collection — do NOT
        // record a duplicate order. Ack (200) so Stripe stops retrying, and alert (non-PII) for a manual
        // refund of the orphan charge (S4.3 automates line-level refunds). mms_fulfill_order also raises
        // on a non-open cart as the hard DB backstop; this is the graceful, no-retry-storm path.
        const { data: cartRow } = await db
          .from("qr_carts")
          .select("status,tab_type")
          .eq("id", cartId)
          .maybeSingle();
        if (cartRow && cartRow.status !== "open") {
          console.error("[stripe webhook] card PI for an already-settled cart — refund needed", {
            cartId,
            paymentIntent: intent.id,
            cartStatus: cartRow.status,
          });
          // Durable recovery ledger (S1-audit S3): the card was CAPTURED but no order is recorded, so a
          // log alone strands the customer's money. Record it for an operator / S4.3 auto-refund.
          // Idempotent on the PI (the webhook may redeliver); best-effort — never fail the 200 ack on it.
          const { error: refundErr } = await db.from("qr_refunds_needed").upsert(
            {
              payment_intent: intent.id,
              cart_id: cartId,
              // the literally-captured amount (== amount for a single-capture succeeded PI)
              amount_cents: intent.amount_received ?? intent.amount ?? null,
              reason: "card_after_settle",
            },
            { onConflict: "payment_intent", ignoreDuplicates: true },
          );
          if (refundErr)
            console.error("[stripe webhook] failed to record refund-needed", {
              paymentIntent: intent.id,
              message: refundErr.message,
            });
          posthog.capture({
            distinctId: cartId,
            event: "double_tender_card_after_settle",
            properties: { cart_id: cartId, payment_intent: intent.id, cart_status: cartRow.status },
          });
          return NextResponse.json({ received: true, skipped: "cart already settled" });
        }
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
        // Tab-close audit (S3.3 / T13): a card settle that closed a tab. The actor comes from the PI
        // metadata — a staff off-session close (closeSecureTab) stamps closedBy='staff'; a diner paying
        // on their phone leaves it unset → 'diner'. Captures BOTH card close paths in one place; cash
        // closes are logged in settleCash. Best-effort, drained out of band (never delays the ack).
        if (orderId && cartRow?.tab_type && cartRow.tab_type !== "none") {
          const closedByStaff = intent.metadata?.closedBy === "staff";
          after(() =>
            logTabEvent({
              cartId,
              event: "closed",
              actorKind: closedByStaff ? "staff" : "diner",
              actorStaffId: closedByStaff ? (intent.metadata?.closedByStaffId ?? null) : null,
              tabType: cartRow.tab_type as "trust" | "secure",
              amountCents: intent.amount,
            }),
          );
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
    }
  } else if (event.type === "payment_intent.amount_capturable_updated") {
    // Split-tender: a share authorized (manual-capture confirmed). Mark it; capture-all once the whole
    // table is authorized. (Single-pay PIs are automatic-capture and never fire this event.)
    const intent = event.data.object;
    if (intent.metadata?.kind === "split_share") {
      try {
        await onShareAuthorized(intent.id);
      } catch (e) {
        console.error("[stripe webhook] split authorize/capture failed", {
          paymentIntent: intent.id,
          error: e,
        });
        return NextResponse.json({ error: "Split capture failed; will retry" }, { status: 500 });
      }
    }
  } else if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    const cartId = intent.metadata?.cartId;
    if (intent.metadata?.kind === "split_share") {
      // A share's auth failed — mark it; the settlement stays frozen until the host aborts or the payer
      // retries (split uses the table-wide freeze, not the single-pay lock — nothing to release here).
      await onShareFailed(intent.id).catch((e) =>
        console.error("[stripe webhook] onShareFailed failed", {
          paymentIntent: intent.id,
          error: e,
        }),
      );
    } else if (cartId) {
      // Single-pay: free the pay-window lock (P3.2-lock) so the cart returns to editable for the table.
      // Unconditional release by cart; idempotent + best-effort; the TTL is the backstop. ALSO release the
      // settle freeze: a secure-tab off-session close (S3.2) holds settle_at (not the single-pay lock), so
      // an async processing→failed decline would otherwise strand the table frozen for the full SETTLE_TTL.
      await releaseCartLock(cartId, null).catch(() => {});
      await releaseSettlement(cartId).catch(() => {});
    }
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
  } else if (event.type === "payment_intent.canceled") {
    // Split-tender: a share's hold was canceled (host abort, or a tip-change replacement). Record it.
    const intent = event.data.object;
    if (intent.metadata?.kind === "split_share") {
      await onShareCanceled(intent.id).catch((e) =>
        console.error("[stripe webhook] onShareCanceled failed", {
          paymentIntent: intent.id,
          error: e,
        }),
      );
    }
  } else if (event.type === "setup_intent.succeeded") {
    // Secure tab (S3.2): the diner's card-save confirmed. Record the saved PaymentMethod token + flip the
    // tab to 'secure' (mms_secure_tab — service-role, idempotent, never charges). This is the server-
    // authoritative record; the route never reports "secured" eagerly (T7). The off-session close later
    // reuses the SAME payment_intent.succeeded → reconcile → mms_fulfill_order path above (cartId metadata).
    const si = event.data.object;
    const cartId = si.metadata?.cartId;
    const customer = typeof si.customer === "string" ? si.customer : (si.customer?.id ?? null);
    const pm =
      typeof si.payment_method === "string" ? si.payment_method : (si.payment_method?.id ?? null);
    if (cartId && customer && pm) {
      const db = serviceClient();
      const { data: secureResult, error: secureErr } = await db.rpc("mms_secure_tab", {
        p_cart: cartId,
        p_customer: customer,
        p_payment_method: pm,
      });
      // supabase-js returns the PG error in `error` (no throw); swallowing would 200 the event and Stripe
      // would never retry → a saved card the tab never recorded. 5xx so Stripe redelivers (idempotent RPC).
      if (secureErr) {
        console.error("[stripe webhook] mms_secure_tab failed", {
          cartId,
          setupIntent: si.id,
          error: secureErr,
        });
        return NextResponse.json(
          { error: "Secure-tab record failed; will retry" },
          { status: 500 },
        );
      }
      posthog.capture({
        distinctId: cartId,
        event: "tab_secured",
        properties: { cart_id: cartId, setup_intent_id: si.id },
      });
      // Durable audit (S3.3 / T13): the diner secured the tab (saved a card). Non-PII — actor_kind='diner'
      // with no staff id. Gated on the ACTUAL flip ('secured') so a Stripe SetupIntent redelivery (the RPC
      // is idempotent and returns 'exists') doesn't append a duplicate row. Best-effort, out of band.
      if (secureResult === "secured")
        after(() =>
          logTabEvent({ cartId, event: "secured", actorKind: "diner", tabType: "secure" }),
        );
    } else {
      // Our setup-intent route always sets cartId metadata + a customer; a confirmed SI missing any of
      // these can't be recorded and a retry won't help. Don't 5xx into a retry storm, but never vanish.
      console.error(
        "[stripe webhook] setup_intent.succeeded missing cartId/customer/payment_method",
        {
          setupIntent: si.id,
        },
      );
    }
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
