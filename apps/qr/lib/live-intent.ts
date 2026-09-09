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
 * ⚠️ THE SETTLEMENT DOOR NEEDS A STRICTER TABLE, AND `requires_capture` IS WHY (blind adversarial
 * pass on #275, CRITICAL 1).
 *
 * `classifyLiveIntent` calls an authorized hold CANCELABLE, and the reason it gives is specific to
 * ONE caller: create-intent's successor has taken the pay-lock with a fresh era, and
 * `mms_settle_precheck_and_void` refuses to capture a hold whose era was superseded (→ -2). So the
 * cron was never going to take that money anyway, and cancelling it early loses nothing.
 *
 * `acquireSettlementSuperseding` does NOT supersede the era. Its statement writes `settle_at` and
 * `settle_by` and touches neither `locked`, `locked_by` nor `locked_at` — so the precheck would NOT
 * have answered -2 and the cron WOULD have captured. A staff cash settle reusing the lenient table
 * therefore VOIDS a guest's authorized pickup payment, writes `/track` a "this payment was replaced"
 * row for a replacement that never happened, and — if anything downstream then refuses (a rival
 * settlement winning the retry, a totals read failing, a zero amount) — leaves a pre-authorized
 * order with no payment at all and nothing collected.
 *
 * `openCartFor` filters on `session_id` + `status = 'open'` with NO mode filter, so a pickup cart
 * holding an authorization is reachable from every staff settle surface. This is not hypothetical.
 *
 * So for settlement an authorization is treated as `captured`: money the guest has committed, which
 * a different tender must refuse rather than destroy. The asymmetry is the same one this file's
 * header states — refusing a settle that could have proceeded is a retry; cancelling a real
 * authorization is the guest's money.
 */
export function classifyLiveIntentForSettlement(status: string): LiveIntentVerdict {
  if (status === "requires_capture") return "captured";
  return classifyLiveIntent(status);
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

/**
 * What an off-session charge THREW, classified — the same "unknowable is never a verdict" rule
 * `supersedeOutcome` applies above, for the other direction of the same problem.
 *
 * `closeSecureTab` charges a stored card with `confirm: true`. When that call throws it used to
 * report EVERY exception to staff as "The card on file was declined — settle by cash or a fresh
 * card", and release the settlement freeze. For a real decline that is right. For a connection
 * reset, a 429, a 5xx or a timeout it is a fabricated verdict about money that may already have
 * moved: the PaymentIntent was created with `confirm: true`, so it can be captured while the
 * response never arrives. Staff read "declined", take cash, and the succeeded webhook then lands on
 * the cross-tender guard and writes a `qr_refunds_needed` row — the guest is collected twice and
 * waits on a manual refund.
 *
 * Only Stripe's CARD error says the money did not move. Everything else says nothing.
 *
 * Kept here, pure, rather than inline in the route: the caller needs a live Stripe, a secure-tab row
 * and a totals read to reach its catch, so an inline predicate could only be falsified through five
 * mocks — while the rule itself is a value in, a verdict out (CLAUDE.md: decision logic belongs in
 * `lib/`, "finer-grained, not merely possible").
 */
export type OffSessionChargeOutcome = "declined" | "needs_action" | "unknown";

export function offSessionChargeOutcome(err: {
  type?: string | null;
  code?: string | null;
}): OffSessionChargeOutcome {
  // `StripeCardError` is the issuer's answer: card_declined, insufficient_funds,
  // authentication_required. The charge did NOT happen and the table is free to try another tender.
  if (err.type !== "StripeCardError") return "unknown";
  // A card that needs SCA is a decline with a different remedy — the guest must confirm in person,
  // so the copy must not tell staff the card was refused outright.
  if (err.code === "authentication_required") return "needs_action";
  return "declined";
}
