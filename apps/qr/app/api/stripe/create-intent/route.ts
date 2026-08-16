// verify:slice-exempt — the W19 tip-amount ceiling this change adds is the pure predicate
// `tipWithinAmountCap` in lib/tip.ts, where its mutant (tip/amount-cap-dropped) lives and its suite
// reddens; this route only wires the refusal (routes have no test runner to own a mutant here).
import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { createIntentInput } from "@mms/db/schemas";
import { getStripe } from "@/lib/stripe";
import { getCartTotals } from "@/lib/totals";
import { tipWithinAmountCap } from "@/lib/tip";
import { assertCartMember, AuthzError } from "@/lib/authz";
import { withinMutationRate } from "@/lib/rate";
import { acquireCartLock, releaseCartLock } from "@/lib/lock";
import { getPostHogClient } from "@/lib/posthog-server";

// Creates a PaymentIntent for the SERVER-COMPUTED total. The client sends only the
// cartId + tip choice — never an amount. (Fixes client-authoritative pricing.)
export async function POST(req: NextRequest) {
  let acquired: { cartId: string; uid: string } | null = null;
  try {
    const { cartId, tipRate, firstName } = createIntentInput.parse(await req.json());

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

    // Pickup honesty (P2.2 · W5e): a pickup order is EITHER scheduled (a slot the diner picked) OR ASAP
    // (no slot yet — "make it now"). Both are gated HERE, at the charge boundary, so a client can't dodge
    // the kitchen's open-hours + per-slot capacity limits by forging state.
    //   • Scheduled → re-validate the held slot still has room (it can fill between pick and pay).
    //   • ASAP (null slot) → mms_pickup_asap atomically SNAPS the earliest bookable slot (consuming its
    //     capacity, only within open hours / while capacity remains) and fires now (fire_at=null). If the
    //     kitchen is closed or fully booked, ASAP is refused — never take a paid order we can't fulfill.
    const db = serviceClient();
    const { data: sess } = await db
      .from("table_sessions")
      .select("mode")
      .eq("id", sessionId)
      .single();
    // W5g: the timing the diner actually committed to at the pay boundary — 'scheduled' (a slot they
    // picked) or 'asap' (server-snapped now). Emitted as ONE event below that BOTH paths hit, so the
    // pickup funnel isn't blind to the default-ASAP path (which fires no client-side timing event).
    let pickupWhen: "asap" | "scheduled" | undefined;
    if (sess?.mode === "pickup") {
      const { data: cart } = await db
        .from("qr_carts")
        .select("pickup_slot,fire_at")
        .eq("id", cartId)
        .single();
      // Discriminate on fire_at, NOT pickup_slot: a SCHEDULED cart always carries fire_at = slot - prep
      // (non-null); an ASAP cart carries fire_at = null WHETHER OR NOT it already holds a snapped
      // pickup_slot from an earlier pay attempt. Keying on pickup_slot would route a retry of a
      // snapped-then-declined ASAP order into the scheduled validator and 409 it on a slot the diner
      // never chose (and could no longer clear); keying on fire_at re-snaps the current earliest instead.
      if (cart?.fire_at) {
        // Scheduled: re-validate the held slot still has room. Exclude THIS cart's own hold so we're
        // asking "is there still room for me", not double-counting.
        // NOTE(soft-cap): this is a plain read, not advisory-locked like mms_set_pickup_slot — under a
        // last-seat race two carts can both pass here and both pay. That's the deliberate accepted soft-cap
        // (a hard cap at fulfillment would strand an already-charged diner; see migration 0100's note); the
        // lead time makes the overlap window small. We over-accept by design rather than reject a paid order.
        const { data: slots } = await db.rpc("mms_pickup_slots", { p_exclude_cart: cartId });
        const slotMs = cart.pickup_slot ? new Date(cart.pickup_slot).getTime() : NaN;
        const open = (slots ?? []).some((s) => new Date(s.slot_time).getTime() === slotMs);
        if (!open) {
          await releaseCartLock(cartId, uid);
          return NextResponse.json(
            { error: "That pickup time just filled — please pick another." },
            { status: 409 },
          );
        }
        pickupWhen = "scheduled";
      } else {
        // ASAP (fire_at null, snapped-or-not): snap the CURRENT earliest bookable slot atomically
        // (open-hours + capacity gate, today-bounded) and fire now. mms_pickup_asap excludes this cart's
        // own hold, so a re-snap safely overwrites a stale earlier snap with the fresh earliest.
        const { data: asap, error: asapErr } = await db.rpc("mms_pickup_asap", {
          p_cart_id: cartId,
        });
        const row = asap?.[0];
        if (asapErr || !row?.ok) {
          await releaseCartLock(cartId, uid);
          const msg =
            row?.reason === "closed"
              ? "The kitchen’s closed right now — please order during open hours."
              : row?.reason === "full"
                ? "Pickup’s fully booked for today — please check back tomorrow."
                : "We couldn’t start a pickup order just now — please try again.";
          // 409 for a genuine capacity/hours refusal (retryable state), 400 for a config/cart-state miss.
          const status = row?.reason === "closed" || row?.reason === "full" ? 409 : 400;
          return NextResponse.json({ error: msg }, { status });
        }
        pickupWhen = "asap";
      }
      // One timing-confirmation event both paths reach (the default-ASAP path fires no client-side
      // pickup event). distinctId=uid mirrors pickup_slot_set so the pickup funnel stays connected.
      if (pickupWhen) {
        getPostHogClient().capture({
          distinctId: uid,
          event: "pickup_when_confirmed",
          properties: { cart_id: cartId, when: pickupWhen },
        });
      }
    }

    // W3e: persist the takeout call-out name on the CART (member+lock already asserted; the
    // open-status guard rides in the statement). Fulfillment snapshots it onto the order for expo/the
    // order-ready board; never analytics (PII). Mode is an ALLOWLIST (pickup/scango) — a missed
    // session read must fail to no-name, never fail-open onto a table order. An empty string CLEARS
    // (the diner deleted the field on a retry — a stale name must not keep getting called out).
    // Non-fatal: a name write must never block a payment.
    if (firstName !== undefined && (sess?.mode === "pickup" || sess?.mode === "scango")) {
      const { error: nameErr } = await db
        .from("qr_carts")
        .update({ customer_name: firstName || null })
        .eq("id", cartId)
        .eq("status", "open");
      if (nameErr) console.error("[create-intent] customer_name write failed:", nameErr.message);
    }

    const totals = await getCartTotals(cartId, tipRate);
    const amount = totals.totalCents; // already cents, server-derived
    if (amount <= 0) {
      await releaseCartLock(cartId, uid);
      return NextResponse.json({ error: "Empty cart" }, { status: 400 });
    }
    // W19 — the tip ceiling is a DOLLAR amount ($1,000, the cash tip's own bound), enforced here on
    // the DERIVED cents because a rate cannot express a dollar cap. The client clamps to the same
    // constant, so an in-app diner never sees this; it exists for the hostile/raw POST.
    if (!tipWithinAmountCap(totals.tipCents)) {
      await releaseCartLock(cartId, uid);
      return NextResponse.json({ error: "Tip exceeds the $1,000.00 maximum" }, { status: 400 });
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
