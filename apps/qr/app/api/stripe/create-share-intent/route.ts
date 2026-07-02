import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { createIntentInput } from "@mms/db/schemas";
import { getStripe } from "@/lib/stripe";
import { assertCartMember, AuthzError } from "@/lib/authz";
import { withinMutationRate } from "@/lib/rate";
import { getPostHogClient } from "@/lib/posthog-server";

/**
 * Split-tender: create ONE payer's authorize-only PaymentIntent (M3·P3.3b, Option A). The caller pays
 * THEIR share — the server re-derives the amount from the stored share breakdown + the payer's chosen
 * tip; the client never sends a price (same server-authoritative rule as create-intent). The PI is
 * `capture_method: "manual"` (authorize now, capture-all later when the LAST share authorizes), so no
 * money moves until the whole table is covered. The webhook (amount_capturable_updated → authorized;
 * all authorized → capture-all → succeeded → fulfill) drives settlement from here.
 */
export async function POST(req: NextRequest) {
  try {
    const { cartId, tipRate } = createIntentInput.parse(await req.json());

    // Only a verified member may pay, and only THEIR own seat's share (uid is the authorized seat).
    const { uid, settling } = await assertCartMember(cartId);

    // Per-device flood guard (P3.4): bound share-PI minting per seat (a tip change mints a fresh PI, so
    // the idempotency key doesn't bound distinct amounts). Fail-open. Before any Stripe call.
    if (!(await withinMutationRate(uid)))
      return NextResponse.json(
        { error: "Too many attempts — wait a moment and try again." },
        { status: 429 },
      );

    if (!settling)
      return NextResponse.json(
        { error: "No split is in progress for this order." },
        { status: 400 },
      );

    const db = serviceClient();
    const { data: share } = await db
      .from("qr_cart_shares")
      .select(
        "id,subtotal_cents,discount_cents,service_charge_cents,tax_cents,status,stripe_payment_intent_id",
      )
      .eq("cart_id", cartId)
      .eq("seat_id", uid)
      .maybeSingle();
    if (!share)
      return NextResponse.json({ error: "You’re not part of this split." }, { status: 400 });
    // Cart-open guard (S1.3): never authorize a share on a cart that's no longer open — a staff cash
    // settle or a turnover clear-table may have settled/cancelled it out-of-band. Without this, a
    // pending share could be authorized after the table was settled, stranding the charge when
    // mms_fulfill_split_order finds a non-open cart. Closes the window at the root for every settle path.
    const { data: shareCart } = await db
      .from("qr_carts")
      .select("status")
      .eq("id", cartId)
      .maybeSingle();
    if (shareCart?.status !== "open")
      return NextResponse.json(
        { error: "This table’s order has already been settled." },
        { status: 409 },
      );
    if (share.status === "captured")
      return NextResponse.json({ error: "You’ve already paid your share." }, { status: 409 });
    if (share.status === "authorized")
      return NextResponse.json(
        { error: "Your share is already authorized — ask the host to cancel to change it." },
        { status: 409 },
      );

    // Re-derive server-side: base = the stored breakdown; tip = the payer's rate on THEIR net (subtotal
    // − discount), mirroring getCartTotals' tipCents. The client's tipRate is bounded by Zod (≤ 0.5).
    const base =
      share.subtotal_cents - share.discount_cents + share.service_charge_cents + share.tax_cents;
    const tip = Math.round((share.subtotal_cents - share.discount_cents) * tipRate);
    const amount = base + tip;

    // A $0 share with no tip has nothing to charge (Stripe won't take a $0 PI) — auto-settle it so the
    // all-captured gate still completes. ($0-base shares are already auto-settled at open; this is the
    // defensive belt for a $0 base + $0 tip that somehow reaches here.)
    if (amount <= 0) {
      await db
        .from("qr_cart_shares")
        .update({
          tip_cents: 0,
          tip_rate: tipRate,
          status: "captured",
          updated_at: new Date().toISOString(),
        })
        .eq("id", share.id);
      return NextResponse.json({ settled: true, amountCents: 0, tipCents: 0 });
    }

    // A tip change before authorizing replaces the PI — cancel the prior PENDING one so no stray
    // authorization lingers. (Best-effort; an already-captured/canceled PI just no-ops.)
    if (share.stripe_payment_intent_id) {
      try {
        await getStripe().paymentIntents.cancel(share.stripe_payment_intent_id);
      } catch {
        /* already gone / not cancelable — ignore */
      }
    }

    const intent = await getStripe().paymentIntents.create(
      {
        amount,
        currency: "usd",
        capture_method: "manual", // authorize now; capture-all when the table is fully covered
        // `allow_redirects: "never"` keeps the share to inline methods (card / Apple Pay / Google Pay /
        // Link) so confirmPayment never navigates away — the payer stays on the live board (a
        // redirect-based method would return to /cart with no result handler and re-mint a fresh PI).
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { cartId, seatId: uid, shareId: share.id, kind: "split_share" },
      },
      // Amount in the key: a tip change (new amount) mints a fresh PI; an identical re-submit (double
      // tap) returns the same PI rather than a duplicate authorization.
      { idempotencyKey: `share_${share.id}_${amount}` },
    );

    // Claim the row atomically: only overwrite it if it's STILL pre-authorization (pending/failed/canceled)
    // AND still points at the PI we read. Guards a TOCTOU where the amount_capturable_updated webhook
    // authorized+captured this share (via captureAllIfReady) between our status read above and this write —
    // without the predicate, this update would flip the CAPTURED row back to 'pending' pointing at the new
    // PI, orphaning the captured charge (no ledger) and letting the seat pay twice when the new PI clears.
    let claim = db
      .from("qr_cart_shares")
      .update({
        amount_cents: amount,
        tip_cents: tip,
        tip_rate: tipRate,
        stripe_payment_intent_id: intent.id,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", share.id)
      .in("status", ["pending", "failed", "canceled"]);
    claim = share.stripe_payment_intent_id
      ? claim.eq("stripe_payment_intent_id", share.stripe_payment_intent_id)
      : claim.is("stripe_payment_intent_id", null);
    const { data: claimed, error: updErr } = await claim.select("id").maybeSingle();
    if (updErr || !claimed) {
      // Either the write failed, or a concurrent webhook advanced this share (authorized/captured) since we
      // read it → cancel the just-minted PI so it can't be captured, and never revert the ledger. Tell the
      // payer their share already moved on (409) rather than returning a client secret we didn't record.
      try {
        await getStripe().paymentIntents.cancel(intent.id);
      } catch {
        /* best-effort */
      }
      return updErr
        ? NextResponse.json({ error: "Could not start your payment" }, { status: 500 })
        : NextResponse.json(
            { error: "Your share was just settled — refresh to see it." },
            { status: 409 },
          );
    }

    getPostHogClient().capture({
      distinctId: uid,
      event: "split_share_intent_created",
      properties: { cart_id: cartId, amount_cents: amount, tip_cents: tip, tip_rate: tipRate },
    });

    return NextResponse.json({
      clientSecret: intent.client_secret,
      amountCents: amount,
      tipCents: tip,
    });
  } catch (e) {
    if (e instanceof AuthzError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as Error;
    if (err.name === "ZodError") return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[create-share-intent] unexpected failure:", err);
    return NextResponse.json({ error: "Payment service error" }, { status: 500 });
  }
}
