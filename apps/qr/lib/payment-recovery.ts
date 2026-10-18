import "server-only";
import { after } from "next/server";
import type Stripe from "stripe";
import { serviceClient } from "@mms/db/server";
import { getStripe } from "./stripe";
import { getPostHogClient } from "./posthog-server";
import { fulfillSucceededIntent, type FulfillVia } from "./fulfill-intent";
import {
  fulfillAnswer,
  isCartIdShape,
  isRecoverableKind,
  recoveryVerdict,
  refusalAnswer,
  sweepWindow,
  type RecoveryAnswer,
  type RecoveryExpect,
} from "./payment-recovery-verdict";

/**
 * M160(b) — the stranded-paid-cart recovery: the sequence around `recoveryVerdict`.
 *
 * retrieve (Stripe's own answer, never the caller's) → read the cart the metadata names → verdict →
 * the webhook's own fulfillment (`fulfillSucceededIntent`). Three doors reach it:
 *
 *   • /track (`recoverMyPayment`, lib/payment-recovery-actions.ts) — a guest whose order has not
 *     appeared 12 s after paying, bound to the guest's own uid;
 *   • staff's "Check payment" (`checkTablePayment`, same file) on a table whose clear refused
 *     `card_live`, staff-authorized;
 *   • the cron (`app/api/cron/stranded-payments`) — the sweep below, for a payment nobody is
 *     watching (owner ruling #13: it runs once `CRON_SECRET` is set).
 *
 * Not a Server Action file: nothing here is callable from a browser. The actions module wraps it.
 */

/** Read the cart a verdict needs. `undefined` is an unreadable row — never "no cart". */
async function readRecoveryCart(cartId: string) {
  const { data, error } = await serviceClient()
    .from("qr_carts")
    .select("status,live_payment_intent_id")
    .eq("id", cartId)
    .maybeSingle();
  if (error) {
    console.error("[payment-recovery] cart read failed", { cartId, error: error.message });
    return undefined;
  }
  return data ? { status: data.status, linkedIntent: data.live_payment_intent_id } : null;
}

/**
 * Run the recovery for an intent Stripe has just handed back. `expect.cartId` is the cart the door
 * found the intent on; for the cron it is the intent's own metadata (the cron's binding is the
 * cart's link, which the verdict checks).
 */
export async function recoverRetrievedIntent(
  intent: Stripe.PaymentIntent,
  expect: RecoveryExpect,
  via: Exclude<FulfillVia, "webhook">,
): Promise<RecoveryAnswer> {
  const metaCart = intent.metadata?.cartId;
  // An unshaped id never reaches the uuid column (the verdict refuses it as `unbound` below).
  const cart = isCartIdShape(metaCart) ? await readRecoveryCart(metaCart) : null;
  if (cart === undefined) return { kind: "error" };
  const verdict = recoveryVerdict({ intent, expect, cart });
  if (!verdict.ok) {
    // FAIL CLOSED, AND SAY SO. Every refusal is logged by name with the intent and the door, so an
    // operator can find a charge the recovery would not touch. `not_succeeded` is the ordinary case
    // (a guest who has not finished paying) and stays at warn.
    const log = verdict.refusal === "not_succeeded" ? console.warn : console.error;
    log("[payment-recovery] refused", {
      refusal: verdict.refusal,
      paymentIntent: intent.id,
      status: intent.status,
      kind: intent.metadata?.kind ?? null,
      cartId: expect.cartId,
      via,
    });
    return refusalAnswer(verdict.refusal);
  }
  const outcome = await fulfillSucceededIntent(intent, via);
  if (outcome.kind === "fulfilled")
    console.error(
      "[payment-recovery] RECOVERED a stranded paid cart — the webhook never fulfilled it",
      {
        paymentIntent: intent.id,
        cartId: expect.cartId,
        orderId: outcome.orderId,
        via,
      },
    );
  // The shared path captures analytics; drain it after the answer (the webhook does the same at its
  // end). Best-effort by definition.
  after(async () => {
    try {
      await getPostHogClient().flush();
    } catch {
      // the outcome is already decided — never surface an analytics-drain failure
    }
  });
  return fulfillAnswer(outcome);
}

/** Retrieve, then recover. A failed retrieve is `error`: a transport failure is not a verdict. */
export async function recoverIntent(
  intentId: string,
  expect: RecoveryExpect,
  via: Exclude<FulfillVia, "webhook">,
): Promise<RecoveryAnswer> {
  let intent: Stripe.PaymentIntent;
  try {
    intent = await getStripe().paymentIntents.retrieve(intentId);
  } catch (e) {
    console.error("[payment-recovery] retrieve failed", {
      paymentIntent: intentId,
      via,
      error: e instanceof Error ? e.message : String(e),
    });
    return { kind: "error" };
  }
  return recoverRetrievedIntent(intent, expect, via);
}

