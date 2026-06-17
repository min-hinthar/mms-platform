import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { serviceClient } from "@mms/db/server";
import { getPostHogClient } from "@/lib/posthog-server";

// Fulfillment is webhook-driven, signature-verified, idempotent (QA checklist).
// Stripe retries non-200s for up to 72h, so this must be safe to run more than once.
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 });
  }

  const posthog = getPostHogClient();

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const cartId = intent.metadata?.cartId;
    const db = serviceClient();
    // idempotent: unique(stripe_payment_intent_id) means a retry is a no-op upsert
    const { data: existing } = await db
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", intent.id)
      .maybeSingle();
    if (!existing && cartId) {
      // snapshot the server-priced cart into an order, mark cart paid, award gems, etc.
      await db.rpc("mms_fulfill_order", { p_cart_id: cartId, p_payment_intent: intent.id });
    }
    posthog.capture({
      distinctId: cartId ?? intent.id,
      event: "payment_succeeded",
      properties: {
        cart_id: cartId,
        payment_intent_id: intent.id,
        amount_cents: intent.amount,
        currency: intent.currency,
      },
    });
  } else if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    const cartId = intent.metadata?.cartId;
    posthog.capture({
      distinctId: cartId ?? intent.id,
      event: "payment_failed",
      properties: {
        cart_id: cartId,
        payment_intent_id: intent.id,
        amount_cents: intent.amount,
        failure_message: intent.last_payment_error?.message,
      },
    });
  }
  // (handle charge.refunded, … as needed)

  return NextResponse.json({ received: true });
}
