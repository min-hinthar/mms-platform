import { NextRequest, NextResponse } from "next/server";
import { createIntentInput } from "@mms/db/schemas";
import { getStripe } from "@/lib/stripe";
import { getCartTotals } from "@/lib/totals";
import { assertCartMember, AuthzError } from "@/lib/authz";
import { getPostHogClient } from "@/lib/posthog-server";

// Creates a PaymentIntent for the SERVER-COMPUTED total. The client sends only the
// cartId + tip choice — never an amount. (Fixes client-authoritative pricing.)
export async function POST(req: NextRequest) {
  try {
    const { cartId, tipRate } = createIntentInput.parse(await req.json());

    // C3: only a verified member of this cart's session may mint its PaymentIntent.
    await assertCartMember(cartId);

    const totals = await getCartTotals(cartId, tipRate);
    const amount = totals.totalCents; // already cents, server-derived
    if (amount <= 0) return NextResponse.json({ error: "Empty cart" }, { status: 400 });

    // tipRate rides in metadata so the webhook can recompute the identical breakdown to reconcile.
    const intent = await getStripe().paymentIntents.create(
      {
        amount,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: { cartId, tipRate: String(tipRate) },
      },
      // Include tipRate in the key so two different tip choices that happen to land on the same
      // total (after a cart edit) can't collide onto one intent — Stripe would otherwise return the
      // first PI (with the OLD tipRate in metadata), and the webhook would fulfill the wrong breakdown.
      { idempotencyKey: `pi_${cartId}_${amount}_t${tipRate}` },
    );

    // NOTE(realtime phase): we intentionally do NOT lock the cart here. A lock during the pay window
    // only matters under CONCURRENT editing (group carts), which isn't wired yet — and locking at
    // intent-create strands a cart if the diner abandons the pay screen (no auto-release). The
    // signature-verified webhook already reconciles the live total vs intent.amount before fulfilling
    // (a mutated cart 409s, never mis-fulfills). The lock + its unlock lifecycle land with the
    // group-cart Realtime sync (where concurrent editors and a natural release point exist).

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: cartId,
      event: "payment_intent_created",
      properties: {
        cart_id: cartId,
        amount_cents: amount,
        tip_rate: tipRate,
        subtotal_cents: totals.subtotalCents,
        total_cents: totals.totalCents,
      },
    });

    return NextResponse.json({ clientSecret: intent.client_secret, totals });
  } catch (e) {
    if (e instanceof AuthzError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as Error;
    // ZodError (bad input shape) → 400; anything else → 500. (Avoid importing zod here so knip
    // doesn't flag an unused dep in apps/qr; the schema lives in @mms/db.)
    const status = err.name === "ZodError" ? 400 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
