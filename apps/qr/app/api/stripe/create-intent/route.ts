import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getCartTotals } from "@/lib/cart";

// Creates a PaymentIntent for the SERVER-COMPUTED total. The client sends only the
// cartId + tip choice — never an amount. (Fixes client-authoritative pricing.)
export async function POST(req: NextRequest) {
  try {
    const { cartId, tipRate = 0 } = await req.json();
    if (!cartId) return NextResponse.json({ error: "cartId required" }, { status: 400 });

    const totals = await getCartTotals(cartId, Number(tipRate) || 0);
    const amount = Math.round(totals.total * 100); // cents, server-derived
    if (amount <= 0) return NextResponse.json({ error: "Empty cart" }, { status: 400 });

    // TODO(C3): verify the caller's table-session JWT is a member of this cart before creating the intent.
    const intent = await stripe.paymentIntents.create(
      { amount, currency: "usd", automatic_payment_methods: { enabled: true }, metadata: { cartId } },
      { idempotencyKey: `pi_${cartId}_${amount}` } // dedupe double-submits; a changed amount → a new intent
    );

    return NextResponse.json({ clientSecret: intent.client_secret, totals });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
