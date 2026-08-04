import "server-only";
import { getStripe } from "./stripe";

/**
 * What actually happened to a split payer's authorization hold when we tried to release it.
 *
 * W10d pre-merge review. Two code paths cancel a share's PaymentIntent and then immediately destroy the
 * only pointer to it — `create-share-intent` overwrites `stripe_payment_intent_id` with the replacement,
 * and `abortSettlement` deletes the row. Both used a bare `catch {}` on the cancel, and both were wrong
 * for the same reason: **`cancel` failing does not mean the hold is gone.**
 *
 * `qr_cart_shares.stripe_payment_intent_id` is single-valued, nothing else stores share PaymentIntents,
 * and there is no reaper — so a cancel that failed for a transport reason, followed by the write that
 * forgets the id, strands a real authorization on a diner's card for the full ~7-day window with nothing
 * on our side that could ever find it again.
 *
 *  - `released` — cancel succeeded, or the PI was already `canceled`. No hold.
 *  - `gone`     — `resource_missing`: the PI does not exist. No hold.
 *  - `captured` — the PI **succeeded**. Money moved. The caller must NOT discard this row.
 *  - `unknown`  — we could not establish the state (429 / 5xx / timeout, or a live `requires_capture`
 *                 that `cancel` refused). Treat as STILL HOLDING and fail closed.
 */
export type HoldOutcome = "released" | "gone" | "captured" | "unknown";

/**
 * Best-effort release of one PaymentIntent, classified.
 *
 * The subtle case is `payment_intent_unexpected_state`, which was previously read as "already dead".
 * It is Stripe's code for *any* state `cancel` refuses — and that includes **`succeeded`**. That is not
 * a guess: `captureAllIfReady` retrieves the PI on this exact code for this exact reason ("`capture` on
 * an already-captured PI raises `payment_intent_unexpected_state`", `split-settle.ts`). Treating it as
 * benign let an abort delete a share whose card had really been charged — a charge with no order, no
 * share row, and no log naming the PaymentIntent. So on that code we ask Stripe what the state IS
 * rather than assuming it.
 */
export async function releaseHold(paymentIntentId: string): Promise<HoldOutcome> {
  try {
    await getStripe().paymentIntents.cancel(paymentIntentId);
    return "released";
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "resource_missing") return "gone";
    // Anything that is not a state refusal (429, 5xx, timeout, network) tells us nothing about the
    // hold. Fail closed — the caller must keep the pointer rather than forget a possibly-live charge.
    if (code !== "payment_intent_unexpected_state") return "unknown";
    try {
      const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
      if (pi.status === "succeeded") return "captured";
      if (pi.status === "canceled") return "released";
      // `requires_capture` here means a LIVE hold that `cancel` nonetheless refused — the one shape we
      // must never round down to "released".
      return "unknown";
    } catch (retrieveError) {
      if ((retrieveError as { code?: string }).code === "resource_missing") return "gone";
      return "unknown";
    }
  }
}
