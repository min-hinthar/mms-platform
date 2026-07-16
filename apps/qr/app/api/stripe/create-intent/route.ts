import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { createIntentInput } from "@mms/db/schemas";
import { getStripe } from "@/lib/stripe";
import { getCartTotals } from "@/lib/totals";
import { assertCartMember, AuthzError } from "@/lib/authz";
import { withinMutationRate } from "@/lib/rate";
import { acquireCartLock, releaseCartLock } from "@/lib/lock";
import { getPostHogClient } from "@/lib/posthog-server";

// Creates a PaymentIntent for the SERVER-COMPUTED total. The client sends only the
// cartId + tip choice — never an amount. (Fixes client-authoritative pricing.)
export async function POST(req: NextRequest) {
  let acquired: { cartId: string; uid: string } | null = null;
  try {
    const { cartId, tipRate } = createIntentInput.parse(await req.json());

    // C3: only a verified member of this cart's session may mint its PaymentIntent.
    const { sessionId, uid, settling } = await assertCartMember(cartId);

    // Per-device flood guard (P3.4): bound PaymentIntent minting per seat so a hostile client can't spam
    // intent creation (distinct tip amounts dodge the idempotency key). Fail-open. Before any Stripe call.
    if (!(await withinMutationRate(uid)))
      return NextResponse.json(
        { error: "Too many attempts — wait a moment and try again." },
        { status: 429 },
      );

    // Split-tender in flight (M3·P3.3b): single-pay and split are mutually exclusive (acquireCartLock
    // also rejects a fresh settlement). Catch it here FIRST so the diner gets an honest, actionable
    // message — pay your share on the split board — not the generic "someone's checking out" lock copy.
    if (settling)
      return NextResponse.json(
        { error: "Your table is splitting the bill — pay your share on the split screen." },
        { status: 409 },
      );

    // Lock the cart for the pay window (P3.2-lock) BEFORE deriving the amount, so a peer can't mutate
    // it mid-checkout → the webhook reconcile 409s / charges with no order. Atomic; the SAME payer
    // re-acquiring (refresh / retry) succeeds, a stale lock is taken over, a fresh lock by ANOTHER
    // member is rejected. Released on decline (webhook), "Edit order" (releasePayLock), or the TTL.
    const lock = await acquireCartLock(cartId, uid);
    if (lock === "closed")
      return NextResponse.json({ error: "This order is no longer open." }, { status: 400 });
    if (lock === "held_by_other")
      return NextResponse.json(
        { error: "Someone at your table is checking out — try again in a moment." },
        { status: 409 },
      );
    acquired = { cartId, uid }; // release on any post-acquire failure (below) so nothing strands

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
      if (!cart?.pickup_slot) {
        await releaseCartLock(cartId, uid);
        return NextResponse.json({ error: "Pick a pickup time first." }, { status: 400 });
      }
      // Exclude THIS cart's own hold so we're asking "is there still room for me", not double-counting.
      // NOTE(soft-cap): this is a plain read, not advisory-locked like mms_set_pickup_slot — under a
      // last-seat race two carts can both pass here and both pay. That's the deliberate accepted soft-cap
      // (a hard cap at fulfillment would strand an already-charged diner; see migration 0100's note); the
      // lead time makes the overlap window small. We over-accept by design rather than reject a paid order.
      const { data: slots } = await db.rpc("mms_pickup_slots", { p_exclude_cart: cartId });
      const slotMs = new Date(cart.pickup_slot).getTime();
      const open = (slots ?? []).some((s) => new Date(s.slot_time).getTime() === slotMs);
      if (!open) {
        await releaseCartLock(cartId, uid);
        return NextResponse.json(
          { error: "That pickup time just filled — please pick another." },
          { status: 409 },
        );
      }
    }

    const totals = await getCartTotals(cartId, tipRate);
    const amount = totals.totalCents; // already cents, server-derived
    if (amount <= 0) {
      await releaseCartLock(cartId, uid);
      return NextResponse.json({ error: "Empty cart" }, { status: 400 });
    }

    // tipRate rides in metadata so the webhook can recompute the identical breakdown to reconcile.
    const intent = await getStripe().paymentIntents.create(
      {
        amount,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        // tipRate rides in metadata so the webhook recomputes the identical breakdown to reconcile.
        // earnerUid (M4) = the authenticated payer; the webhook stamps qr_orders.earned_by + awards Stars.
        metadata: { cartId, tipRate: String(tipRate), earnerUid: uid },
      },
      // Include tipRate in the key so two different tip choices that happen to land on the same
      // total (after a cart edit) can't collide onto one intent — Stripe would otherwise return the
      // first PI (with the OLD tipRate in metadata), and the webhook would fulfill the wrong breakdown.
      // uid is in the key (Q9) so a SECOND payer minting the same cart/amount/tip gets their OWN PI —
      // otherwise they'd inherit the first payer's intent and its earnerUid (Stars/feedback attribution).
      { idempotencyKey: `pi_${cartId}_${amount}_t${tipRate}_${uid}` },
    );

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
    // A post-acquire failure (totals / Stripe / etc.) must not strand the lock — release now so the
    // table isn't frozen on a transient error (the TTL is the backstop). Best-effort; never mask `e`.
    if (acquired) await releaseCartLock(acquired.cartId, acquired.uid).catch(() => {});
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
