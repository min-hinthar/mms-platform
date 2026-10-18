import { NextRequest, NextResponse, after } from "next/server";
import { getStripe, resolvedStripeMode } from "@/lib/stripe";
import { serviceClient } from "@mms/db/server";
import { releaseByIntent, releaseSettlementFor } from "@/lib/lock";
import { settleReleaseOwner } from "@/lib/settle-release-scope";
import { logTabEvent } from "@/lib/tab-events";
import { getPostHogClient } from "@/lib/posthog-server";
import {
  classifyRejection,
  describeUnverifiedEvent,
  signatureTimestamp,
} from "@/lib/webhook-signature-failure";
import {
  webhookSecretDiagnostic,
  pickEnv,
  webhookCandidatesForMode,
  type EnvCandidate,
} from "@/lib/stripe-env";
import { enqueueQboSync, syncOrderToQbo } from "@/lib/qbo/client";
import { settleAuthorizedPickup } from "@/lib/manual-capture-run";
import { fulfillSucceededIntent, type FulfillIntentOutcome } from "@/lib/fulfill-intent";
import {
  onShareAuthorized,
  onShareCaptured,
  onShareFailed,
  onShareCanceled,
} from "@/lib/split-settle";

// Fulfillment is webhook-driven, signature-verified, idempotent (QA checklist).
// Stripe retries non-200s for up to 72h, so this must be safe to run more than once.
//
// verify:slice-exempt — this route is GLUE over pinned halves: the money law lives in SQL
// (mms_fulfill_order's exact sum check + the tender CHECK, exercised on a real stack by CI's
// migrations job) and the PI contract lives in the lib suites (lib/terminal.test.ts pins the
// metadata kind/cartId/tipRate shape the terminal arm keys on; split-settle.test.ts pins the share
// arms). A route-level mutant would need constructEvent + every DB read mocked into scripted
// answers — the degenerate-fixture class the mutant harness exists to avoid.
/**
 * Every name the webhook signing secret may live under, most specific first — `_TEST` wins, the same
 * rule the secret and publishable keys follow (`stripe-env.ts` carries the reasoning and the cutover
 * warning). The literal reads stay here rather than in `stripe-env.ts` so no secret's variable name
 * sits in a module a client component may import.
 *
 * ⚠️ A signing secret carries no mode marker of its own (`whsec_…` is the same shape in test and
 * live), so nothing in THIS file can tell which mode it belongs to. That is why the mode check lives
 * in `getStripe()`, where the two keys that DO announce their mode can be compared.
 */
