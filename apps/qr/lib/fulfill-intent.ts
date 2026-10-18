import "server-only";
import { after } from "next/server";
import type Stripe from "stripe";
import { serviceClient } from "@mms/db/server";
import { getCartTotals } from "./totals";
import { closeCounterStyleSession } from "./staff-open-cart";
import { logTabEvent } from "./tab-events";
import { getPostHogClient } from "./posthog-server";
import { promoTag } from "./pilot-tag";
import { enqueueQboSync, syncOrderToQbo } from "./qbo/client";

/**
 * M160(b) — THE one fulfillment of a succeeded single-pay PaymentIntent.
 *
 * This is the body of the webhook's generic `payment_intent.succeeded` arm, MOVED here unchanged so
 * that the stranded-payment recovery (`lib/payment-recovery.ts`) runs the SAME path rather than a
 * second copy of it. Two copies of a money path drift (CLAUDE.md, "Name it ONCE"): the recovery
 * would have to re-learn the cross-tender guard, the captured-amount reconcile, the promo's own
 * contribution and every side-effect's idempotency, and the first edit to one of them would make
 * a recovered order a different order from a webhook one.
 *
 * Moving it also does what the route never could: `app/api/stripe/webhook/route.ts` carries
 * `verify:slice-exempt` (it is glue over a Next handler a suite cannot cheaply drive), so the rules
 * below had no mutant at all. Here they are falsified by values (`fulfill-intent.test.ts`).
 *
 * The caller decides WHETHER this intent may be fulfilled — the webhook because Stripe signed the
 * event, the recovery because it retrieved the intent itself and checked its status, binding and
 * link (`recoveryVerdict`). This function decides WHAT fulfilling it means, and it is idempotent
 * on the PaymentIntent id: a second call for the same intent finds the order and does nothing.
 *
 * ⚠️ IT NEVER RETRIES AND NEVER ANSWERS HTTP. Every outcome is a value; the webhook maps it to the
 * status code Stripe reads (byte-for-byte what the inline arm answered), the recovery to the
 * sentence a guest or a server reads.
 */
export type FulfillIntentOutcome =
  /** `mms_fulfill_order` answered — the order exists now (its id, when the RPC returned one). */
  | { kind: "fulfilled"; orderId: string | null }
  /** An order for this intent was already on record — nothing was done (idempotent). */
  | { kind: "already_recorded"; orderId: string }
  /** The cart was settled by another tender (or cancelled): a refund-needed row, NO order. */
  | { kind: "settled_elsewhere"; cartStatus: string }
  /** The re-derived total disagrees with the captured amount: a refund-needed row, NO order. */
  | { kind: "amount_mismatch"; cartCents: number; capturedCents: number }
  /** A succeeded charge with no `cartId` metadata — nothing to fulfill, and a retry cannot help. */
  | { kind: "no_cart_metadata" }
  /** A read or the fulfillment itself failed — nothing written; the caller retries later. */
  | {
      kind: "retry";
      step: "order_lookup" | "cart_lookup" | "totals" | "fulfill" | "refund_ledger";
    };

/** Who asked. `webhook` is the signed event; the rest are M160(b)'s three recovery doors. */
export type FulfillVia = "webhook" | "track" | "staff" | "cron";

