import "server-only";
import { serviceClient } from "@mms/db/server";
import type Stripe from "stripe";
import { getStripe } from "./stripe";
import {
  classifyLiveIntent,
  classifyLiveIntentForSettlement,
  supersedeOutcome,
  type LiveIntentVerdict,
  type SupersedeOutcome,
} from "./live-intent";
import {
  acquireSettlement,
  claimStaleSettlement,
  readLiveIntent,
  releaseByIntent,
  releaseSettlement,
  readLiveIntentFor,
  releasePayAttempt,
  unlinkPaymentIntent,
  type ReleaseError,
  type SettleResult,
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
  return (await supersedeIntent(intentId)).outcome;
}

/** What the retrieve read off the intent, beyond its status — the metadata a hold carries. */
type IntentMetadata = Record<string, string | undefined> | null | undefined;

/**
 * The sequence itself. Alongside the outcome it reports whether THIS call cancelled a pickup hold
 * (`kind: "pickup_manual"` in the intent's own metadata), carrying the metadata the ledger row
 * needs — see `supersedeCartIntent` for why that row must exist. `null` on every other path: an
 * auto-capture intent, a hold that was already dead, a refused or failed cancel. Only a cancel WE
 * issued and Stripe accepted is a cancellation we may record as ours.
 */
async function supersedeIntent(
  intentId: string,
  /**
   * ⚠️ THE VERDICT TABLE IS A PARAMETER because the two doors do not agree about ONE status, and the
   * disagreement is the guest's money (blind pass on #275, CRITICAL 1). create-intent's successor
   * holds a fresh era, so the capture cron would refuse the predecessor's hold anyway and cancelling
   * it early costs nothing. A SETTLEMENT does not move the era, so that hold would still have been
   * captured — cancelling it there destroys an authorization the guest gave. Defaulted to the
   * create-intent table so every existing caller is unchanged.
   */
  classify: (status: string) => LiveIntentVerdict = classifyLiveIntent,
): Promise<{ outcome: SupersedeOutcome; cancelledHold: IntentMetadata }> {
  const stripe = getStripe();
  let status: string;
  let metadata: IntentMetadata = null;
  try {
    const live = await stripe.paymentIntents.retrieve(intentId);
    status = live.status;
    metadata = live.metadata as IntentMetadata;
  } catch (e) {
    // A vanished intent (test-mode data reset, a deleted account object) cannot capture anything.
    if ((e as { code?: string }).code === "resource_missing")
      return { outcome: "cleared", cancelledHold: null };
    return { outcome: "unknown", cancelledHold: null };
  }
  const verdict = classify(status);
  if (verdict !== "cancelable")
    return {
      outcome: supersedeOutcome({ verdict, cancelled: false, code: null, statusAfter: null }),
      cancelledHold: null,
    };
  try {
    await stripe.paymentIntents.cancel(intentId);
    return {
      outcome: supersedeOutcome({ verdict, cancelled: true, code: null, statusAfter: null }),
      cancelledHold: metadata?.kind === "pickup_manual" ? metadata : null,
    };
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
    return {
      outcome: supersedeOutcome({ verdict, cancelled: false, code, statusAfter }),
      cancelledHold: null,
    };
  }
}

/**
 * A superseded PICKUP HOLD gets its ledger row, or `/track` never learns it is gone.
 *
 * ⚠️ THIS IS THE RECORD THE CRON USED TO WRITE (blind adversarial pass on #257, CRITICAL 3). Before
 * the link, a hold whose era moved was superseded LAZILY: the capture cron refused it at fire time
 * and recorded `superseded` through `mms_mark_settle_canceled`, which is the row `/track`'s dropped
 * view renders as "This payment was replaced". Cancelling the hold EAGERLY here, at the successor's
 * create-intent, is the M151 rule — but the cron then meets an intent that is already `canceled`,
 * answers `already`, and writes nothing, so the diner's `/track?cart=` polls "authorized" forever
 * over a hold Stripe released minutes ago: the exact strand W23d's webhook comment describes. The
 * eager cancel therefore owes the same row the lazy one wrote, with the same reason, because it is
 * the same fact: a later attempt owns this cart now.
 *
 * `payer_uid` is the hold's `earnerUid` — the AUTHORIZATION for the diner-facing read (see the
 * column comment in `20260819300000_w23d_dropped_visibility.sql`) — and `attempt` is forensics
 * only, nulled when the metadata carried none (the same `orNull` rule `manual-capture-run.ts`
 * applies). The RPC's own cart update matches nothing under the successor's fresh era, by design:
 * the pin and link are the successor's to move, and it does so on the next two statements.
 *
 * Best-effort: the hold is already cancelled at Stripe, so refusing the successor here would undo
 * nothing and strand a second diner behind a bookkeeping write. The failure is logged, never
 * silent (W10c).
 */
