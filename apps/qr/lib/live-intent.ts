/**
 * M151 · M152 · M124 — the cart→intent link, and what a successor may do to a PREDECESSOR.
 *
 * ## The missing fact
 *
 * Every pin-clearer in this repo answered one question — "does the attempt that took this lock
 * still own it?" — with `locked_at`, a wall-clock era. Three holes all reduced to the same absence:
 * nothing on the cart said WHICH PaymentIntent, if any, still depended on the pin.
 *
 *   • M151 — two overlapping create-intents by one diner: B re-acquires (same uid, fresh era),
 *     clears A's pin under its own era and re-pins; A's intent is never cancelled and stays
 *     confirmable at A's amount while fulfilment re-derives against B's pin.
 *   • M152 (a) — a tablemate's `applyPromo` five minutes after a captured intent: the TTL-aware
 *     freeze predicate lets the write through and nulls the pin the delayed webhook reconciles
 *     against. (b) — `create-intent`'s stale-grant release, when the predecessor captured and its
 *     webhook is merely late. (c) — the outer catch, which fires from above the pin block and clears
 *     a pin that belongs to whichever predecessor is still live.
 *   • M124 — `locked_at` is minted before the await, so two same-uid requests inside one
 *     millisecond share an era, and an abandon from one matches the other.
 *
 * `qr_carts.live_payment_intent_id` is that fact. It is written by `create-intent` only after the
 * mint, under the era that minted it; every pin-clearer carries `and live_payment_intent_id is
 * null`; and a successor must make the predecessor UNUSABLE — cancel it at Stripe — before it may
 * replace the pin. The discriminator is the PaymentIntent id, which is distinct by construction
 * rather than by wall-clock separation, so the release paths keyed on it cannot collide the way
 * M124's era did.
 *
 * ## Why the verdict is a pure module
 *
 * The decision "given this Stripe status, may the successor cancel it?" is the load-bearing rule
 * and it is one function of one string. `create-intent` carries a coverage exemption (it is glue
 * over pinned halves), so a rule written inline there could not be mutated; here it is falsified by
 * a value (the W17 lesson, in CLAUDE.md).
 *
 * ## Fail CLOSED on anything we do not recognise
 *
 * A status this module has never seen is treated as `captured` — never cancel, refuse the
 * successor — because the two mistakes are not symmetric. Cancelling a charge that was real is
 * money the guest paid and an order nobody cooks; refusing a mint that could have proceeded is a
 * retry. The same asymmetry `split-hold.ts` documents for `payment_intent_unexpected_state`.
 */

/** What a successor may do with the intent the cart still names. */
export type LiveIntentVerdict =
  /** Not yet charged and not committed — cancel it, then the pin may be replaced. */
  | "cancelable"
  /** A charge exists or is committed (`succeeded` · `processing`) — REFUSE the successor. */
  | "captured"
  /** Already cancelled at Stripe — nothing to cancel; clear the link and proceed. */
  | "dead";

/**
 * Classify a Stripe PaymentIntent status for supersession.
 *
 * `requires_capture` is CANCELABLE on purpose: it is an authorized pickup hold a LATER attempt is
 * checking out past, and the capture cron already refuses to capture a hold whose era was
 * superseded (`mms_settle_precheck_and_void` → -2). Cancelling it here turns "two holds on the
 * guest's card until fire time" into one, and loses nothing the era gate had not already lost —
 * PROVIDED the cancellation is recorded, which `supersedeCartIntent` does for exactly this kind.
 *
 * ⚠️ "A later attempt" is NOT "the same diner" (blind pass on #257, SECURITY 1 — an earlier draft
 * of this sentence said same-uid, and `acquireCartLock`'s `locked_at.lte.<cutoff>` disjunct says
 * otherwise: any member may take the lock once the holder's era is older than the TTL). The
 * verdict does not depend on who: one live intent per cart, and the lock decides whose.
 */
export function classifyLiveIntent(status: string): LiveIntentVerdict {
  switch (status) {
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "requires_capture":
      return "cancelable";
    case "canceled":
      return "dead";
    case "succeeded":
    case "processing":
      return "captured";
    default:
      return "captured";
  }
}

/**
 * The outcome of trying to make a predecessor unusable. `cleared` means the link may be dropped
 * and the pin replaced; `captured` means the successor must refuse; `unknown` means we could not
 * establish either and must refuse WITHOUT touching anything (a transport failure is not a verdict —
 * M119's rule, one hop out).
 */
export type SupersedeOutcome = "cleared" | "captured" | "unknown";

/**
 * Fold a cancel attempt's result into an outcome. Pure so the arm table is testable without a
 * Stripe client: `cancelled` is whether the cancel call returned, `code` is the Stripe error code
 * when it threw, `statusAfter` is a re-read taken only when the refusal was a state refusal.
 */
export function supersedeOutcome(input: {
  verdict: LiveIntentVerdict;
  cancelled: boolean;
  code: string | null;
  statusAfter: string | null;
}): SupersedeOutcome {
  if (input.verdict === "captured") return "captured";
  if (input.verdict === "dead") return "cleared";
  if (input.cancelled) return "cleared";
  // The cancel threw. Only a STATE refusal says anything about the intent; everything else
  // (429, 5xx, timeout) says nothing, and nothing is what we report.
  if (input.code === "resource_missing") return "cleared";
  if (input.code !== "payment_intent_unexpected_state") return "unknown";
  if (input.statusAfter === null) return "unknown";
  // Re-read after the refusal: the intent moved between our retrieve and our cancel.
  const again = classifyLiveIntent(input.statusAfter);
  if (again === "dead") return "cleared";
  if (again === "captured") return "captured";
  // Still cancelable yet Stripe refused — do not guess.
  return "unknown";
}