export async function fulfillSucceededIntent(
  intent: Stripe.PaymentIntent,
  via: FulfillVia,
): Promise<FulfillIntentOutcome> {
  const db = serviceClient();
  const posthog = getPostHogClient();
  // The log prefix follows the door: a webhook delivery keeps the `[stripe webhook]` lines every
  // existing log search and alert matches; a recovery door names itself.
  const tag = via === "webhook" ? "[stripe webhook]" : `[payment-recovery ${via}]`;
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
  // already-recorded charge. Retry instead: the unique index is the hard backstop, but we should
  // never knowingly drive at it. maybeSingle() gives {null,null} for a genuine no-row.
  if (existingError) {
    console.error(`${tag} existing-order lookup failed`, {
      paymentIntent: intent.id,
      via,
      error: existingError.message,
    });
    return { kind: "retry", step: "order_lookup" };
  }
  if (existing) return { kind: "already_recorded", orderId: existing.id };
  if (!cartId) {
    // Anomalous: a succeeded charge whose intent metadata has no cartId (our create-intent always
    // sets it). We can't fulfill and a retry won't help — but never let it vanish.
    console.error(`${tag} succeeded intent missing cartId metadata`, {
      paymentIntent: intent.id,
      via,
    });
    return { kind: "no_cart_metadata" };
  }
  // Cross-tender guard (S1.3): if the cart was already settled by ANOTHER tender (a cash settle
  // taken while this PI's pay-lock was stale), this card charge is a double-collection — do NOT
  // record a duplicate order. Record it for a manual refund of the orphan charge (S4.3 automates
  // line-level refunds). mms_fulfill_order also raises on a non-open cart as the hard DB backstop;
  // this is the graceful, no-retry-storm path. A CANCELLED cart lands here too (M160: the correct
  // recovery outcome for one is a refund-needed row and NO order).
  const { data: cartRow, error: cartRowError } = await db
    .from("qr_carts")
    // P5 — `promo_code` rides this EXISTING read rather than a second one: the pilot needs its
    // orders to funnel apart from the rest of the traffic, and the code on the cart AT
    // FULFILLMENT is the one fulfillment consumed a redemption for. A separate read taken a
    // moment later could disagree with the amount this handler is reconciling.
    .select("status,tab_type,promo_code")
    .eq("id", cartId)
    .maybeSingle();
  // W10c (M30) — an unreadable cart silently SKIPPED the cross-tender guard below and proceeded
  // to fulfill, which is how a card charge gets recorded against a cart someone already settled
  // in cash. The guard is only a guard if it fails closed.
  if (cartRowError) {
    console.error(`${tag} cart lookup failed`, {
      cartId,
      paymentIntent: intent.id,
      via,
      error: cartRowError.message,
    });
    return { kind: "retry", step: "cart_lookup" };
  }
  if (cartRow && cartRow.status !== "open") {
    console.error(`${tag} card PI for an already-settled cart — refund needed`, {
      cartId,
      paymentIntent: intent.id,
      cartStatus: cartRow.status,
      via,
    });
    // Durable recovery ledger (S1-audit S3): the card was CAPTURED but no order is recorded, so a
    // log alone strands the customer's money. Record it for an operator / S4.3 auto-refund.
    // Idempotent on the PI (redelivery, or a recovery door asking again).
    //
    // ⚠️ NOT best-effort (Codex on #365 @ a2636db). The inline webhook arm logged a failed write and
    // answered 200, so Stripe stopped redelivering with the charge in NEITHER the order table nor
    // this ledger — the one state nobody can find. A failed write is `retry`: the webhook answers
    // 5xx and Stripe redelivers (the upsert no-ops once it lands), a recovery door says `error`, and
    // the analytics below wait for the delivery that actually wrote the row.
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
    if (refundErr) {
      console.error(`${tag} failed to record refund-needed`, {
        paymentIntent: intent.id,
        via,
        message: refundErr.message,
      });
      return { kind: "retry", step: "refund_ledger" };
    }
    posthog.capture({
      distinctId: cartId,
      event: "double_tender_card_after_settle",
      properties: { cart_id: cartId, payment_intent: intent.id, cart_status: cartRow.status },
    });
    return { kind: "settled_elsewhere", cartStatus: cartRow.status };
  }
  // Re-derive the server-authoritative breakdown and reconcile it against the actual charge
  // before fulfilling — the cart could have mutated between intent-create and now.
  // mms_fulfill_order re-checks the sum == intent.amount and snapshots the order (in cents).
  let totals;
  try {
    totals = await getCartTotals(cartId, tipRate);
  } catch (e) {
    // The cart row may be unreadable/deleted between intent-create and delivery. Don't let the
    // bare throw escape without context — log the cart + PI, then retry.
    console.error(`${tag} getCartTotals failed`, {
      cartId,
      paymentIntent: intent.id,
      via,
      error: e,
    });
    return { kind: "retry", step: "totals" };
  }
  // W23c — reconcile against what was CAPTURED, not what was authorized. On the automatic path
  // these are the same number (`amount_received` equals `amount` for a fully-captured PI). On the
  // manual-capture pickup path they deliberately differ: a partial capture leaves `amount` at the
  // original hold while `amount_received` is what the guest actually paid — and the voided lines
  // mean getCartTotals now re-derives that smaller figure. ONE binding, read by the check and by
  // the order it writes, so the reconciled figure and the recorded figure can never differ.
  const capturedCents = intent.amount_received ?? intent.amount;
  if (totals.totalCents !== capturedCents) {
    // The PI succeeded (the diner WAS charged) but the re-derived total no longer matches — a
    // tampered/stale cart, or a discount that changed under the pay lock. For a locked cart this
    // won't self-heal, so record a durable refund-needed entry (idempotent on the PI, like the
    // card-after-settle branch) so it's recoverable. The webhook still answers 409 (Stripe keeps
    // trying in case it does resolve; the upsert no-ops on each retry).
    const { error: refundErr } = await db.from("qr_refunds_needed").upsert(
      {
        payment_intent: intent.id,
        cart_id: cartId,
        amount_cents: intent.amount_received ?? intent.amount ?? null,
        reason: "reconcile_mismatch",
      },
      { onConflict: "payment_intent", ignoreDuplicates: true },
    );
    // Same rule as the card-after-settle row above: an unwritten ledger row is `retry`, never an
    // answer that reads as "recorded for a refund".
    if (refundErr) {
      console.error(`${tag} failed to record reconcile-mismatch refund-needed`, {
        paymentIntent: intent.id,
        via,
        message: refundErr.message,
      });
      return { kind: "retry", step: "refund_ledger" };
    }
    console.error(`${tag} amount mismatch — no order written`, {
      cartId,
      paymentIntent: intent.id,
      via,
      cartCents: totals.totalCents,
      capturedCents,
    });
    return { kind: "amount_mismatch", cartCents: totals.totalCents, capturedCents };
  }
  const { data: orderId, error: fulfillErr } = await db.rpc("mms_fulfill_order", {
    p_cart_id: cartId,
    p_payment_intent: intent.id,
    p_amount_cents: capturedCents,
    p_subtotal_cents: totals.subtotalCents,
    p_discount_cents: totals.discountCents,
    // M22 — the PROMO's own contribution, so fulfillment consumes a redemption only when the
    // code actually delivered. `p_discount_cents` folds promo + reward, and a reward covering
    // the whole basket clamps the promo to 0 while keeping that sum positive.
    p_promo_cents: totals.promoCents,
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
  // report success for a charged diner with no order. Retry; fulfillment is idempotent on the PI
  // id, so a later attempt that succeeds is safe. Log the full error (code/details/hint).
  //
  // ⚠️ A CONCURRENT SECOND CALLER lands here too (M160(b): the webhook and a recovery door racing on
  // one intent). Both pass the order read above; `mms_fulfill_order`'s `update … where status =
  // 'open'` row-locks the cart, and the loser re-evaluates against the winner's commit, finds the
  // cart `paid`, and RAISES — so it writes no second order, consumes no second promo redemption, and
  // reaches none of the side effects below. Its caller retries and then reads `already_recorded`.
  if (fulfillErr) {
    console.error(`${tag} mms_fulfill_order failed`, {
      cartId,
      paymentIntent: intent.id,
      via,
      error: fulfillErr,
    });
    return { kind: "retry", step: "fulfill" };
  }
  // QBO accounting sync (M2·P2.4): enqueue the order durably, then post the Sales Receipt OUT OF
  // BAND in after() — QuickBooks latency/outage must never delay the answer or block the money
  // path. The sync is fail-safe (disabled/unconfigured → logged skip) and idempotent (one receipt
  // per order); if after() never runs, the 'pending' queue row is drained by processPendingQboSyncs.
  if (orderId) {
    await enqueueQboSync(db, orderId);
    after(() => syncOrderToQbo(orderId));
    // Fire-at-checkout (S4.2): the cart is paid → fire any still-draft FOOD (mms_fire_pending_food
    // gates to a paid dine-in cart + food, never grocery) so the kitchen makes everything the guest
    // paid for ("no charge-with-no-fire"). Drained in after(): a kitchen-fire hiccup must NEVER block
    // the answer or fail the money path. Idempotent (no draft food ⇒ fires 0 — so a recovery that
    // lands after the webhook can never fire the kitchen twice); covers a secure-tab off-session
    // close too (it rides this same succeeded→fulfill path). KDS sees it via realtime.
    // S4-audit P1-2: each settlement side-effect is INDEPENDENT — a thrown await (transport hiccup) on
    // one must not starve the next two, so each is wrapped on its own. The pg_cron reconciler
    // (mms_reconcile_settled_fulfillment) is the durable backstop if after() never runs at all.
    after(async () => {
      try {
        const { error: fireErr } = await db.rpc("mms_fire_pending_food", {
          p_cart_id: cartId,
        });
        if (fireErr)
          console.error(`${tag} fire-at-checkout failed`, {
            cartId,
            paymentIntent: intent.id,
            error: fireErr,
          });
      } catch (e) {
        console.error(`${tag} fire-at-checkout threw`, { cartId, error: e });
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
          console.error(`${tag} init togo_status failed`, {
            cartId,
            paymentIntent: intent.id,
            error: togoErr,
          });
      } catch (e) {
        console.error(`${tag} init togo_status threw`, { cartId, error: e });
      }
      // Split-tender SEAM (S4.3c): record eligibility-at-sale on the order's grocery lines (the 2027
      // EBT partition key). Idempotent; false if it hiccups (catalog stays derivable).
      try {
        const { error: ebtErr } = await db.rpc("mms_snapshot_ebt_eligibility", {
          p_order: orderId,
        });
        if (ebtErr)
          console.error(`${tag} snapshot ebt eligibility failed`, {
            cartId,
            paymentIntent: intent.id,
            error: ebtErr,
          });
      } catch (e) {
        console.error(`${tag} snapshot ebt eligibility threw`, {
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
            console.error(`${tag} terminal session lookup failed`, {
              cartId,
              message: sessErr.message,
            });
          else if (cartSess?.session_id) await closeCounterStyleSession(cartSess.session_id);
        } catch (e) {
          console.error(`${tag} terminal counter close threw`, {
            cartId,
            error: e,
          });
        }
      }
    });
    // Morning Star Rewards (M4): stamp the earner + award Stars. Only a known diner PAYER earns
    // (earnerUid set by create-intent); a cash/staff close has none → earns nothing. Server-
    // authoritative + idempotent (mms_reward_on_fulfill keys the coupon per milestone index).
    // Best-effort: a rewards hiccup must NEVER fail the money outcome — log and move on (the next
    // paid order recomputes Stars from the orders table, the single source of truth).
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
        console.error(`${tag} rewards earn failed`, {
          orderId,
          error: earnErr,
        });
    }
    // Redeem any applied reward coupon (M4 P4.2) — flip it to redeemed AFTER the order is snapshotted
    // (the reconcile already counted its discount). Atomic + conditional → idempotent on redelivery,
    // single-use. Best-effort: never fail the money outcome on it.
    const { error: redErr } = await db.rpc("mms_redeem_cart_reward", {
      p_cart: cartId,
      p_order: orderId,
    });
    if (redErr) console.error(`${tag} reward redeem failed`, { orderId, error: redErr });
  }
  // Tab-close audit (S3.3 / T13): a card settle that closed a tab. The actor comes from the PI
  // metadata — a staff off-session close (closeSecureTab) stamps closedBy='staff'; a diner paying
  // on their phone leaves it unset → 'diner'. Captures BOTH card close paths in one place; cash
  // closes are logged in settleCash. Best-effort, drained out of band (never delays the answer).
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
  // Capture exactly once — on the call that actually fulfills. An intent already on record returned
  // above, so neither a redelivery nor a recovery door asking again double-counts analytics.
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
      amount_cents: capturedCents,
      currency: intent.currency,
      // M22 (Codex round 2) — the promo's DELIVERED contribution, the same figure fulfillment
      // consumes a redemption on. `promo_applied` fires at APPLY time and records
      // `mms_promo_check`'s quote, which is what the code was worth against the basket as it
      // stood then: a reward, a void or a comp landing afterwards all move the delivered
      // amount, and reward-first can take it to 0. Report what happened, not what was asked.
      promo_cents: totals.promoCents,
      // P5 — WHICH code, beside what it delivered. Normalized through `promoTag` so one campaign
      // is one filter value and an empty string never reports as a nameless one; null when the
      // basket carried no code. Reported ALONGSIDE `promo_cents`, never instead of it.
      promo_code: promoTag(cartRow?.promo_code),
      // M160(b) — which door fulfilled it. Absent for the webhook (its payload is unchanged); a
      // recovered order says so, so a dashboard can count how often the webhook needed help.
      ...(via !== "webhook" && { recovered_via: via }),
    },
  });
  return { kind: "fulfilled", orderId: orderId ?? null };
}