async function recordSupersededHold(intentId: string, cartId: string, metadata: IntentMetadata) {
  const orNull = (v: string | undefined) => (v ? v : null) as unknown as string;
  const { error } = await serviceClient().rpc("mms_mark_settle_canceled", {
    p_intent: intentId,
    p_cart: cartId,
    p_reason: "superseded",
    p_payer: orNull(metadata?.earnerUid),
    p_attempt: orNull(metadata?.attempt),
  });
  if (error)
    console.error("[supersede] superseded hold not recorded — /track cannot say it was replaced", {
      cartId,
      intentId,
      error: error.message,
    });
}

/**
 * create-intent's step: if the cart names an intent, make it unusable, record it if it was a
 * pickup hold, and drop the link.
 *
 * Returns the outcome so the route can refuse honestly — `captured` is "that payment is already
 * going through", `unknown` is a 503 — and returns `cleared` immediately when there was nothing
 * to supersede, which is the ordinary first checkout.
 *
 * ⚠️ THE SUCCESSOR MAY BE ANOTHER DINER, and that is by design (blind pass on #257, SECURITY 1,
 * filed against a docblock that claimed otherwise). `acquireCartLock`'s third disjunct hands the
 * lock to ANY member once the holder's era is older than `CART_LOCK_TTL_MS`, so a tablemate's Pay
 * after five idle minutes cancels the holder's unconfirmed intent — mid-3DS, or an authorized
 * pickup hold. That is the M151 rule stated from the other side: ONE live intent per cart, and the
 * lock decides whose. Before the link the same takeover minted a SECOND live intent instead (the
 * overlap M151 names); for a hold the cron superseded the first one lazily at fire time, which is
 * the record `recordSupersededHold` now writes eagerly, so `/track` says so either way.
 */
