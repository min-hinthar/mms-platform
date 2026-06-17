import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { serviceClient } from "@mms/db/server";

// Fulfillment is webhook-driven, signature-verified, idempotent (QA checklist).
// Stripe retries non-200s for up to 72h, so this must be safe to run more than once.
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const cartId = intent.metadata?.cartId;
    const db = serviceClient();
    // idempotent: unique(stripe_payment_intent_id) means a retry is a no-op upsert
    const { data: existing } = await db.from("orders")
      .select("id").eq("stripe_payment_intent_id", intent.id).maybeSingle();
    if (!existing && cartId) {
      // snapshot the server-priced cart into an order, mark cart paid, award gems, etc.
      await db.rpc("mms_fulfill_order", { p_cart_id: cartId, p_payment_intent: intent.id });
    }
  }
  // (handle payment_intent.payment_failed, charge.refunded, … as needed)

  return NextResponse.json({ received: true });
}
