import { NextRequest, NextResponse, after } from "next/server";
import { getStripe } from "@/lib/stripe";
import { serviceClient } from "@mms/db/server";
import { getCartTotals } from "@/lib/totals";
import { closeCounterStyleSession } from "@/lib/staff-open-cart";
import { releaseCartLock, releaseSettlement, releaseSettlementFor } from "@/lib/lock";
import { logTabEvent } from "@/lib/tab-events";
import { getPostHogClient } from "@/lib/posthog-server";
import { enqueueQboSync, syncOrderToQbo } from "@/lib/qbo/client";
import { settleAuthorizedPickup } from "@/lib/manual-capture-run";
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
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Config error, not a bad request: 500 so Stripe redelivers once the secret is wired (vs. the
    // old `!`, which fed `undefined` to constructEvent and masqueraded as a 400 "Bad signature").
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  const body = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 });
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
            const { data: closedCart } = await db
              .from("qr_carts")
              .select("tab_type,session_id")
              .eq("id", splitCartId)
              .maybeSingle();
            // Split-earn (M4 P4.2): a split order earns ONE Star for the HOST-of-record (the order count
            // model — one order = one Star; net spend credited to the table's organizer, parity with the
            // S3 host-of-record). Per-share attribution is a future refinement (needs a per-payer earn
            // ledger). Resolve the host uid from the session, stamp earned_by, award. Exactly-once (this
            // block only runs on the open→paid transition); best-effort — never fail the money ack.
            if (closedCart?.session_id) {
              const { data: sess } = await db
                .from("table_sessions")
                .select("host_seat")
                .eq("id", closedCart.session_id)
                .maybeSingle();
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
              const { data: ord } = await db
                .from("qr_orders")
                .select("total_cents")
                .eq("id", orderId)
                .maybeSingle();
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
      const cartId = intent.metadata?.cartId;
      const tipRate = Number(intent.metadata?.tipRate ?? 0) || 0;
      // W6c: a register card-present charge (settleCard). Same reconcile + fulfill as every card —
      // the kind only drives tender/attribution and the counter-session close below. (Any kind
      // other than 'split_share' belongs on this generic branch by design.)
      const isTerminal = intent.metadata?.kind === "terminal";
      // idempotent: unique(stripe_payment_intent_id) means a retry is a no-op
      const { data: existing, error: existingError } = await db
        .from("qr_orders")
        .select("id")
        .eq("stripe_payment_intent_id", intent.id)
        .maybeSingle();
      // W10c (M30) — this read IS the idempotency check. An unreadable row used to fall through as
      // "no order yet", so a redelivery during an outage would attempt a SECOND fulfillment for an
      // already-recorded charge. 5xx instead: the unique index is the hard backstop, but we should
      // never knowingly drive at it. maybeSingle() gives {null,null} for a genuine no-row.
      if (existingError) {
        console.error("[stripe webhook] existing-order lookup failed", {
          paymentIntent: intent.id,
          error: existingError.message,
        });
        return NextResponse.json({ error: "Order lookup failed; will retry" }, { status: 500 });
      }
      if (!existing && cartId) {
        // Cross-tender guard (S1.3): if the cart was already settled by ANOTHER tender (a cash settle
        // taken while this PI's pay-lock was stale), this card charge is a double-collection — do NOT
        // record a duplicate order. Ack (200) so Stripe stops retrying, and alert (non-PII) for a manual
        // refund of the orphan charge (S4.3 automates line-level refunds). mms_fulfill_order also raises
        // on a non-open cart as the hard DB backstop; this is the graceful, no-retry-storm path.
        const { data: cartRow, error: cartRowError } = await db
          .from("qr_carts")
          .select("status,tab_type")
          .eq("id", cartId)
          .maybeSingle();
        // W10c (M30) — an unreadable cart silently SKIPPED the cross-tender guard below and proceeded
        // to fulfill, which is how a card charge gets recorded against a cart someone already settled
        // in cash. The guard is only a guard if it fails closed.
        if (cartRowError) {
          console.error("[stripe webhook] cart lookup failed", {
            cartId,
            paymentIntent: intent.id,
            error: cartRowError.message,
          });
          return NextResponse.json({ error: "Cart lookup failed; will retry" }, { status: 500 });
        }
        if (cartRow && cartRow.status !== "open") {
          console.error("[stripe webhook] card PI for an already-settled cart — refund needed", {
            cartId,
            paymentIntent: intent.id,
            cartStatus: cartRow.status,
          });
          // Durable recovery ledger (S1-audit S3): the card was CAPTURED but no order is recorded, so a
          // log alone strands the customer's money. Record it for an operator / S4.3 auto-refund.
          // Idempotent on the PI (the webhook may redeliver); best-effort — never fail the 200 ack on it.
          const { error: refundErr } = await db.from("qr_refunds_needed").upsert(
            {
              payment_intent: intent.id,
              cart_id: cartId,
              // the literally-captured amount (== amount for a single-capture succeeded PI)
              amount_cents: intent.amount_received ?? intent.amount ?? null,
              reason: "card_after_settle",
            },
            { onConflict: "payment_intent", ignoreDuplicates: true },
          );
          if (refundErr)
            console.error("[stripe webhook] failed to record refund-needed", {
              paymentIntent: intent.id,
              message: refundErr.message,
            });
          posthog.capture({
            distinctId: cartId,
            event: "double_tender_card_after_settle",
            properties: { cart_id: cartId, payment_intent: intent.id, cart_status: cartRow.status },
          });
          return NextResponse.json({ received: true, skipped: "cart already settled" });
        }
        // Re-derive the server-authoritative breakdown and reconcile it against the actual charge
        // before fulfilling — the cart could have mutated between intent-create and this webhook.
        // mms_fulfill_order re-checks the sum == intent.amount and snapshots the order (in cents).
        let totals;
        try {
          totals = await getCartTotals(cartId, tipRate);
        } catch (e) {
          // The cart row may be unreadable/deleted between intent-create and delivery. Don't let the
          // bare throw 500 without context — log the cart + PI, then 500 so Stripe retries.
          console.error("[stripe webhook] getCartTotals failed", {
            cartId,
            paymentIntent: intent.id,
            error: e,
          });
          return NextResponse.json({ error: "Totals lookup failed; will retry" }, { status: 500 });
        }
        // W23c — reconcile against what was CAPTURED, not what was authorized. On the automatic path
        // these are the same number (`amount_received` equals `amount` for a fully-captured PI, and
        // the codebase already treats amount_received as "the literally-captured amount" in the
        // refunds-needed rows below). On the manual-capture pickup path they deliberately differ: a
        // partial capture leaves `amount` at the original hold while `amount_received` is what the
        // guest actually paid — and the voided lines mean getCartTotals now re-derives that smaller
        // figure. Comparing against `amount` would 409 every partial capture into 72h of retries,
        // stranding a charged diner with no order. ONE binding, read by the check and by the order
        // it writes, so the reconciled figure and the recorded figure can never be different numbers.
        const capturedCents = intent.amount_received ?? intent.amount;
        if (totals.totalCents !== capturedCents) {
          // The PI succeeded (the diner WAS charged) but the re-derived total no longer matches — a
          // tampered/stale cart, or a discount that changed under the pay lock. For a locked cart this
          // won't self-heal, so the 72h of retries below would otherwise strand a charged diner with no
          // order AND no operator signal. Record a durable refund-needed entry (idempotent on the PI, like
          // the card-after-settle branch) so it's recoverable, then still 409 (Stripe keeps trying in case
          // it does resolve; the upsert no-ops on each retry).
          const { error: refundErr } = await db.from("qr_refunds_needed").upsert(
            {
              payment_intent: intent.id,
              cart_id: cartId,
              amount_cents: intent.amount_received ?? intent.amount ?? null,
              reason: "reconcile_mismatch",
            },
            { onConflict: "payment_intent", ignoreDuplicates: true },
          );
          if (refundErr)
            console.error("[stripe webhook] failed to record reconcile-mismatch refund-needed", {
              paymentIntent: intent.id,
              message: refundErr.message,
            });
          return NextResponse.json(
            { error: `amount mismatch: cart=${totals.totalCents} captured=${capturedCents}` },
            { status: 409 }, // non-2xx → Stripe retries; surfaces a tampered/stale cart
          );
        }
        const { data: orderId, error: fulfillErr } = await db.rpc("mms_fulfill_order", {
          p_cart_id: cartId,
          p_payment_intent: intent.id,
          p_amount_cents: capturedCents,
          p_subtotal_cents: totals.subtotalCents,
          p_discount_cents: totals.discountCents,
          p_service_charge_cents: totals.serviceChargeCents,
          p_tax_cents: totals.taxCents,
          p_tip_cents: totals.tipCents,
          // W6c: the reader's orders carry their tender + the staff member who ran the settle (the
          // online path omits both — the fn defaults preserve it byte-for-byte).
          ...(isTerminal && {
            p_tender: "terminal" as const,
            ...(intent.metadata?.settledByStaffId && {
              p_settled_by: intent.metadata.settledByStaffId,
            }),
          }),
        });
        // supabase-js returns the Postgres error in `error` — it does NOT throw. Swallowing it would
        // 200 the event, so Stripe marks it handled and never retries → a charged diner with no order.
        // Return 5xx so Stripe redelivers (up to 72h); fulfillment is idempotent on the PI id, so a
        // later retry that succeeds is safe. Log the full error (code/details/hint) for triage.
        if (fulfillErr) {
          console.error("[stripe webhook] mms_fulfill_order failed", {
            cartId,
            paymentIntent: intent.id,
            error: fulfillErr,
          });
          return NextResponse.json({ error: "Fulfillment failed; will retry" }, { status: 500 });
        }
        // QBO accounting sync (M2·P2.4): enqueue the order durably, then post the Sales Receipt OUT OF
        // BAND in after() — QuickBooks latency/outage must never delay the Stripe ack or block the money
        // path. The sync is fail-safe (disabled/unconfigured → logged skip) and idempotent (one receipt
        // per order); if after() never runs, the 'pending' queue row is drained by processPendingQboSyncs.
        if (orderId) {
          await enqueueQboSync(db, orderId);
          after(() => syncOrderToQbo(orderId));
          // Fire-at-checkout (S4.2): the cart is paid → fire any still-draft FOOD (mms_fire_pending_food
          // gates to a paid dine-in cart + food, never grocery) so the kitchen makes everything the guest
          // paid for ("no charge-with-no-fire"). Drained in after(): a kitchen-fire hiccup must NEVER block
          // the Stripe ack or fail the money path. Idempotent (no draft food ⇒ fires 0); covers a secure-tab
          // off-session close too (it rides this same succeeded→fulfill path). KDS sees it via realtime.
          // S4-audit P1-2: each settlement side-effect is INDEPENDENT — a thrown await (transport hiccup) on
          // one must not starve the next two, so each is wrapped on its own. The pg_cron reconciler
          // (mms_reconcile_settled_fulfillment) is the durable backstop if after() never runs at all.
          after(async () => {
            try {
              const { error: fireErr } = await db.rpc("mms_fire_pending_food", {
                p_cart_id: cartId,
              });
              if (fireErr)
                console.error("[stripe webhook] fire-at-checkout failed", {
                  cartId,
                  paymentIntent: intent.id,
                  error: fireErr,
                });
            } catch (e) {
              console.error("[stripe webhook] fire-at-checkout threw", { cartId, error: e });
            }
            // To-go fulfillment loop (S4.3a): flag the order 'preparing' iff it has a takeaway (togo/
            // grocery) line, so the expo station picks it up + /track shows progress. Idempotent (only sets
            // when null + a bag exists; null for pure dine-in).
            try {
              const { error: togoErr } = await db.rpc("mms_init_togo_status", {
                p_order: orderId,
                p_cart: cartId,
              });
              if (togoErr)
                console.error("[stripe webhook] init togo_status failed", {
                  cartId,
                  paymentIntent: intent.id,
                  error: togoErr,
                });
            } catch (e) {
              console.error("[stripe webhook] init togo_status threw", { cartId, error: e });
            }
            // Split-tender SEAM (S4.3c): record eligibility-at-sale on the order's grocery lines (the 2027
            // EBT partition key). Idempotent; false if it hiccups (catalog stays derivable).
            try {
              const { error: ebtErr } = await db.rpc("mms_snapshot_ebt_eligibility", {
                p_order: orderId,
              });
              if (ebtErr)
                console.error("[stripe webhook] snapshot ebt eligibility failed", {
                  cartId,
                  paymentIntent: intent.id,
                  error: ebtErr,
                });
            } catch (e) {
              console.error("[stripe webhook] snapshot ebt eligibility threw", {
                cartId,
                error: e,
              });
            }
            // W6c: a Terminal settle fulfills HERE (not in settleCash's after()), so the counter-
            // lifecycle rule runs here too — a settled `reg-`/kiosk-pickup session is one finished
            // order and must not squat in the active set (and the register queue) for its 12h TTL.
            if (isTerminal) {
              try {
                const { data: cartSess, error: sessErr } = await db
                  .from("qr_carts")
                  .select("session_id")
                  .eq("id", cartId)
                  .maybeSingle();
                if (sessErr)
                  console.error("[stripe webhook] terminal session lookup failed", {
                    cartId,
                    message: sessErr.message,
                  });
                else if (cartSess?.session_id) await closeCounterStyleSession(cartSess.session_id);
              } catch (e) {
                console.error("[stripe webhook] terminal counter close threw", {
                  cartId,
                  error: e,
                });
              }
            }
          });
          // Morning Star Rewards (M4): stamp the earner + award Stars. Only a known diner PAYER earns
          // (earnerUid set by create-intent); a cash/staff close has none → earns nothing. Server-
          // authoritative + idempotent (mms_reward_on_fulfill keys the coupon per milestone index).
          // Best-effort: a rewards hiccup must NEVER fail the money ack — log and move on (the next paid
          // order recomputes Stars from the orders table, the single source of truth).
          const earnerUid = intent.metadata?.earnerUid;
          if (earnerUid) {
            // K3b: redirect-aware earn (see mms_earn_on_fulfill) — resolves earnerUid through any identity
            // merge so a payment that lands after the diner merged credits the merged-into account, not the
            // orphaned anon uid. Identical to the old 2-step when no merge exists (coalesce falls through).
            const { error: earnErr } = await db.rpc("mms_earn_on_fulfill", {
              p_order: orderId,
              p_earner: earnerUid,
            });
            if (earnErr)
              console.error("[stripe webhook] rewards earn failed", {
                orderId,
                error: earnErr,
              });
          }
          // Redeem any applied reward coupon (M4 P4.2) — flip it to redeemed AFTER the order is snapshotted
          // (the reconcile already counted its discount). Atomic + conditional → idempotent on redelivery,
          // single-use. Best-effort: never fail the money ack on it.
          const { error: redErr } = await db.rpc("mms_redeem_cart_reward", {
            p_cart: cartId,
            p_order: orderId,
          });
          if (redErr)
            console.error("[stripe webhook] reward redeem failed", { orderId, error: redErr });
        }
        // Tab-close audit (S3.3 / T13): a card settle that closed a tab. The actor comes from the PI
        // metadata — a staff off-session close (closeSecureTab) stamps closedBy='staff'; a diner paying
        // on their phone leaves it unset → 'diner'. Captures BOTH card close paths in one place; cash
        // closes are logged in settleCash. Best-effort, drained out of band (never delays the ack).
        if (orderId && cartRow?.tab_type && cartRow.tab_type !== "none") {
          // W6c: a reader settle is staff-run too — the attribution is settledByStaffId (settleCard's
          // metadata), not closedBy (closeSecureTab's). Without this, a Terminal tab close was
          // audited as actorKind 'diner' while a specific staff member ran the register.
          const closedByStaff = intent.metadata?.closedBy === "staff" || isTerminal;
          after(() =>
            logTabEvent({
              cartId,
              event: "closed",
              actorKind: closedByStaff ? "staff" : "diner",
              actorStaffId: closedByStaff
                ? (intent.metadata?.closedByStaffId ?? intent.metadata?.settledByStaffId ?? null)
                : null,
              tabType: cartRow.tab_type as "trust" | "secure",
              amountCents: intent.amount,
            }),
          );
        }
        // Capture exactly once — on the delivery that actually fulfills. A duplicate Stripe redelivery
        // (existing != null) or a missing-cartId event no longer double-counts / mis-fires analytics.
        posthog.capture({
          distinctId: cartId,
          event: "payment_succeeded",
          properties: {
            cart_id: cartId,
            payment_intent_id: intent.id,
            // W23c (Codex round 2) — what was COLLECTED, not what was held. On a partial capture
            // `intent.amount` is still the original authorization, so reporting it would overstate
            // pickup revenue on exactly the orders where the kitchen ran out — and disagree with the
            // order the same handler just wrote.
            amount_cents: intent.amount_received ?? intent.amount,
            currency: intent.currency,
          },
        });
      } else if (!existing && !cartId) {
        // Anomalous: a succeeded charge whose intent metadata has no cartId (our create-intent always
        // sets it). We can't fulfill and a retry won't help, so don't 5xx — but never let it vanish.
        console.error("[stripe webhook] succeeded intent missing cartId metadata", {
          paymentIntent: intent.id,
        });
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
        const settleErr = await releaseSettlementFor(cartId, intent.metadata.settleAttempt);
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
      // Single-pay: free the pay-window lock (P3.2-lock) so the cart returns to editable for the table.
      // Unconditional release by cart; idempotent + best-effort; the TTL is the backstop. ALSO release the
      // settle freeze: a secure-tab off-session close (S3.2) holds settle_at (not the single-pay lock), so
      // an async processing→failed decline would otherwise strand the table frozen for the full SETTLE_TTL.
      //
      // W10c (M31 sweep) — these two stay BEST-EFFORT, and that is now a decision rather than an
      // oversight. Unlike the split marks above, BOTH releases are UNCONDITIONAL by cart (no status
      // predicate scopes them to the era this event belongs to), so opting into redelivery would let a
      // late retry clear a live `settle_at` and unfreeze a settlement the table has since opened —
      // the same hazard the `onShareFailed` guard exists to prevent, but with no equivalent predicate
      // available here (a release is not a state transition). The 5-minute lock TTL and 10-minute
      // settle TTL are the designed backstop and heal the rows on their own. So: surface the failure
      // to the logs (an outage here must not be invisible) and let the TTLs do their job.
      //
      // ⚠️ Pre-merge review — the try/catch is what KEEPS the 200 the paragraph above argues for.
      // Dropping the old `.catch(() => {})` when these started returning their error left a throw
      // (a `serviceClient()` construction failure, say) free to escape into the handler's outer
      // catch and 500 — quietly re-opening the redelivery hazard the comment says must not exist.
      try {
        const lockErr = await releaseCartLock(cartId, null);
        const settleErr = await releaseSettlement(cartId);
        if (lockErr || settleErr)
          console.error("[stripe webhook] payment_failed release(s) failed", {
            cartId,
            paymentIntent: intent.id,
            lockError: lockErr?.message,
            settleError: settleErr?.message,
          });
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
        const settleErr = await releaseSettlementFor(
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
