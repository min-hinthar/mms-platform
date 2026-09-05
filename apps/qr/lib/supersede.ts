import "server-only";
import { getStripe } from "./stripe";
import { classifyLiveIntent, supersedeOutcome, type SupersedeOutcome } from "./live-intent";
import {
  readLiveIntent,
  readLiveIntentFor,
  releasePayAttempt,
  unlinkPaymentIntent,
  type ReleaseError,
} from "./lock";

/**
 * M151 — make a PREDECESSOR unusable before its pin may be replaced (the Stripe half).
 *
 * The verdict table is `lib/live-intent.ts` (pure, mutated). This module is the sequence around
 * it: retrieve → classify → cancel if cancelable → fold the cancel's own outcome back through the
 * same table. `cleared` is the ONLY outcome that permits the caller to drop the link and touch the
 * pin; `captured` refuses the successor; `unknown` refuses without touching anything, because a
 * transport failure is not a verdict (M119's rule, one hop out).
 *
 * Two Stripe calls on the ordinary path is deliberate. `cancel` alone cannot distinguish "already
 * captured" from "already cancelled" — both refuse with `payment_intent_unexpected_state` — and
 * `split-hold.ts` documents what rounding that refusal down to "released" cost. So the status is
 * read FIRST and decides; the cancel's refusal, if any, is re-read once and decided again.
 */
export async function supersedeLiveIntent(intentId: string): Promise<SupersedeOutcome> {
  const stripe = getStripe();
  let status: string;
  try {
    status = (await stripe.paymentIntents.retrieve(intentId)).status;
  } catch (e) {
    // A vanished intent (test-mode data reset, a deleted account object) cannot capture anything.
    if ((e as { code?: string }).code === "resource_missing") return "cleared";
    return "unknown";
  }
  const verdict = classifyLiveIntent(status);
  if (verdict !== "cancelable")
    return supersedeOutcome({ verdict, cancelled: false, code: null, statusAfter: null });
  try {
    await stripe.paymentIntents.cancel(intentId);
    return supersedeOutcome({ verdict, cancelled: true, code: null, statusAfter: null });
  } catch (e) {
    const code = (e as { code?: string }).code ?? null;
    let statusAfter: string | null = null;
    if (code === "payment_intent_unexpected_state") {
      try {
        statusAfter = (await stripe.paymentIntents.retrieve(intentId)).status;
      } catch {
        statusAfter = null; // the fold treats a failed re-read as unknown — never as cleared
      }
    }
    return supersedeOutcome({ verdict, cancelled: false, code, statusAfter });
  }
}

/**
 * create-intent's step: if the cart names an intent, make it unusable and drop the link.
 *
 * Returns the outcome so the route can refuse honestly — `captured` is "that payment is already
 * going through", `unknown` is a 503 — and returns `cleared` immediately when there was nothing
 * to supersede, which is the ordinary first checkout.
 */
export async function supersedeCartIntent(cartId: string): Promise<SupersedeOutcome> {
  const live = await readLiveIntent(cartId);
  if (!live) return "cleared";
  const outcome = await supersedeLiveIntent(live);
  if (outcome !== "cleared") return outcome;
  const err = await unlinkPaymentIntent(cartId, live);
  if (err) {
    console.error("[supersede] link not dropped after cancel", {
      cartId,
      live,
      error: err.message,
    });
    // The intent is dead at Stripe but the row still names it; the next attempt will find it
    // `canceled` and clear it then. Refusing here would strand a diner over a bookkeeping write.
  }
  return "cleared";
}

export type SafeRelease =
  | { released: true; error: null }
  | { released: false; error: ReleaseError; reason?: "paying" | "unknown" };

/**
 * The client exits ("Edit order", the pagehide beacon): cancel THIS attempt's intent, then run the
 * one-statement era-scoped release that also drops the link.
 *
 * ⚠️ NEVER cancels an intent the attempt does not own — `readLiveIntentFor` is scoped to seat and
 * era, so a superseded tab reads null and falls straight through to `releasePayAttempt`, which
 * matches zero rows and reports supersession exactly as before. And a `captured` intent is REFUSED
 * with `reason: "paying"` rather than released: the diner's card is charged or charging, the
 * webhook is about to fulfil, and unfreezing the cart under it is the peer-mutation hole the lock
 * exists to close.
 */
export async function releasePayAttemptSafely(
  cartId: string,
  uid: string,
  era: string | null,
): Promise<SafeRelease> {
  if (!era) return { released: false, error: null };
  let live: string | null;
  try {
    live = await readLiveIntentFor(cartId, uid, era);
  } catch (e) {
    return { released: false, error: e as ReleaseError, reason: "unknown" };
  }
  if (live) {
    const outcome = await supersedeLiveIntent(live);
    if (outcome === "captured") return { released: false, error: null, reason: "paying" };
    if (outcome === "unknown") return { released: false, error: null, reason: "unknown" };
  }
  const res = await releasePayAttempt(cartId, uid, era);
  if (res.error) return { released: false, error: res.error };
  return res.released ? { released: true, error: null } : { released: false, error: null };
}
