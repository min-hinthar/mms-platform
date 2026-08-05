import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { shareIntentInput } from "@mms/db/schemas";
import { getStripe } from "@/lib/stripe";
import { assertCartMember, AuthzError } from "@/lib/authz";
import { withinMutationRate } from "@/lib/rate";
import { extendSettlement } from "@/lib/lock";
import { captureAllIfReady } from "@/lib/split-settle";
import { shareIntentKey } from "@/lib/split-intent-key";
import { releaseHold } from "@/lib/split-hold";
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
    const { cartId, tipRate } = shareIntentInput.parse(await req.json());

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
    // − discount), mirroring getCartTotals' tipCents. The client's tipRate is bounded by Zod (≤ 0.5 via
    // shareIntentInput — matches the qr_cart_shares.tip_rate CHECK; SharePay only sends presets ≤ 0.20).
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
      // W1·Q4: a $0 share takes no PI, so no webhook will ever re-run the all-covered check — if
      // this was the LAST unsettled share, trigger capture-all here or the table dead-ends with
      // every other card authorized and nothing capturing. Idempotent; no-op when others remain.
      // Best-effort in the REQUEST path (unlike the webhook, a throw here has no Stripe retry and
      // the share is already honestly 'captured') — a transient failure is re-driven by the next
      // succeeded-webhook delivery (onShareCaptured's straggler pass), so log and don't 500.
      try {
        await captureAllIfReady(db, cartId);
      } catch (e) {
        console.error(
          "[create-share-intent] $0-path capture-all failed (webhook will re-drive)",
          e,
        );
      }
      return NextResponse.json({ settled: true, amountCents: 0, tipCents: 0 });
    }

    // A tip change before authorizing replaces the PI — release the prior one so no stray authorization
    // lingers.
    //
    // ⚠️ W10d (M39) — capture WHICH intent we are replacing BEFORE releasing it, because it is now
    // part of the idempotency key. Without it, cancelling and then re-creating under the same
    // `share_<id>_<amount>` key made Stripe replay the intent we had just killed, so a declined payer
    // retrying at the same tip got a canceled client secret every time for the full 24h key window.
    //
    // ⚠️ W10d pre-merge review — this was a bare `catch {}`, and that was unsafe in a way M39 itself
    // made worse. The claim below overwrites `stripe_payment_intent_id` with the replacement, and that
    // column is the ONLY record of this PaymentIntent. Under the old key the re-create replayed the
    // same PI, so forgetting the id was harmless; now the id is genuinely lost. A share can read
    // `pending`/`failed` while its PI holds a live authorization (the 409s above only cover
    // authorized/captured), so a swallowed transport failure here stranded a real hold on a diner's
    // card for ~7 days with nothing on our side able to find it. Classify instead, and never mint over
    // a hold whose state we could not establish.
    const previousIntentId = share.stripe_payment_intent_id ?? null;
    if (previousIntentId) {
      const outcome = await releaseHold(previousIntentId);
      if (outcome === "captured") {
        // The PI succeeded — money moved, and this row is stale rather than unpaid. Do NOT repoint it:
        // the succeeded webhook (onShareCaptured) is the one path allowed to reconcile a capture, and
        // Stripe redelivers it for 72h. Charging a second card here would be the double-pay this
        // route's TOCTOU guard exists to prevent.
        console.error(
          "[create-share-intent] replaced intent had already succeeded — not repointing",
          {
            cartId,
            shareId: share.id,
            paymentIntent: previousIntentId,
          },
        );
        return NextResponse.json({ error: "You’ve already paid your share." }, { status: 409 });
      }
      if (outcome === "unknown") {
        // Fail CLOSED. The row still points at `previousIntentId`, so the payer's retry re-enters this
        // same release (and derives the same idempotency key) — nothing is orphaned and nothing is
        // double-authorized. Minting here is the one move that loses the hold for good.
        console.error("[create-share-intent] could not establish the replaced intent's state", {
          cartId,
          shareId: share.id,
          paymentIntent: previousIntentId,
        });
        return NextResponse.json(
          { error: "Couldn’t reach the payment provider — try again in a moment." },
          { status: 503 },
        );
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
      // Share + amount + the intent being REPLACED: a tip change mints a fresh PI, a retry after a
      // decline mints a fresh PI, and an identical re-submit (double tap, which reads the same
      // `previousIntentId` because neither request has claimed the row yet) returns the same PI rather
      // than a duplicate authorization. See lib/split-intent-key.ts for why the third term exists.
      { idempotencyKey: shareIntentKey(share.id, amount, previousIntentId) },
    );

    // Claim the row atomically: only overwrite it if it's STILL pre-authorization (pending/failed/canceled)
    // AND still points at the PI we read. Guards a TOCTOU where the amount_capturable_updated webhook
    // authorized+captured this share (via captureAllIfReady) between our status read above and this write —
    // without the predicate, this update would flip the CAPTURED row back to 'pending' pointing at the new
    // PI, orphaning the captured charge (no ledger) and letting the seat pay twice when the new PI clears.
    //
    // ⚠️ W10d pre-merge review — count the affected rows via `{ count: "exact" }`, NEVER `.select()`.
    // The `.or()` below is new in this slice, and a mutation carrying a top-level `or()` logic-tree
    // AND `.select()` (which asks PostgREST for `Prefer: return=representation`) is the exact shape
    // that took production checkout down on 2026-07-08: PostgREST 14 re-applies the or-tree against
    // the RETURNING projection, the filtered column falls out of scope, and the whole UPDATE 400s with
    // 42703 (undefined_column). Being in the SET list does not save it. That would have made `updErr`
    // truthy on EVERY share mint — a 500 whose retry derives the same key and 500s again, i.e. M39
    // shipped inert. `lib/lock.ts` carries the same rule for the same reason.
    let claim = db
      .from("qr_cart_shares")
      .update(
        {
          amount_cents: amount,
          tip_cents: tip,
          tip_rate: tipRate,
          stripe_payment_intent_id: intent.id,
          status: "pending",
          updated_at: new Date().toISOString(),
        },
        { count: "exact" },
      )
      .eq("id", share.id)
      .in("status", ["pending", "failed", "canceled"]);
    // Accept the row either still pointing at the intent we replaced, or ALREADY pointing at the one we
    // just minted — the second case is a concurrent double-tap whose twin won the claim with the SAME
    // idempotent intent. Without it the loser fell into the `!claimed` arm below and cancelled the very
    // PaymentIntent the winner had just handed the payer (W10d, alongside M39).
    claim = previousIntentId
      ? claim.or(
          `stripe_payment_intent_id.eq.${previousIntentId},stripe_payment_intent_id.eq.${intent.id}`,
        )
      : claim.or(`stripe_payment_intent_id.is.null,stripe_payment_intent_id.eq.${intent.id}`);
    const { count, error: updErr } = await claim;
    const claimed = (count ?? 0) > 0;
    // ⚠️ W10d (M39, pre-PR review) — these two failures are NOT the same and must not share a cancel.
    //
    // A concurrent webhook advancing the share (authorized/captured) is TERMINAL: the intent we just
    // minted can never be used, so cancel it or it lingers as a stray authorization.
    //
    // A failed WRITE is retryable, and cancelling there re-creates the very dead end M39 is about. The
    // row still points at `previousIntentId`, so the payer's next attempt derives the SAME idempotency
    // key — and Stripe replays this intent. Cancel it here and that replay hands back a canceled client
    // secret, exactly as the old `share_<id>_<amount>` key did. Leaving it alive means the retry
    // replays a usable intent and simply re-attempts the claim, which is the behaviour we want.
    if (updErr) {
      console.error("[create-share-intent] share claim write failed — leaving the intent live", {
        shareId: share.id,
        paymentIntent: intent.id,
        error: updErr.message,
      });
      return NextResponse.json({ error: "Could not start your payment" }, { status: 500 });
    }
    if (!claimed) {
      // ⚠️ W10d pre-merge review — READ the row before telling the payer what happened. "Your share was
      // just settled" was asserted from a lost claim alone, and a lost claim has a second, likelier
      // cause: two tip taps ~1s apart mint two intents at DIFFERENT amounts (so different idempotency
      // keys), the first repoints the row, and the second — the one the client is actually listening to
      // — matches nothing. The payer was then told their `pending` share was settled and to refresh,
      // which discarded the tip they had just chosen. Say only what the row supports.
      const { data: now, error: nowErr } = await db
        .from("qr_cart_shares")
        .select("status,stripe_payment_intent_id")
        .eq("id", share.id)
        .maybeSingle();
      // ⚠️ W10d pre-merge RE-REVIEW — do NOT cancel an intent the row now POINTS AT. Two same-key
      // requests receive the SAME PaymentIntent back from Stripe (that is the point of the key). If the
      // twin claimed the row and the payer has since authorized on it, `intent.id` is the row's live
      // authorization — cancelling it voided the payer's own hold, `onShareCanceled` flipped the row,
      // and the all-authorized gate could never pass while siblings sat captured. The re-read is what
      // tells the two cases apart, so it has to fetch the pointer, not just the status.
      // ⚠️ W10d round-3 review — an UNREADABLE re-read must not pick the destructive branch. When
      // `nowErr` is set, `now` is null and a bare pointer comparison reads as "not ours" — cancelling
      // an intent that may be the payer's live authorization. Not knowing means not cancelling: an
      // authorize-only PI we walk away from lapses on its own, and the retry re-reads.
      const stillOurs = nowErr != null || now?.stripe_payment_intent_id === intent.id;
      if (!stillOurs) {
        // Our own intent can never be used now — release it before answering. It is seconds old and
        // holds nothing yet, so a failure is log-only; but it is still a PI we are walking away from,
        // so it goes through the same classifier rather than a bare catch.
        const released = await releaseHold(intent.id);
        if (released === "unknown" || released === "captured")
          console.error("[create-share-intent] could not release the unclaimed intent", {
            cartId,
            shareId: share.id,
            paymentIntent: intent.id,
            outcome: released,
          });
      }
      if (nowErr)
        return NextResponse.json(
          { error: "Couldn’t start your payment — please try again." },
          { status: 503 },
        );
      if (!now)
        return NextResponse.json({ error: "This table’s split was cancelled." }, { status: 409 });
      if (now.status === "captured")
        return NextResponse.json({ error: "You’ve already paid your share." }, { status: 409 });
      if (now.status === "authorized")
        return NextResponse.json(
          { error: "Your share is already authorized — ask the host to cancel to change it." },
          { status: 409 },
        );
      // Still pre-authorization: a concurrent attempt for this same share won the claim. A retry
      // re-reads the row, derives a key from the intent that actually won, and mints cleanly.
      return NextResponse.json(
        { error: "Your share changed while we were setting up — try again." },
        { status: 409 },
      );
    }

    // W1·Q4: payer activity — slide the settlement freeze forward (extend-only while still fresh;
    // `settling` was just verified above, so this keeps a slow table alive without ever reviving an
    // aborted or taken-over settlement). Without it, a table that takes >TTL to enter cards
    // dead-ends: captures refused, holds authorized ~7 days.
    await extendSettlement(cartId);

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
