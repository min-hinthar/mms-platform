import "server-only";
import { serviceClient } from "@mms/db/server";
import { getStripe } from "./stripe";
import { getCartTotals } from "./totals";
import { unavailableLines } from "./availability-read";
import { planCapture } from "./manual-capture";
import { releaseCartLock } from "./lock";
import type { SettleCancelReason } from "./dropped-view";

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

/**
 * Pass a deliberate SQL NULL through Supabase's generated RPC `Args`.
 *
 * The generator types every plpgsql parameter as non-null because it cannot see that the function
 * accepts NULL — so a genuine "we do not have this value" has to be cast. Keeping the cast in one
 * named place makes it an admission rather than three scattered `as unknown as string`s, and the
 * two callers below both mean the same thing by it: an empty metadata string is not a value.
 */
function orNull(value: string): string {
  return (value === "" ? null : value) as unknown as string;
}

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
  payerUid: string,
  attempt: string,
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

  // ⚠️ W23d (Codex #205 P1) — A RECORDED CANCELLATION IS TERMINAL FOR THIS INTENT.
  //
  // The verdict is written before the Stripe cancel, so a cancel that fails leaves a row saying
  // "no payment was taken" over an intent that is still capturable. The diner is already reading
  // that sentence. Re-deriving a plan on the redelivery could then answer `capture` — the
  // `over_authorized` arm is the reachable one: it fires when the live total outgrew the hold, and a
  // staff price edit (or a promo re-activation) between deliveries brings the total back under it.
  // We would capture money seconds after telling the guest none was taken.
  //
  // So once a cancellation exists for this intent, the ONLY thing left to do is finish cancelling.
  // This keeps the durability rule (record first) without letting it create a claim the code can
  // still contradict. Read service-role by primary key; an unreadable ledger retries rather than
  // guessing, because guessing here is exactly the capture this guard exists to prevent.
  const { data: prior, error: priorErr } = await db
    .from("qr_settlement_cancellations")
    .select("reason")
    .eq("payment_intent", intentId)
    .maybeSingle();
  if (priorErr) {
    console.error("[manual-capture] prior-cancellation read failed", {
      intentId,
      error: priorErr.message,
    });
    return { kind: "retry", note: "cancellation ledger unreadable" };
  }
  if (prior) {
    if (!(await cancelHold(intentId, prior.reason)))
      return { kind: "retry", note: "cancel failed" };
    // The same arms that own the lock on the first pass own it here. `superseded` is the one that
    // does NOT: that lock belongs to a later attempt, and one settlement must never clear another's.
    if (prior.reason !== "superseded") await releaseOurLock(cartId, payerUid);
    return { kind: "canceled", reason: prior.reason };
  }

  // The last look at the catalog. This is the window W23a's gate could not reach: it ran before the
  // mint, and the diner spent the next minute typing a card number.
  //
  // An unreadable catalog is NOT "everything is available" (Codex #203 P1). The gate upstream fails
  // open on purpose — blocking every diner on a blip is worse than a rare refund — but here that
  // same silence would capture the full hold for a basket that may contain a dish nobody can make.
  // Retrying costs nothing: the authorization stands untouched until Stripe redelivers.
  const read = await unavailableLines(cartId);
  if (!read.ok) return { kind: "retry", note: "catalog unreadable" };
  const gone = read.lines;

  // Called UNCONDITIONALLY, empty list included. It is the precheck as much as the void: it proves
  // the cart is still open and that this payer still holds its lock. Running it only when there is
  // something to drop would leave the ordinary all-available capture with no check at all — and a
  // hold can outlive its basket, whether or not a dish ran out.
  const { data: voided, error: voidErr } = await db.rpc("mms_settle_precheck_and_void", {
    p_cart: cartId,
    p_menu_ids: gone.map((g) => g.id),
    p_payer: payerUid,
    // `|| null` rather than the raw string: `attemptStamp` is `locked_at ?? ""` at mint time, and an
    // empty string does not cast to timestamptz — the RPC would error, this would answer `retry`,
    // and Stripe would redeliver into the same error for 72h while the hold stood. A null is the
    // honest input for "we cannot name our era", and the RPC's `is distinct from` refuses it as -2,
    // which cancels the hold. Refusing beats an unrecoverable retry budget on a money path.
    p_attempt: orNull(attempt),
    // W23d — which attempt each dropped line belongs to, so the fulfillment snapshot can scope to
    // it and a re-order in the same still-open cart cannot inherit this attempt's drops.
    p_intent: intentId,
  });
  if (voidErr) {
    console.error("[manual-capture] precheck/void failed", {
      intentId,
      cartId,
      error: voidErr.message,
    });
    return { kind: "retry", note: "precheck failed" };
  }
  if (voided === -1) {
    // The cart is no longer open: settled or cleared out of band while this hold stood.
    if (!(await markCanceled(intentId, cartId, "cart_not_open", payerUid, attempt)))
      return { kind: "retry", note: "verdict not recorded" };
    if (!(await cancelHold(intentId, "cart no longer open")))
      return { kind: "retry", note: "cancel failed" };
    await releaseOurLock(cartId, payerUid);
    return { kind: "canceled", reason: "cart no longer open" };
  }
  if (voided === -2) {
    // The lock belongs to someone else, or to a LATER attempt by this same diner — either way this
    // authorization's era is over and it has no claim on the cart, nor on its lock.
    //
    // W23d records this one too, and the reason is the diner standing on /track: their hold IS being
    // cancelled, and the give-up card would otherwise tell them their payment went through. The
    // verdict is keyed on the PaymentIntent, so it describes THIS attempt only and cannot paint over
    // the successor's — which is exactly why the cancellation ledger is per-intent and not per-cart.
    if (!(await markCanceled(intentId, cartId, "superseded", payerUid, attempt)))
      return { kind: "retry", note: "verdict not recorded" };
    if (!(await cancelHold(intentId, "lock lost to another payer")))
      return { kind: "retry", note: "cancel failed" };
    return { kind: "canceled", reason: "lock lost to another payer" };
  }
  if (gone.length > 0 && (voided ?? 0) === 0) {
    // We were told lines had to go and none did. Rather than reason about WHY (a predicate drifting
    // between the gate and the RPC is exactly how the comped-line hole appeared), refuse to capture:
    // the basket still contains something the kitchen cannot make.
    console.error("[manual-capture] nothing voided despite unavailable lines", {
      intentId,
      cartId,
    });
    return { kind: "retry", note: "void matched no lines" };
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
    if (!(await markCanceled(intentId, cartId, plan.reason, payerUid, attempt)))
      return { kind: "retry", note: "verdict not recorded" };
    if (!(await cancelHold(intentId, plan.reason))) return { kind: "retry", note: "cancel failed" };
    await releaseOurLock(cartId, payerUid);
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
 * W23d — record that this authorization was CANCELLED, before the hold is released.
 *
 * ⚠️ THE ORDERING IS THE POINT, and it is the opposite of what "do the real work first" suggests.
 * A failed CANCEL is retryable: the intent is still `requires_capture`, so Stripe's redelivery
 * re-enters this function and tries again. A lost VERDICT is not — the moment the hold is cancelled,
 * the `live.status !== "requires_capture"` guard at the top short-circuits every future delivery to
 * `already`, and this line never runs again. Cancel-then-mark would therefore strand the guest on
 * "your payment is safe — show this screen to staff" permanently on one transient DB failure, for a
 * hold that was cancelled. Marking first costs nothing when the cancel then fails: the row describes
 * a hold that is about to be released, which is exactly what `SETTLE_CANCELED_NOTE` says either way.
 *
 * The reason is typed as `SettleCancelReason` rather than `string` so a code the column's CHECK
 * would refuse cannot be written from here — the enum and the constraint are the same vocabulary.
 * `unknown` is excluded because it is the READER's degradation, never a stored value.
 *
 * `attempt` is forensics only, so an unparseable one becomes null rather than failing the write:
 * losing the era is survivable, losing the verdict is not.
 */
async function markCanceled(
  intentId: string,
  cartId: string,
  reason: Exclude<SettleCancelReason, "unknown">,
  payerUid: string,
  attempt: string,
): Promise<boolean> {
  const { error } = await serviceClient().rpc("mms_mark_settle_canceled", {
    p_intent: intentId,
    p_cart: cartId,
    p_reason: reason,
    // An empty metadata uid would fail the uuid cast; null is the honest value, and it simply means
    // no diner can be authorized to read this verdict (fail-closed) rather than that anyone can.
    p_payer: orNull(payerUid),
    p_attempt: orNull(attempt),
  });
  if (error) {
    console.error("[manual-capture] cancellation verdict not recorded", {
      intentId,
      cartId,
      reason,
      error: error.message,
    });
    return false;
  }
  return true;
}

/**
 * Cancel the hold, and say whether it actually went.
 *
 * The first version swallowed the failure on the grounds that an uncancelled authorization is "not a
 * charge, just untidy". That was wrong (Codex round 2): a hold ties up the guest's available funds
 * for days, on a card they may need, for an order they are not getting. It is not tidiness — it is
 * the most user-visible thing this path can leave behind.
 *
 * Cancellation is idempotent and no money has moved, so a transient failure is safe to retry: the
 * caller turns a `false` into a 5xx and Stripe redelivers. What must NOT happen is a 200 that ends
 * the event forever with the hold still standing.
 */
async function cancelHold(intentId: string, reason: string): Promise<boolean> {
  try {
    await getStripe().paymentIntents.cancel(intentId);
    return true;
  } catch (e) {
    console.error("[manual-capture] cancel failed", { intentId, reason, error: e });
    return false;
  }
}

/**
 * Release the pay lock this authorization was holding, scoped to its own payer.
 *
 * Only on the outcomes we OWN — nothing left to sell, or a total that outgrew its hold. The
 * lock-lost branch deliberately does not come here: that lock belongs to somebody else now, and
 * `releaseCartLock` is uid-scoped precisely so one settlement cannot clear another's.
 *
 * Without this the cart stays frozen for the rest of the five-minute TTL after a settlement that has
 * definitively ended — and `payment_intent.canceled` only handles split and Terminal intents, so no
 * later event would have released it.
 */
async function releaseOurLock(cartId: string, payerUid: string): Promise<void> {
  const err = await releaseCartLock(cartId, payerUid);
  if (err) console.error("[manual-capture] lock release failed", { cartId, message: err.message });
}
