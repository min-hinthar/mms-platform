import "server-only";
import { serviceClient } from "@mms/db/server";
import { getStripe } from "./stripe";
import { getCartTotals } from "./totals";
import { unavailableLines } from "./availability-read";
import { planCapture } from "./manual-capture";

/**
 * W23c — the beat between a pickup order's authorization and its capture.
 *
 * Runs from the `payment_intent.amount_capturable_updated` webhook, which Stripe fires the moment a
 * manual-capture PI is confirmed. Nothing is fulfilled here: capturing makes Stripe fire
 * `payment_intent.succeeded`, and THAT is what creates the order, through the same handler and the
 * same `mms_fulfill_order` every other payment goes through. So the order is only ever born already
 * captured — there is no "authorized" limbo for the receipt, the rewards, the history or the refund
 * path to learn about, and `status = 'paid'` never has to mean anything new.
 *
 * That property is the whole reason this design is small. An earlier shape fulfilled at
 * authorization and captured later, which meant every surface that reads `status` needed a fourth
 * state and W23b's receipt vocabulary needed a fifth. This one changes two files and adds a
 * function.
 *
 * ORDER OF OPERATIONS, and why: void → re-derive → capture. Money moves LAST, exactly as it does on
 * the automatic path, so the failure modes stay the ones the app already knows how to survive. If
 * the capture fails, the authorization is still whole and expires on its own — a hold that
 * disappears, with no order and no charge. If it succeeds and fulfillment then fails, that is
 * today's charged-but-unfulfilled path, which already has `qr_refunds_needed` and Stripe's 72h of
 * retries behind it.
 */

export type CaptureOutcome =
  | { kind: "captured"; amountCents: number; partial: boolean; dropped: string[] }
  | { kind: "canceled"; reason: string }
  | { kind: "already"; note: string }
  | { kind: "retry"; note: string };

/**
 * Settle one authorized pickup PI. Returns what happened rather than throwing, so the webhook can
 * decide between a 200 (handled) and a 5xx (Stripe, try again) with the reason in hand.
 */
export async function settleAuthorizedPickup(
  intentId: string,
  cartId: string,
  authorizedCents: number,
  tipRate: number,
): Promise<CaptureOutcome> {
  const stripe = getStripe();
  const db = serviceClient();

  // Re-read the intent rather than trusting the event body: Stripe redelivers for 72h and the event
  // is a snapshot of a moment that may already be spent. An intent that is no longer capturable was
  // settled by an earlier delivery of this same event, and re-running the voids under it would edit
  // a basket whose money has already moved.
  const live = await stripe.paymentIntents.retrieve(intentId);
  if (live.status !== "requires_capture")
    return { kind: "already", note: `intent is ${live.status}, not requires_capture` };

  // The last look at the catalog. This is the window W23a's gate could not reach: it ran before the
  // mint, and the diner spent the next minute typing a card number.
  const gone = await unavailableLines(cartId);

  if (gone.length > 0) {
    const { data: voided, error: voidErr } = await db.rpc("mms_void_unavailable_lines", {
      p_cart: cartId,
      p_menu_ids: gone.map((g) => g.id),
    });
    if (voidErr) {
      // Do NOT capture on an unreadable void. Capturing here would charge the full authorization for
      // a basket we have just been told the kitchen cannot fill — the precise charge this path
      // exists to prevent — so leave the hold intact and let Stripe redeliver.
      console.error("[manual-capture] void failed", { intentId, cartId, error: voidErr.message });
      return { kind: "retry", note: "void failed" };
    }
    if (voided === -1) {
      // The cart is no longer open: it was settled or cleared out-of-band while this hold stood.
      // There is nothing left to charge for.
      await cancelQuietly(intentId, "cart no longer open");
      return { kind: "canceled", reason: "cart no longer open" };
    }
  }

  // Re-derived AFTER the voids, so the tip has already been recomputed at the diner's chosen rate
  // against the reduced base. Nothing in this file does money arithmetic — `getCartTotals` is the
  // one authority for what a basket is worth, on this path exactly as on every other.
  let totals;
  try {
    totals = await getCartTotals(cartId, tipRate);
  } catch (e) {
    console.error("[manual-capture] totals failed", { intentId, cartId, error: e });
    return { kind: "retry", note: "totals failed" };
  }

  const plan = planCapture(authorizedCents, totals.totalCents);
  if (plan.action === "cancel") {
    await cancelQuietly(intentId, plan.reason);
    return { kind: "canceled", reason: plan.reason };
  }

  try {
    // `amount_to_capture` is what makes this a PARTIAL capture. Stripe releases the uncaptured
    // remainder of the hold on its own — the guest never sees a refund, because there was never a
    // charge to refund.
    await stripe.paymentIntents.capture(
      intentId,
      { amount_to_capture: plan.amountCents },
      // Keyed on the amount as well as the intent: a redelivery that somehow re-derived a DIFFERENT
      // amount must fail loudly on the key rather than quietly capture a second, different figure.
      { idempotencyKey: `cap_${intentId}_${plan.amountCents}` },
    );
  } catch (e) {
    console.error("[manual-capture] capture failed", { intentId, cartId, error: e });
    return { kind: "retry", note: "capture failed" };
  }

  return {
    kind: "captured",
    amountCents: plan.amountCents,
    partial: plan.partial,
    dropped: gone.map((g) => g.name),
  };
}

/**
 * Cancel the hold, and never let the cancel's own failure mask the decision that produced it.
 *
 * An uncancelled authorization is not a charge — it expires on its own within a week — so a failed
 * cancel is a tidiness problem, not a money one, and it must not turn into a 5xx that makes Stripe
 * redeliver an event whose work is already done.
 */
async function cancelQuietly(intentId: string, reason: string): Promise<void> {
  try {
    await getStripe().paymentIntents.cancel(intentId);
  } catch (e) {
    console.error("[manual-capture] cancel failed (hold will expire on its own)", {
      intentId,
      reason,
      error: e,
    });
  }
}