// ── The cron's sweep ──────────────────────────────────────────────────────────────────────────────

/** How far back the sweep looks. A day covers a night nobody watched; Stripe's own webhook retries
 *  run for 72 h, so anything older has had every delivery Stripe will ever make. */
export const SWEEP_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** How old a charge must be before the sweep touches it: the webhook's own window first. */
export const SWEEP_MIN_AGE_MS = 3 * 60 * 1000;
/** Pages of 100 the sweep reads at most — the bound on one run's Stripe calls. */
export const SWEEP_MAX_PAGES = 5;
/** Recoveries one run attempts at most; the next run picks up the rest. */
export const SWEEP_MAX_RECOVER = 25;

export type SweepSummary = {
  listed: number;
  /** Succeeded, recoverable kind, cart-shaped metadata, no order and no refund row on record. */
  candidates: number;
  /** Candidates whose cart is not in this database — another app's PaymentIntent on the shared
   *  Stripe account. Skipped silently: not ours to log. */
  foreign: number;
  answers: Partial<Record<RecoveryAnswer["kind"], number>>;
  /** True when the page cap or the recovery cap stopped the run before the window was exhausted. */
  truncated: boolean;
};

/**
 * Sweep paid-but-unfulfilled carts in the bounded window: list succeeded intents, drop every one
 * already on record (an order, or a refund-needed row), and run each remaining one through the same
 * recovery the other doors use. Returns counts only — no ids leave this function except in logs.
 *
 * Throws on an unreadable order/refund ledger: the cron route answers 500 and the next run retries,
 * rather than recovering blind against a ledger it could not read.
 */
export async function sweepStrandedPayments(nowMs: number = Date.now()): Promise<SweepSummary> {
  const stripe = getStripe();
  const db = serviceClient();
  const created = sweepWindow(nowMs, SWEEP_LOOKBACK_MS, SWEEP_MIN_AGE_MS);
  const summary: SweepSummary = {
    listed: 0,
    candidates: 0,
    foreign: 0,
    answers: {},
    truncated: false,
  };

  const succeeded: Stripe.PaymentIntent[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < SWEEP_MAX_PAGES; page++) {
    const res = await stripe.paymentIntents.list({
      created,
      limit: 100,
      ...(startingAfter && { starting_after: startingAfter }),
    });
    summary.listed += res.data.length;
    for (const pi of res.data) {
      if (
        pi.status === "succeeded" &&
        isRecoverableKind(pi.metadata?.kind) &&
        isCartIdShape(pi.metadata?.cartId)
      )
        succeeded.push(pi);
    }
    if (!res.has_more) break;
    startingAfter = res.data.at(-1)?.id;
    if (page === SWEEP_MAX_PAGES - 1) summary.truncated = true;
  }
  if (succeeded.length === 0) return summary;

  const ids = succeeded.map((pi) => pi.id);
  const [orders, refunds] = await Promise.all([
    db.from("qr_orders").select("stripe_payment_intent_id").in("stripe_payment_intent_id", ids),
    db.from("qr_refunds_needed").select("payment_intent").in("payment_intent", ids),
  ]);
  if (orders.error) throw new Error(`order ledger unreadable: ${orders.error.message}`);
  if (refunds.error) throw new Error(`refund ledger unreadable: ${refunds.error.message}`);
  const onRecord = new Set<string>([
    ...(orders.data ?? []).map((o) => o.stripe_payment_intent_id ?? ""),
    ...(refunds.data ?? []).map((r) => r.payment_intent),
  ]);
  const stranded = succeeded.filter((pi) => !onRecord.has(pi.id));
  summary.candidates = stranded.length;
  if (stranded.length === 0) return summary;

  const cartIds = [...new Set(stranded.map((pi) => pi.metadata.cartId as string))];
  const { data: carts, error: cartsErr } = await db.from("qr_carts").select("id").in("id", cartIds);
  if (cartsErr) throw new Error(`cart read failed: ${cartsErr.message}`);
  const ours = new Set((carts ?? []).map((c) => c.id));

  let attempted = 0;
  for (const pi of stranded) {
    const cartId = pi.metadata.cartId as string;
    if (!ours.has(cartId)) {
      summary.foreign++;
      continue;
    }
    if (attempted >= SWEEP_MAX_RECOVER) {
      summary.truncated = true;
      break;
    }
    attempted++;
    // The listed object is a fresh read from Stripe (this request), so it is not re-retrieved.
    const answer = await recoverRetrievedIntent(pi, { cartId, payerUid: null }, "cron");
    summary.answers[answer.kind] = (summary.answers[answer.kind] ?? 0) + 1;
  }
  return summary;
}
