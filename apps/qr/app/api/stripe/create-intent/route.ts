import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
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
    const { sessionId } = await assertCartMember(cartId);

    // Pickup honesty (P2.2): a pickup order must hold a still-available slot. Re-check at the pay
    // boundary — a slot can fill between selection and checkout, and capacity is server-authoritative.
    const db = serviceClient();
    const { data: sess } = await db
      .from("table_sessions")
      .select("mode")
      .eq("id", sessionId)
      .single();
    if (sess?.mode === "pickup") {
      const { data: cart } = await db
        .from("qr_carts")
        .select("pickup_slot")
        .eq("id", cartId)
        .single();
      if (!cart?.pickup_slot)
        return NextResponse.json({ error: "Pick a pickup time first." }, { status: 400 });
      // Exclude THIS cart's own hold so we're asking "is there still room for me", not double-counting.
      // NOTE(soft-cap): this is a plain read, not advisory-locked like mms_set_pickup_slot — under a
      // last-seat race two carts can both pass here and both pay. That's the deliberate accepted soft-cap
      // (a hard cap at fulfillment would strand an already-charged diner; see migration 0100's note); the
      // lead time makes the overlap window small. We over-accept by design rather than reject a paid order.
      const { data: slots } = await db.rpc("mms_pickup_slots", { p_exclude_cart: cartId });
      const slotMs = new Date(cart.pickup_slot).getTime();
      const open = (slots ?? []).some((s) => new Date(s.slot_time).getTime() === slotMs);
      if (!open)
        return NextResponse.json(
          { error: "That pickup time just filled — please pick another." },
          { status: 409 },
        );
    }

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
    if (err.name === "ZodError") return NextResponse.json({ error: err.message }, { status: 400 });
    // Don't leak a raw SDK string (e.g. a Stripe config/PM message) in the response body — it aids
    // recon. The client already shows a generic UX message; log the real one server-side only.
    console.error("[create-intent] unexpected failure:", err);
    return NextResponse.json({ error: "Payment service error" }, { status: 500 });
  }
}