export async function supersedeCartIntent(
  cartId: string,
  classify: (status: string) => LiveIntentVerdict = classifyLiveIntent,
): Promise<SupersedeOutcome> {
  const live = await readLiveIntent(cartId);
  if (!live) return "cleared";
  const { outcome, cancelledHold } = await supersedeIntent(live, classify);
  if (outcome !== "cleared") return outcome;
  if (cancelledHold) await recordSupersededHold(live, cartId, cancelledHold);
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

/**
 * The settlement door's superseder: takes the CART and the INTENT it named, and refuses anything
 * that could be committed money.
 *
 * ## Why this function exists at all (Codex round 3 on #275, P1)
 *
 * The takeover used to pass its diagnosed PaymentIntent id into a seam whose default was
 * `supersedeCartIntent` — a function whose first parameter is a CART id. Both are `string`, so
 * nothing typechecked wrong; in production it looked up a cart named `pi_…`, found none, returned
 * `"cleared"` WITHOUT EVER CALLING STRIPE, and the takeover then cleared the real cart's pin and
 * link and let staff settle while the diner's intent stayed confirmable. A double collect,
 * introduced by the fix for the previous round's finding. The unit test could not see it either:
 * its fake recorded the argument and asserted the intent id was passed, which is precisely the bug.
 *
 * So the parameters are now NAMED for what they are and the function is intent-level by
 * construction. A caller cannot get this wrong by passing the right type to the wrong slot.
 *
 * ## Why manual capture is refused by KIND, not by status (Codex round 3, P1)
 *
 * `classifyLiveIntentForSettlement` treats `requires_capture` as committed money, and that is
 * right — but a status is a SNAPSHOT. The DB claim stops a new `acquireCartLock`; it cannot stop
 * the Payment Element the diner already has mounted from confirming with its existing client
 * secret. So an intent read as `requires_action` can become `requires_capture` between our retrieve
 * and our cancel, and Stripe still permits cancelling that — staff would revoke an authorization
 * the guest had just given. A manual-capture intent is therefore refused in EVERY non-terminal
 * state, on the intent's own `capture_method` (and the `pickup_manual` metadata as a belt), which
 * is a fact about the intent rather than a race-able reading of it.
 */
export async function supersedeSettlementIntent(
  cartId: string,
  intentId: string,
): Promise<SupersedeOutcome> {
  const stripe = getStripe();
  let live: Stripe.PaymentIntent;
  try {
    live = await stripe.paymentIntents.retrieve(intentId);
  } catch (e) {
    // A vanished intent cannot capture anything; anything else tells us nothing.
    if ((e as { code?: string }).code === "resource_missing") return "cleared";
    return "unknown";
  }
  // Terminal first: an already-cancelled hold is not money, and refusing it would leave the
  // deadlock in place for exactly the carts this path exists to free.
  if (live.status === "canceled") return "cleared";
  const metadata = live.metadata as IntentMetadata;
  if (live.capture_method === "manual" || metadata?.kind === "pickup_manual") return "captured";

  const { outcome, cancelledHold } = await supersedeIntent(
    intentId,
    classifyLiveIntentForSettlement,
  );
  // A hold cannot reach here (refused above), so this is belt-and-braces for a future kind that
  // carries the metadata without the manual capture method.
  if (outcome === "cleared" && cancelledHold)
    await recordSupersededHold(intentId, cartId, cancelledHold);
  return outcome;
}

export type SafeRelease =
  | { released: true; error: null }
  | { released: false; error: ReleaseError; reason?: "paying" | "unknown" };

/**
 * The client exits ("Edit order", the pagehide beacon): cancel THIS attempt's intent, then run the
 * one-statement era-scoped release that also drops the link.
 *
 * No ledger row is written here, deliberately: `superseded` means a LATER attempt owns the cart,
 * and a diner ending their own attempt is not that. A pickup hold cannot reach this path today —
 * the Element hard-redirects to `/track` on authorization and the attempt token lives in component
 * state, so no client holds a token for an authorized hold — which is why the sentence for
 * "you cancelled your own hold" does not exist yet. If a token ever survives that redirect, the
 * reason set in `qr_settlement_cancellations`' CHECK needs a new member before this may cancel one.
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

/**
 * M197 — acquire the settlement freeze, superseding an ABANDONED pay attempt if one is in the way.
 *
 * ## Why the acquire alone is not enough
 *
 * `acquireSettlement` can now take over a stale pay-lock, but only when the attempt that held it
 * named no PaymentIntent. That covers an abandoned tab, a create-intent that failed before the mint,
 * and an intent whose terminal webhook already dropped the link — and it deliberately does NOT cover
 * the case the whole item is about, because a named intent is still confirmable and settlement
 * collects through a different channel. Age alone is not evidence; the intent's Stripe status is.
 *
 * So this is the same sequence `create-intent` runs at the pay boundary, applied to the other side
 * of the table: read the verdict, cancel the predecessor if Stripe says we may, and only then take
 * the freeze. `supersedeCartIntent` refuses on `captured` (the card IS charging — the webhook is
 * about to fulfil, and collecting cash on top is the double-charge) and on `unknown` (a transport
 * failure is not a verdict).
 *
 * ## The retry is ONE, and it is not a loop
 *
 * After a successful supersede the link is null and the era is still stale, so the second acquire
 * takes the same disjunct the first one missed. If it STILL fails, something else changed under us —
 * a fresh lock, a rival settlement, the cart closing — and that is a real answer to report, not a
 * reason to go round again.
 */
export type SettleTakeover =
  | Exclude<SettleResult, "locked_stale">
  /** The stale attempt's intent is charging or charged — refuse, and say so in those terms. */
  | "paying";

/**
 * ⚠️ `supersede` IS A DEFAULTED PARAMETER, and that is what makes this function's arms reachable.
 *
 * The composition is the load-bearing part — which outcomes may proceed to a second acquire and
 * which must refuse — and a `captured` reaching the retry is staff taking cash on a card that is
 * already charging. But `supersedeCartIntent` is a module-local binding, so a test could only reach
 * those arms through a live Stripe: `vi.spyOn` on the namespace does not rebind a local call, and
 * mocking the module under test is not a thing. Falsifying a rule THROUGH five mocks of a client the
 * decision never touches is the shape CLAUDE.md warns about; the same precedent (`tipPresets` taking
 * its ladder as a defaulted parameter) exists for the same reason — `verify:slice` caught a cap
 * mutant SURVIVING because the rule could not be reached, and the fix was to make it reachable, not
 * to delete the mutant.
 *
 * Production never passes it.
 */
export async function acquireSettlementSuperseding(
  cartId: string,
  uid: string,
  /**
   * ⚠️ TWO NAMED PARAMETERS, and the default is INTENT-LEVEL. The previous shape took `(id,
   * classify)` and defaulted to the CART-level `supersedeCartIntent`, so passing the diagnosed
   * intent id compiled cleanly and did nothing at Stripe (Codex round 3, P1). Naming both is what
   * makes that class of mistake impossible rather than merely fixed.
   */
  supersede: (
    cartId: string,
    intentId: string,
  ) => Promise<SupersedeOutcome> = supersedeSettlementIntent,
): Promise<SettleTakeover> {
  const first = await acquireSettlement(cartId, uid);
  if (first !== "locked_stale") return first;

  // ⚠️ EVERY STEP BELOW IS WRAPPED, because two of them THROW rather than answering (Codex round 2,
  // P2). `readLiveIntent` rethrows its postgrest error and `getStripe()` throws on a missing or
  // mode-mismatched key — and this function is awaited by Server Actions that set `busy` before the
  // call and have no catch of their own, so an escaping rejection latches the staff control instead
  // of showing the retryable sentence this union exists to carry. A failure here is `unavailable`.
  // ⚠️ TRACKED ACROSS THE TRY (Codex round 3, P2). Once the claim lands the freeze is a real block
  // on every tender; a throw after that point converted to `unavailable` while LEAVING it held, so
  // the retryable answer stranded the table for the settle TTL over a step that never ran.
  let claimHeld = false;
  try {
    // The attempt we DIAGNOSED, named. Everything after this acts on this id and nothing else.
    const live = await readLiveIntent(cartId);
    // The row stopped naming an intent between the acquire and this read — so the thing that made it
    // `locked_stale` is gone. Re-ask rather than guess; the plain acquire can now take it.
    if (!live) return collapse(await acquireSettlement(cartId, uid));

    // ⚠️ CLAIM BEFORE CANCELLING (Codex round 2, P1). Until this succeeds we hold NO mutex, and the
    // diner can re-acquire the pay lock and link a live intent in the gap — which the old code then
    // cancelled, killing an actively resumed checkout and still refusing staff. A fresh `settle_at`
    // blocks `acquireCartLock`, so this freezes the exact state we diagnosed; and the predicate
    // names THIS intent, so a create-intent that superseded and relinked in the meantime matches
    // zero rows. See `claimStaleSettlement`.
    const { claimed, error: claimErr } = await claimStaleSettlement(cartId, uid, live);
    if (claimErr) {
      console.error("[settle] stale-attempt claim failed", { cartId, error: claimErr.message });
      return "unavailable";
    }
    // Something moved under us. Re-ask the ordinary way and report whatever it now says.
    if (!claimed) return collapse(await acquireSettlement(cartId, uid));

    // From here the freeze is OURS, so every exit below must give it back. The strict verdict table
    // and the manual-capture refusal live inside `supersedeSettlementIntent`.
    claimHeld = true;
    const outcome = await supersede(cartId, live);
    if (outcome !== "cleared") {
      await releaseSettlement(cartId);
      // `unknown` is not "no" — it is "we could not tell". Reporting `locked` would tell staff a
      // diner is checking out when what actually happened is that we could not reach Stripe.
      return outcome === "captured" ? "paying" : "unavailable";
    }

    // ⚠️ THE CANCELLED ATTEMPT'S PROMO PIN GOES WITH IT (Codex round 2, P1). `supersedeCartIntent`
    // only unlinks, and it is right not to touch the pin for create-intent's sake — M70's rule is
    // that a pin must outlive the lock, because a captured-but-unfulfilled predecessor still
    // reconciles against it. That reason is spent here: we have just established this intent is
    // CANCELLED, so nothing depends on the pin, and leaving it makes `getCartTotals` hand staff the
    // frozen discount instead of re-evaluating a promotion that may have expired or hit its cap.
    // `releaseByIntent` clears pin AND link in one statement keyed on the intent, so a late webhook
    // naming a different one matches nothing.
    const { error: pinErr } = await releaseByIntent(cartId, live);
    if (pinErr) {
      // ⚠️ REFUSE, DO NOT PROCEED (Codex round 3, P2). Logging and returning `acquired` handed the
      // caller straight to `getCartTotals`, which reads the pin that is still on the row — so the
      // table is settled at the cancelled attempt's frozen discount, which is the exact defect
      // clearing the pin exists to prevent. The intent is already dead, so nothing is lost by
      // asking staff to tap again once the write succeeds.
      console.error("[settle] cancelled attempt's promo pin not cleared — refusing to settle", {
        cartId,
        intentId: live,
        error: pinErr.message,
      });
      await releaseSettlement(cartId);
      return "unavailable";
    }
    // The freeze is already ours, claimed above. No second acquire: re-running it would only risk
    // losing what we hold.
    return "acquired";
  } catch (e) {
    console.error("[settle] supersede step threw", {
      cartId,
      error: e instanceof Error ? e.message : String(e),
    });
    // Give back a freeze we took and then could not use. `releaseSettlement` is unconditional by
    // cart and idempotent, and it only runs when the claim actually landed.
    if (claimHeld) await releaseSettlement(cartId);
    return "unavailable";
  }
}

/** `locked_stale` has no arm at any call site, and a re-ask can still answer it (the link survived a
 *  failed unlink — M178). Report that as the retry it is, never as a diner who is paying. */
function collapse(r: SettleResult): SettleTakeover {
  return r === "locked_stale" ? "unavailable" : r;
}