function webhookSecretCandidates(): readonly EnvCandidate[] {
  return [
    ["STRIPE_WEBHOOK_SECRET_TEST", process.env.STRIPE_WEBHOOK_SECRET_TEST],
    ["STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET],
  ];
}

/**
 * The 500 bodies the inline arm answered, one per step that can fail before an order is written —
 * kept verbatim so a log search for "will retry" finds the same strings it always did. Stripe reads
 * only the status; these are for the operator.
 */
const WEBHOOK_RETRY_BODY: Record<Extract<FulfillIntentOutcome, { kind: "retry" }>["step"], string> =
  {
    order_lookup: "Order lookup failed; will retry",
    cart_lookup: "Cart lookup failed; will retry",
    totals: "Totals lookup failed; will retry",
    fulfill: "Fulfillment failed; will retry",
  };

export async function POST(req: NextRequest) {
  // Bound to the mode the API keys resolved to, NOT to unconditional `_TEST` precedence: a
  // `STRIPE_WEBHOOK_SECRET_TEST` left behind at the live cutover would otherwise be chosen while
  // `getStripe()` sees an agreeing live pair and raises nothing — real charges, unverifiable
  // deliveries, no orders. `webhookCandidatesForMode` carries the full reasoning.
  const stripeMode = resolvedStripeMode();
  // The RAW list, kept in its own binding: selection uses the mode-filtered view below, but the
  // failure diagnostic must see everything that was looked at — including the `_TEST` name the
  // filter drops. Codex round 2 on #274: passing the filtered list to the diagnostic reports only
  // STRIPE_WEBHOOK_SECRET during the live cutover, hiding the populated leftover that caused the
  // 500 and prolonging the outage. `webhookSecretDiagnostic` carries the reasoning.
  const secretCandidates = webhookSecretCandidates();
  const eligibleSecrets = webhookCandidatesForMode(stripeMode, secretCandidates);
  const webhookSecret = pickEnv(eligibleSecrets)?.value;
  if (!webhookSecret) {
    // Config error, not a bad request: 500 so Stripe redelivers once the secret is wired (vs. the
    // old `!`, which fed `undefined` to constructEvent and masqueraded as a 400 "Bad signature").
    const reason = webhookSecretDiagnostic(stripeMode, secretCandidates);
    console.error(`[stripe webhook] ${reason}`);
    // Same series, same stage as the `getStripe()` config failure below. Codex round 3 on #274:
    // this branch returned without touching the counter, so the ONE outage the mode filter exists
    // to produce — live API keys with only a `_TEST` signing secret left — would leave
    // `stripe_webhook_delivery_rejected` flat while a different config fault was counted. A
    // dashboard that stays quiet through the outage it was built for is worse than no dashboard.
    // The reason carries variable NAMES and set-ness only; `webhookSecretDiagnostic` never emits a
    // value, asserted by its own test.
    recordRejection({ stage: "config_error", reason });
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    // M160(a), blind-pass CRITICAL 2 — this branch answers 400 on the SAME failure path as the
    // signature catch below, and the first draft left it silent while claiming the catch was "the
    // only such branch". It is not: a proxy or CDN that strips the header, or a misrouted endpoint,
    // reproduces the C18 outage exactly (every delivery 400, no order written) with nothing in the
    // error view and nothing in the counter, because the counter below is only reached once a
    // header exists. Both rejections are recorded, under one event name with a `stage` discriminator
    // so a dashboard reads them as one series.
    console.error("[stripe webhook] DELIVERY REJECTED — no stripe-signature header", {
      stage: "missing_header",
    });
    recordRejection({ stage: "missing_header", reason: "missing stripe-signature header" });
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }
  const body = await req.text();
  // ⚠️ `getStripe()` is evaluated HERE, deliberately outside the try below.
  //
  // It throws on two CONFIG faults — an unresolvable secret key, and (added by this PR) a
  // live/test disagreement between the secret and publishable keys — while the catch below exists
  // for exactly one thing: a signature that did not verify. Leaving the call inside it filed a
  // credential misconfiguration under `stage: "bad_signature"` and answered Stripe 400
  // "Bad signature" with `constructEvent` NEVER CALLED. The operator would be sent hunting for a
  // signing-secret mismatch while the real fault is the key pair, and a 400 tells Stripe the
  // delivery can never succeed — so a mode mismatch would burn the whole retry budget being
  // reported as an attack. That is the same masquerade the missing-secret branch above was written
  // to end, re-entering through a different door. Found independently by two lenses of the blind
  // pre-merge audit on #274.
  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    const reason = (e as Error).message;
    console.error("[stripe webhook] DELIVERY REJECTED — Stripe client unavailable", {
      stage: "config_error",
      reason,
    });
    recordRejection({ stage: "config_error", reason });
    // 500, matching the missing-signing-secret branch above: the fault is ours, and Stripe should
    // redeliver once it is corrected rather than be told the payload was bad.
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    // M160(a) — the branch C18's 2026-09-07 failures were attributed to, and it said nothing. A 400
    // return is not an error log, so five test-card payments wrote zero orders while Vercel's error
    // view stayed empty. (What CAUSED those failures was never measured — C18 closed by measuring
    // that every succeeded payment since 2026-09-09 has its order, OWNER_RULINGS_2026-10-07 "C18 —
    // closed" — so this note no longer states a mechanism as fact.) The failure that costs the
    // most is now the loudest, and M160(b)'s recovery (`lib/payment-recovery.ts`) is the way home
    // for a paid cart whose delivery never lands.
    //
    // ⚠️ `describeUnverifiedEvent` reads a body whose signature just FAILED — attacker-controlled.
    // Its output is for this log line and the counter only; it never reaches a decision, a write,
    // or a Stripe call. The `unverified*` names carry that. The `v1=` digests are never logged.
    const reason = (e as Error).message;
    const { unverifiedId, unverifiedType } = describeUnverifiedEvent(body);
    // Bytes, not UTF-16 code units: this app is bilingual and the kiosk takes free-text names, so
    // `.length` under-reports a Burmese payload by up to ~3× — and an operator diffing it against
    // Stripe's own payload size would read that gap as a body rewritten in transit, which is one of
    // the exact suspicions C18 had to rule out.
    const bodyBytes = Buffer.byteLength(body, "utf8");
    console.error("[stripe webhook] SIGNATURE VERIFICATION FAILED — delivery rejected", {
      stage: "bad_signature",
      reason,
      signatureTimestamp: signatureTimestamp(sig),
      unverifiedEventId: unverifiedId,
      unverifiedEventType: unverifiedType,
      bodyBytes,
    });
    recordRejection({
      stage: "bad_signature",
      reason,
      unverifiedType,
      signatureTimestamp: signatureTimestamp(sig),
      bodyBytes,
    });
    // The full `reason` is in the log above. The RESPONSE stays generic: this route is public and
    // unauthenticated, and the SDK message can carry the whitespace note about our own signing
    // secret. Stripe reads the status code, never the body.
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
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
          // ⚠️ P5 — this `payment_succeeded` deliberately carries NO `promo_code` (and no
          // `promo_cents`), unlike the single/terminal branch below. Two reasons, and neither is an
          // oversight to tidy up later: this arm has no cart row in hand, and `mms_fulfill_split_order`
          // consumes NO promo redemption at all, so a split settle is genuinely absent from the
          // campaign ledger too. Emitting `promo_code: null` here would assert "this order used no
          // code", which is not something this handler knows. `split: true` is the discriminator — a
          // campaign funnel must filter on it rather than read an absent property as a null.
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
            // Fire-at-checkout (S4.2): the split is fully settled (cart paid) → fire any still-draft FOOD
            // so the kitchen makes it ("no charge-with-no-fire"). Drained, idempotent, dine-in/food-gated.
            // S4-audit P1-2: independent side-effects — a throw on one must not starve the others; the
            // pg_cron reconciler is the durable backstop if after() never runs.
            after(async () => {
              try {
                const { error: fireErr } = await db.rpc("mms_fire_pending_food", {
                  p_cart_id: splitCartId,
                });
                if (fireErr)
                  console.error("[stripe webhook] split fire-at-checkout failed", {
                    cartId: splitCartId,
                    error: fireErr,
                  });
              } catch (e) {
                console.error("[stripe webhook] split fire-at-checkout threw", {
                  cartId: splitCartId,
                  error: e,
                });
              }
              // To-go fulfillment loop (S4.3a): flag 'preparing' if the split order has a takeaway line.
              try {
                const { error: togoErr } = await db.rpc("mms_init_togo_status", {
                  p_order: orderId,
                  p_cart: splitCartId,
                });
                if (togoErr)
                  console.error("[stripe webhook] split init togo_status failed", {
                    cartId: splitCartId,
                    error: togoErr,
                  });
              } catch (e) {
                console.error("[stripe webhook] split init togo_status threw", {
                  cartId: splitCartId,
                  error: e,
                });
              }
              // Split-tender SEAM (S4.3c): eligibility-at-sale on the split order's grocery lines.
              try {
                const { error: ebtErr } = await db.rpc("mms_snapshot_ebt_eligibility", {
                  p_order: orderId,
                });
                if (ebtErr)
                  console.error("[stripe webhook] split snapshot ebt eligibility failed", {
                    cartId: splitCartId,
                    error: ebtErr,
                  });
              } catch (e) {
                console.error("[stripe webhook] split snapshot ebt eligibility threw", {
                  cartId: splitCartId,
                  error: e,
                });
              }
            });
            // Redeem any applied reward (M4 P4.2) — single-use, exactly-once on the open→paid transition.
            const { error: redErr } = await db.rpc("mms_redeem_cart_reward", {
              p_cart: splitCartId,
              p_order: orderId,
            });
            if (redErr)
              console.error("[stripe webhook] split reward redeem failed", {
                orderId,
                error: redErr,
              });
            // ⚠️ THE THREE READS BELOW BIND THEIR ERRORS, and the reason they LOG rather than 500 is
            // worth stating: this block runs only on the open→paid transition (`onShareCaptured`
            // returns an orderId exactly once). A 500 makes Stripe redeliver, but the redelivery
            // finds the cart already paid, `onShareCaptured` answers null, and the block is skipped
            // — so failing loudly could not recover the Star; it would only be theatre that also
            // re-runs the arms above.
            //
            // What was actually wrong was silence: an unbound `{ error }` made a DROPPED READ
            // indistinguishable from "no tab / no host / no total", so one blip permanently cost the
            // host their Star and `earned_by` (which also removes the order from
            // `mms_rewards_summary`'s lifetime spend and milestone counts) with nothing in the log
            // naming it. That is the W10c rule — a failure must never read as empty — and the fix
            // here is to make the loss LOUD and hand-recoverable, keyed by orderId.
            const { data: closedCart, error: closedCartErr } = await db
              .from("qr_carts")
              .select("tab_type,session_id")
              .eq("id", splitCartId)
              .maybeSingle();
            if (closedCartErr)
              console.error(
                "[stripe webhook] SPLIT POST-FULFILL READ FAILED — host Star and tab-close audit skipped for this order; backfill by hand",
                { orderId, cartId: splitCartId, error: closedCartErr },
              );
            // Split-earn (M4 P4.2): a split order earns ONE Star for the HOST-of-record (the order count
            // model — one order = one Star; net spend credited to the table's organizer, parity with the
            // S3 host-of-record). Per-share attribution is a future refinement (needs a per-payer earn
            // ledger). Resolve the host uid from the session, stamp earned_by, award. Exactly-once (this
            // block only runs on the open→paid transition); best-effort — never fail the money ack.
            if (closedCart?.session_id) {
              const { data: sess, error: sessErr } = await db
                .from("table_sessions")
                .select("host_seat")
                .eq("id", closedCart.session_id)
                .maybeSingle();
              if (sessErr)
                console.error(
                  "[stripe webhook] SPLIT HOST READ FAILED — no Star awarded and earned_by unstamped for this order; backfill by hand",
                  { orderId, sessionId: closedCart.session_id, error: sessErr },
                );
              const hostUid = sess?.host_seat ?? null;
              if (hostUid) {
                // K3b: redirect-aware earn — one RPC stamps earned_by (resolved through any identity merge)
                // and awards. A split payment that lands after the host merged their anon device still
                // credits the signed-in account, never the orphaned anon uid.
                const { error: earnErr } = await db.rpc("mms_earn_on_fulfill", {
                  p_order: orderId,
                  p_earner: hostUid,
                });
                if (earnErr)
                  console.error("[stripe webhook] split rewards earn failed", {
                    orderId,
                    error: earnErr,
                  });
              }
            }
            if (closedCart?.tab_type && closedCart.tab_type !== "none") {
              const { data: ord, error: ordErr } = await db
                .from("qr_orders")
                .select("total_cents")
                .eq("id", orderId)
                .maybeSingle();
              // A null amount on a tab-close audit row is not a neutral gap: the row reads as an
              // authoritative record of the close, and an operator auditing tabs cannot tell an
              // unreadable total from a genuinely absent one. Say which it was.
              if (ordErr)
                console.error(
                  "[stripe webhook] SPLIT ORDER TOTAL READ FAILED — tab-close audit records a null amount for this order",
                  { orderId, error: ordErr },
                );
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
      // M160(b) — the generic single-pay / Terminal / secure-tab arm now lives in
      // `lib/fulfill-intent.ts`, MOVED unchanged, because the stranded-payment recovery must run
      // the SAME fulfillment rather than a second copy of it. This route only maps the outcome to
      // the status Stripe reads, exactly as the inline arm answered: 5xx to redeliver, 409 for a
      // reconcile mismatch (Stripe keeps trying; the refund-needed row is already written), and
      // 200 for everything a retry cannot change.
      const outcome = await fulfillSucceededIntent(intent, "webhook");
      switch (outcome.kind) {
        case "retry":
          return NextResponse.json({ error: WEBHOOK_RETRY_BODY[outcome.step] }, { status: 500 });
        case "amount_mismatch":
          return NextResponse.json(
            {
              error: `amount mismatch: cart=${outcome.cartCents} captured=${outcome.capturedCents}`,
            },
            { status: 409 }, // non-2xx → Stripe retries; surfaces a tampered/stale cart
          );
        case "settled_elsewhere":
          return NextResponse.json({ received: true, skipped: "cart already settled" });
        case "fulfilled":
        case "already_recorded":
        case "no_cart_metadata":
          break;
      }
    }
  } else if (event.type === "payment_intent.amount_capturable_updated") {
    // Split-tender: a share authorized (manual-capture confirmed). Mark it; capture-all once the whole
    // table is authorized. (An automatic-capture single-pay PI never fires this event; W23c's pickup
    // holds do, and are handled in the arm below.)
    const intent = event.data.object;
    if (intent.metadata?.kind === "pickup_manual") {
      // W23c (registry M69) — a pickup order is AUTHORIZED, not charged. This is the last look at
      // the live catalog before any money moves, and the window W23a's pre-mint gate could not
      // reach: the diner spent the minute after it entering a card number.
      //
      // Nothing is fulfilled here. Capturing makes Stripe fire `payment_intent.succeeded`, and that
      // is what creates the order — through the same handler and the same mms_fulfill_order as every
      // other payment. So an order is only ever born already captured, and no surface that reads
      // `status` has to learn a fourth state.
      const cartId = intent.metadata?.cartId;
      const tipRate = Number(intent.metadata?.tipRate ?? 0);
      if (!cartId) {
        // Unrecoverable and unretryable: without the cart there is nothing to re-derive. Cancel the
        // hold so the diner is not left with a week-long pending charge for an order that cannot
        // exist, and don't 5xx into 72h of retries that cannot succeed.
        console.error("[stripe webhook] authorized pickup intent missing cartId metadata", {
          paymentIntent: intent.id,
        });
        // W23d (Codex #205 round 2) — RECORD IT, and record it FIRST, the same rule the settlement
        // path follows: a failed cancel is retryable, a lost verdict is not. Without this the diner
        // is stranded hardest of all — /track still carries `?cart=` from the return_url, so it
        // classifies the checkout as manual capture and polls indefinitely saying the card is
        // authorized, while Stripe has already released the hold and no code path will ever say so.
        // The cart is null (there isn't one) and the reason is `no_cart`; the read is keyed on the
        // intent and the payer, so neither costs the diner their answer.
        await recordCartlessCancellation(intent.id, intent.metadata?.earnerUid ?? null);
        try {
          await getStripe().paymentIntents.cancel(intent.id);
        } catch (e) {
          console.error("[stripe webhook] cancel of cartId-less hold failed", {
            paymentIntent: intent.id,
            error: e,
          });
        }
      } else {
        let outcome;
        try {
          outcome = await settleAuthorizedPickup(
            intent.id,
            cartId,
            intent.amount,
            tipRate,
            // The payer who acquired the pay lock at mint time. The precheck refuses if the cart's
            // `locked_by` has moved on — a stale lock taken over by another payer must not let this
            // authorization void lines under their live settlement.
            intent.metadata?.earnerUid ?? "",
            // The lock era this hold was minted under; a superseded attempt is refused.
            intent.metadata?.attempt ?? "",
          );
        } catch (e) {
          console.error("[stripe webhook] manual capture threw", {
            paymentIntent: intent.id,
            cartId,
            error: e,
          });
          return NextResponse.json({ error: "Capture failed; will retry" }, { status: 500 });
        }
        if (outcome.kind === "retry")
          return NextResponse.json(
            { error: `Capture deferred: ${outcome.note}` },
            { status: 500 }, // Stripe redelivers; the hold stands untouched meanwhile
          );
        getPostHogClient().capture({
          distinctId: cartId,
          event: "pickup_hold_settled",
          properties: {
            cart_id: cartId,
            outcome: outcome.kind,
            ...(outcome.kind === "captured" && {
              amount_cents: outcome.amountCents,
              partial: outcome.partial,
              dropped: outcome.dropped.length,
            }),
          },
        });
      }
    } else if (intent.metadata?.kind === "split_share") {
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
      // W10c (M31): 5xx instead of logging-and-ACKing — swallowing it left the board showing a declined
      // payer as still pending and the host waiting on money that was never coming. What makes the
      // retry safe is that `onShareFailed` re-reads the PaymentIntent and skips the mark unless Stripe
      // itself says there is no live authorization — see the ⚠️ in split-settle.ts, where BOTH failure
      // modes (an unguarded write downgrading a captured share, and an over-tight predicate erasing a
      // real authorized→failed decline) are written up.
      try {
        await onShareFailed(intent.id);
      } catch (e) {
        console.error("[stripe webhook] onShareFailed failed", {
          paymentIntent: intent.id,
          error: e,
        });
        return NextResponse.json(
          { error: "Share-failed mark failed; will retry" },
          { status: 500 },
        );
      }
    } else if (intent.metadata?.kind === "terminal" && cartId && intent.metadata?.settleAttempt) {
      // W6c: a reader decline. The POLL already released this attempt's freeze the moment it
      // observed the decline (terminalStatus's failed branch) — this arm is the scoped backstop
      // for a register tab that closed mid-collect and stopped polling. Scoped to the attempt in
      // the PI's metadata, so a late/redelivered event can never null a successor attempt's live
      // freeze (the generic branch below is unconditional-by-cart — the exact era hazard the W6c
      // review confirmed HIGH for reader flows, where cancel→retry cycles are routine).
      try {
        const { error: settleErr } = await releaseSettlementFor(
          cartId,
          intent.metadata.settleAttempt,
        );
        if (settleErr)
          console.error("[stripe webhook] terminal decline release failed", {
            cartId,
            paymentIntent: intent.id,
            message: settleErr.message,
          });
      } catch (e) {
        console.error("[stripe webhook] terminal decline release threw", {
          cartId,
          paymentIntent: intent.id,
          error: e,
        });
      }
    } else if (cartId) {
      // Single-pay. ⚠️ THE PAY-WINDOW LOCK IS DELIBERATELY NOT RELEASED HERE ANY MORE (M152 c′ —
      // blind adversarial pass on #257, CRITICAL 2). This arm used to call
      // `releaseCartLock(cartId, null)` — cart-wide — so a decline handed the table its cart back.
      // But a decline is not the end of the attempt (the M70 paragraph below): the SAME
      // PaymentIntent stays confirmable from the still-mounted Element at its original amount, and
      // now `live_payment_intent_id` says so. Unlocking the cart under that intent was the M151
      // overlap through the decline door — lines edited, the same intent re-confirmed, fulfilment's
      // sum re-check failing on a charged card — and, once the link existed, it also left a link
      // with no lock: every promo at the table refused as "locked" on a cart everyone could edit,
      // with nothing but the next create-intent able to clear it. The cart a live intent prices
      // stays frozen until the diner ENDS the attempt ("Edit order" cancels it at Stripe and
      // releases lock, pin and link together — `releasePayAttemptSafely`) or the 5-minute TTL
      // lets a successor supersede it. The one cost is a diner who lost the attempt token (a 3DS
      // decline returns through a full redirect) waiting for the TTL before editing; Pay stays
      // live for them throughout, because `acquireCartLock` re-admits the same seat.
      //
      // What IS released is the SETTLE freeze: a secure-tab off-session close (S3.2) holds
      // `settle_at` (not the single-pay lock), nobody has an Element mounted for that intent, and
      // an async processing→failed decline would otherwise strand the table frozen for the full
      // SETTLE_TTL.
      //
      // ⚠️ THE "NO EQUIVALENT PREDICATE AVAILABLE HERE" CLAIM IS RETRACTED (Codex round 8 on #275,
      // P1). This used to release UNCONDITIONALLY by cart and call that a decision: a late retry
      // could clear a live `settle_at` and unfreeze a settlement the table had since opened, with
      // the 10-minute TTL named as the backstop. The hazard was real and it was not only redelivery
      // — the ORDINARY case reached it. A diner single-pay decline is neither `split_share` nor
      // `terminal`, so every one of them landed here and nulled whatever freeze the row carried,
      // including one a staff settle was actively relying on. `closeSecureTab` names the freeze,
      // not its idempotency key, as its concurrent double-charge guard.
      //
      // A predicate DOES exist: `closeSecureTab` already stamps `closedBy: "staff"`, and the freeze
      // owner — `settleAttempt`, a per-request uuid since A3 (the intent previously carried only
      // `closedByStaffId`, which is attribution, and between #275 and A3 the shared staff uid). So
      // this arm releases exactly the owner the event belongs to, or nothing at all. A diner intent
      // releases NOTHING, which is correct: it never held this mutex. That makes this arm consistent
      // with the Terminal arm above, which has always used `releaseSettlementFor`.
      //
      // Still best-effort and still logged: an outage here must not be invisible, and an intent from
      // an older deploy (no `settleAttempt`) resolves to `null` and heals on the TTL as before.
      //
      // ⚠️ Pre-merge review — the try/catch is what KEEPS the 200 the paragraph above argues for.
      // Dropping the old `.catch(() => {})` when these started returning their error left a throw
      // (a `serviceClient()` construction failure, say) free to escape into the handler's outer
      // catch and 500 — quietly re-opening the redelivery hazard the comment says must not exist.
      try {
        // ⚠️ THE PROMO PIN IS DELIBERATELY NOT RELEASED HERE (M70 · Codex round 2 on #240).
        //
        // A decline is not the end of the attempt. `PaymentSection.confirm()` keeps the same
        // Elements and clientSecret mounted and hands the diner back a live Pay button, so the SAME
        // PaymentIntent is retried at its original, grant-inclusive amount. Clearing the pin on the
        // way past would mean a successful retry captures a discount fulfillment can no longer
        // re-derive — a charged guest and no order, on a path that works today precisely BECAUSE
        // the pin outlives the decline.
        //
        // The stale-grant hole this arm looked like the place to fix (an editable cart still
        // carrying an authorized discount) is closed in `create-intent` instead, where the next
        // attempt releases the previous pin under the era it just acquired and re-derives the grant
        // from the basket as it now stands. That is the only point where "this discount is stale"
        // is knowable: here we would be guessing from `intent.metadata.attempt`, which a reused
        // automatic-capture idempotency key can leave naming an era the cart no longer has.
        const settleOwner = settleReleaseOwner(intent.metadata);
        if (settleOwner) {
          const { error: settleErr } = await releaseSettlementFor(cartId, settleOwner);
          if (settleErr)
            console.error("[stripe webhook] payment_failed settle release failed", {
              cartId,
              paymentIntent: intent.id,
              settleError: settleErr.message,
            });
        }
      } catch (e) {
        console.error("[stripe webhook] payment_failed release threw", {
          cartId,
          paymentIntent: intent.id,
          error: e,
        });
      }
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
      // W10c (M31): 5xx rather than swallow — an unrecorded cancellation leaves a released hold showing
      // as live on the board, so the table believes it is still covered by money that is gone. The mark
      // never overwrites a captured share, so a redelivery is safe.
      try {
        await onShareCanceled(intent.id);
      } catch (e) {
        console.error("[stripe webhook] onShareCanceled failed", {
          paymentIntent: intent.id,
          error: e,
        });
        return NextResponse.json(
          { error: "Share-canceled mark failed; will retry" },
          { status: 500 },
        );
      }
    } else if (
      intent.metadata?.kind === "terminal" &&
      intent.metadata?.cartId &&
      intent.metadata?.settleAttempt
    ) {
      // W6c: a canceled reader PI. The staff cancel already released synchronously — but this
      // event's FIRST delivery still arrives seconds later, after a routine cancel→retry has
      // re-acquired the freeze for a NEW attempt (the review's confirmed HIGH). So the release is
      // SCOPED to the attempt in the PI's own metadata: a late delivery matches zero rows against
      // a successor's freeze, while genuinely-orphaned attempts (a closed register tab, a failed
      // in-action release) still get cleaned. Best-effort, 200-ack; the TTL remains the backstop.
      try {
        const { error: settleErr } = await releaseSettlementFor(
          intent.metadata.cartId,
          intent.metadata.settleAttempt,
        );
        if (settleErr)
          console.error("[stripe webhook] terminal cancel release failed", {
            cartId: intent.metadata.cartId,
            paymentIntent: intent.id,
            message: settleErr.message,
          });
      } catch (e) {
        console.error("[stripe webhook] terminal cancel release threw", {
          paymentIntent: intent.id,
          error: e,
        });
      }
    } else if (intent.metadata?.cartId) {
      // M151 — a SINGLE-PAY intent (auto-capture, or a `pickup_manual` hold) is terminal. Clear the
      // pin and the link in ONE statement keyed on the intent id, so a late delivery can never reach
      // a successor's link. ⚠️ NOT the lock: this event can land between a successor's Stripe
      // cancel and its unlink, while the row still names the predecessor but the LOCK is already
      // the successor's — see `releaseByIntent`'s docblock. The lock is left to its holder and the
      // TTL. Zero rows is the ordinary case (the successor or the capture cron already cleared it)
      // — best-effort, 200-ack.
      try {
        const { error: relErr } = await releaseByIntent(intent.metadata.cartId, intent.id);
        if (relErr)
          console.error("[stripe webhook] canceled intent release failed", {
            cartId: intent.metadata.cartId,
            paymentIntent: intent.id,
            message: relErr.message,
          });
      } catch (e) {
        console.error("[stripe webhook] canceled intent release threw", {
          paymentIntent: intent.id,
          error: e,
        });
      }
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
  } else if (event.type === "charge.refunded") {
    // S4.3b: a refund settled — our in-app per-line refund (recorded by refundLine) OR a refund issued from
    // the Stripe dashboard. Stripe-AUTHORITATIVE status reconcile: flip qr_orders.status='refunded' once
    // amount_refunded >= total_cents. Idempotent (only from 'paid'); a PI we don't own — incl. split orders,
    // whose shares carry their own PIs — returns 'no_order' (a no-op). This is the state M4 refund-recede
    // consumes (the rewards summary counts only status='paid', so a full refund recedes the Star).
    const charge = event.data.object;
    const pi =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : (charge.payment_intent?.id ?? null);
    if (pi) {
      const db = serviceClient();
      // Backstop-record each of OUR line refunds from the refund metadata (set by refundLine), idempotent
      // on the refund id. This closes the gap where refundLine's ledger write failed AFTER Stripe succeeded
      // (money out, no row): re-records it here, restoring the mms_refunds row + mms_approvals audit, so
      // authorize's already-refunded guard holds (no >24h re-refund). Dashboard refunds carry no orderItemId
      // metadata → status-only. `charge.refunds` is NOT auto-expanded on modern API versions, so FETCH the
      // refund objects explicitly. Best-effort: a list failure leaves a rare orphan logged; status still runs.
      // P1-4 (S4-audit): a list/record failure here is NOT swallowed — it's a lost ledger row while money
      // already moved, and >24h later (Stripe idempotency key expired) a re-refund would double-pay. 5xx so
      // Stripe redelivers within its 72h window; mms_record_refund is idempotent (on conflict do nothing),
      // so re-recording the already-saved rows on redelivery is safe and the missed one finally lands.
      let backstopFailed = false;
      try {
        const refunds = await getStripe().refunds.list({ charge: charge.id, limit: 100 });
        for (const r of refunds.data) {
          const oi = r.metadata?.orderItemId;
          const init = r.metadata?.initiator;
          const rc = r.metadata?.reasonCode;
          if (oi && init && rc) {
            const { error: recErr } = await db.rpc("mms_record_refund", {
              p_order_item: oi,
              p_amount: r.amount,
              p_stripe_refund_id: r.id,
              p_reason: rc,
              p_initiator: init,
            });
            if (recErr) {
              console.error("[stripe webhook] refund ledger backstop failed", {
                refundId: r.id,
                error: recErr,
              });
              backstopFailed = true;
            }
          }
        }
      } catch (e) {
        console.error("[stripe webhook] refund list/backstop failed", {
          chargeId: charge.id,
          error: e,
        });
        backstopFailed = true;
      }
      if (backstopFailed)
        return NextResponse.json({ error: "Refund backstop failed; will retry" }, { status: 500 });
      const { error: reconErr } = await db.rpc("mms_apply_refund_reconcile", {
        p_payment_intent: pi,
        p_amount_refunded: charge.amount_refunded,
      });
      // supabase-js returns the PG error in `error` (no throw); a genuine DB failure must redeliver, not
      // 200-and-vanish (else a full refund never flips status → M4 recede stays stale). 5xx (idempotent RPC).
      if (reconErr) {
        console.error("[stripe webhook] mms_apply_refund_reconcile failed", {
          paymentIntent: pi,
          error: reconErr,
        });
        return NextResponse.json({ error: "Refund reconcile failed; will retry" }, { status: 500 });
      }
      posthog.capture({
        distinctId: pi,
        event: "charge_refunded",
        properties: { amount_refunded: charge.amount_refunded },
      });
    }
  }

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

/**
 * W23d — record a cancellation for an authorization that never had a cart (Codex #205 round 2).
 *
 * The one branch that cancels a `pickup_manual` hold outside `settleAuthorizedPickup`, and so the
 * one that would otherwise leave a released hold with no verdict anywhere. Written BEFORE the Stripe
 * cancel for the same reason the settlement writes its own first: a failed cancel is retryable, a
 * lost verdict is not.
 *
 * Swallows its failure deliberately — unlike the settlement path, there is nothing to retry INTO
 * here. That branch is explicitly unrecoverable (no cart, nothing to re-derive) and must not 5xx
 * into 72h of redeliveries that cannot succeed, so a failed write costs the diner their explanation
 * and nothing more. The `console.error` is what makes the swallow deliberate rather than silent.
 */
async function recordCartlessCancellation(intentId: string, payerUid: string | null) {
  const { error } = await serviceClient().rpc("mms_mark_settle_canceled", {
    p_intent: intentId,
    p_cart: null as unknown as string,
    p_reason: "no_cart",
    p_payer: payerUid as unknown as string,
    p_attempt: null as unknown as string,
  });
  if (error)
    console.error("[stripe webhook] cartless cancellation verdict not recorded", {
      paymentIntent: intentId,
      error: error.message,
    });
}

/**
 * ONE counter for every way a delivery is turned away before it is trusted (M160a).
 *
 * Both rejection branches feed it, discriminated by `stage`, so a dashboard reads them as one
 * series — the first draft counted only the signature branch, which would have shown zero
 * throughout an outage caused by a stripped header.
 *
 * ⚠️ `reason` is NOT passed on. The SDK appends "Note: The provided signing secret contains
 * whitespace…" when our configured secret has stray characters, which is a fact about OUR SECRET;
 * it stays in the server log. Only `classifyRejection`'s stable token crosses to analytics.
 * `unverifiedType` is attacker-controlled and already capped at the module's echo limit.
 */
function recordRejection(input: {
  stage: "missing_header" | "bad_signature" | "config_error";
  reason: string;
  unverifiedType?: string | null;
  signatureTimestamp?: string | null;
  bodyBytes?: number;
}) {
  // ⚠️ EVERY third-party call is inside this try, not just the flush. Every caller is a path whose
  // job is to answer a SPECIFIC status — 400 for the two rejection stages, 500 for `config_error` —
  // and a synchronous throw out of the analytics SDK, or out of `after()` when there is no request
  // scope, would escape before the caller's `return NextResponse.json(…)` and replace that
  // deliberate status with an incidental 500.
  // That is not a cosmetic downgrade. A 400 tells Stripe the delivery can never succeed; a 500
  // tells it to RETRY, so an outage like C18 would have spent its 72-hour retry budget hammering a
  // route that was going to reject every attempt, and reported a signature mismatch as a server
  // fault. The counter is best-effort by definition; the `console.error` beside every call site is
  // the durable record, and it has already run by the time we get here.
  try {
    const posthog = getPostHogClient();
    posthog.capture({
      // No cart and no trustworthy id: key the series on the route so a spike reads as a rate.
      distinctId: "stripe-webhook",
      event: "stripe_webhook_delivery_rejected",
      properties: {
        stage: input.stage,
        reason_class: classifyRejection(input.reason),
        unverified_event_type: input.unverifiedType ?? null,
        signature_timestamp: input.signatureTimestamp ?? null,
        body_bytes: input.bodyBytes ?? null,
      },
    });
    after(async () => {
      try {
        await posthog.flush();
      } catch {
        // An analytics drain failure must never mask the rejection itself.
      }
    });
  } catch (e) {
    console.error("[stripe webhook] rejection counter failed — the 400 is unaffected", {
      stage: input.stage,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
