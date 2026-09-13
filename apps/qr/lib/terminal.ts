"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { serviceClient } from "@mms/db/server";
import { settleCashInput, terminalPollInput } from "@mms/db/schemas";
import { staffGate, STAFF_WRITE_OUTAGE } from "./staff";
import { openCartFor } from "./staff-open-cart";
import { getCartTotals } from "./totals";
import { paymentInFlightReason } from "./pay-guard";
import {
  acquireSettlement,
  releaseSettlementFor,
  extendSettlementFor,
  type SettleResult,
} from "./lock";
import { acquireSettlementSuperseding } from "./supersede";
import { settleRefusal } from "./settle-refusal";
import { getStripe } from "./stripe";
import { getPostHogClient } from "./posthog-server";

/**
 * Stripe Terminal at the register (W6c — M6·P6.2). SERVER-DRIVEN: the S700 is commanded through the
 * Stripe API from staff-gated actions — no client SDK, no connection tokens, and the reader never
 * sets a price (the PI amount is `getCartTotals`, the CLAUDE.md law). The charge fulfills through
 * the EXISTING signature-verified webhook (reconcile → `mms_fulfill_order`, idempotent on the PI
 * id), so this file moves no money itself — it opens the freeze, mints the intent, drives the
 * reader, and reports.
 *
 * The freeze lifecycle copies `closeSecureTab`, NOT `settleCash`: a Terminal charge is async
 * (reader collects → webhook fulfills), so success HOLDS the settlement freeze (the webhook's
 * open→paid flip is the terminal state; SETTLE_TTL + qr_refunds_needed are the orphan backstops)
 * and every failure/cancel path releases it. The status poll `extendSettlement`s while collecting
 * so a slow chip interaction can't outlive the 10-min TTL mid-collect (the map's central race:
 * past staleness, kioskReset / a diner mint / a new split can take the cart over a live reader PI).
 *
 * **The freeze is keyed by a per-ATTEMPT id, never the staff uid** (the review's confirmed HIGH).
 * The attempt id rides the PI metadata (`settleAttempt`) and EVERY release is scoped to it
 * (`releaseSettlementFor`), so a release that outlives its attempt — a late webhook
 * canceled/failed delivery after a cancel→retry, a stale panel, a double-tap loser — matches zero
 * rows instead of nulling a successor's live freeze. The attempt key also makes the acquire
 * STRICT by construction: the freeze is keyed on a per-request uuid, and since A3 `acquireSettlement`
 * has no same-owner re-acquire arm at all, so a concurrent second settleCard refuses instead of
 * sharing the freeze — the counter paths now key the same way (M201).
 * A decline is released by the POLL the moment it's observed (the attempt is dead — no live
 * authorization), so "try another card or cash" is immediately true; the webhook releases are the
 * scoped backstop for a closed register tab.
 *
 * Tip = 0 in v1 (`skip_tipping: true`, `tipRate: '0'`) — the webhook reconcile recomputes
 * getCartTotals(cartId, tipRate) and a reader-added dollar tip has no rate that reproduces it;
 * counter tips stay off-system, the cash rule. On-reader tipping is a registry follow-up.
 */

const READER_UNSET = "The card reader isn’t set up — settle by cash instead.";
/** Reader-drive failures, keyed by Stripe error code → honest staff copy. */
function readerFailCopy(code: string | undefined): string {
  if (code === "terminal_reader_offline")
    return "The card reader is offline — check its power and network, then try again.";
  if (code === "terminal_reader_busy")
    return "The reader is busy with another payment — finish or cancel that one first.";
  if (code === "terminal_reader_timeout")
    return "The reader didn’t respond — check its network and try again.";
  return "Couldn’t reach the card reader — try again, or settle by cash.";
}
/** Decline copy for the poll's failed state — the fixed error CODE, never the bank's freeform text. */
function declineCopy(code: string | undefined): string {
  if (code === "card_declined") return "The card was declined — try another card or cash.";
  if (code === "expired_card") return "That card is expired — try another card or cash.";
  if (code === "incorrect_pin" || code === "invalid_pin")
    return "The PIN didn’t match — try again or use another card.";
  return "The payment didn’t go through — try again or settle by cash.";
}

export type SettleCardResult =
  | { ok: true; paymentIntentId: string; totalCents: number }
  | { ok: false; error: string };

/**
 * Start a card-present settle: freeze the cart, mint the card_present PI, hand it to the reader.
 * Returns as soon as the reader is showing the charge — the register UI polls `terminalStatus`
 * from there. Every refusal is discriminated (the button awaits with no try/catch — a throw would
 * latch it on "Settling…", the W10c bug class).
 */
export async function settleCard(raw: unknown): Promise<SettleCardResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const caller = gate.caller;
  const parsed = settleCashInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sessionId } = parsed.data;

  // Feature-off when the reader env is unset (the /board opt-in pattern): refuse before any money
  // work — the UI also hides the Card option, but the action is the gate.
  const readerId = process.env.STRIPE_TERMINAL_READER_ID;
  if (!readerId) return { ok: false, error: READER_UNSET };

  const { session, cart, unavailable } = await openCartFor(sessionId);
  if (unavailable) return { ok: false, error: STAFF_WRITE_OUTAGE };
  if (!session) return { ok: false, error: "That table is closed." };
  if (!cart) return { ok: false, error: "This table has no open order to settle." };
  if (await paymentInFlightReason(cart))
    return {
      ok: false,
      error: "Someone’s already paying on their phone — wait for that to finish.",
    };

  const db = serviceClient();
  // W10b — a failed count is not an EMPTY table (settleCash's rule, verbatim).
  const { count, error: countError } = await db
    .from("qr_cart_items")
    .select("id", { count: "exact", head: true })
    .eq("cart_id", cart.id);
  if (countError) return { ok: false, error: STAFF_WRITE_OUTAGE };
  if ((count ?? 0) === 0) return { ok: false, error: "There’s nothing on this table to settle." };

  // Construct the Stripe client BEFORE the freeze: getStripe() throws on a missing secret, and a
  // throw with the freeze held would strand the table frozen for the TTL (review finding).
  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    console.error("[terminal] Stripe client unavailable", { error: e });
    return { ok: false, error: "Card payments aren’t available right now — settle by cash." };
  }

  // The race-closing claim, BEFORE any money derivation (S1-audit B2 / HANDOFF's Terminal warning):
  // once held, a diner's create-intent and a concurrent cash settle are refused for the window.
  // Keyed by a fresh per-ATTEMPT id: a same-staff double-tap can't ride the same-owner re-acquire
  // disjunct into a shared freeze — the loser refuses cleanly, having acquired (and thus owing)
  // nothing.
  const attemptId = crypto.randomUUID();
  const freeze = await acquireSettlementSuperseding(cart.id, attemptId);
  if (freeze !== "acquired")
    return {
      ok: false,
      error: settleRefusal(freeze),
    };

  // Post-freeze awaits release on every failure path (closeSecureTab's discipline — the success
  // path deliberately HOLDS the freeze, so no blanket finally). Releases are scoped to THIS
  // attempt: they can never null a freeze someone else has since acquired.
  const totals = await getCartTotals(cart.id, 0).catch(() => null); // tip 0 — the counter rule
  if (!totals) {
    await releaseSettlementFor(cart.id, attemptId);
    console.error("[terminal] settleCard totals failed", { sessionId, cartId: cart.id });
    return { ok: false, error: "Couldn’t total this order just now — try again." };
  }
  const amount = totals.totalCents;
  if (amount <= 0) {
    await releaseSettlementFor(cart.id, attemptId);
    return { ok: false, error: "There’s nothing on this table to settle." };
  }

  let intentId: string;
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: "usd",
        // card_present is its own create shape — never automatic_payment_methods (M6_DESIGN §3).
        // Automatic capture: process_payment_intent collects+confirms+captures in one reader flow,
        // and the manual-capture webhook arm is split_share-only (a manual Terminal PI would
        // authorize and then sit forever).
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        // The webhook contract: cartId routes fulfillment, tipRate '0' makes the reconcile exact,
        // kind 'terminal' keeps this PI out of split-share routing and drives attribution + the
        // counter-session close; NEVER 'split_share' (share-ledger code with no row to find).
        // settleAttempt scopes every later freeze release to THIS attempt's era.
        metadata: {
          cartId: cart.id,
          tipRate: "0",
          kind: "terminal",
          settledByStaffId: caller.staffId,
          settleAttempt: attemptId,
        },
      },
      // Per-ATTEMPT idempotency key (the closeSecureTab lesson): a STABLE key caches a decline for
      // 24h, permanently blocking re-collect after the guest fixes the card. The FREEZE is the
      // double-charge guard; qr_refunds_needed is the freeze-TTL-orphan ledger.
      { idempotencyKey: `pi_${cart.id}_term_${crypto.randomUUID()}` },
    );
    intentId = intent.id;
  } catch (e) {
    await releaseSettlementFor(cart.id, attemptId);
    console.error("[terminal] PI create failed", {
      sessionId,
      cartId: cart.id,
      code: (e as { code?: string }).code,
    });
    return { ok: false, error: "Couldn’t start the card payment — try again, or settle by cash." };
  }

  try {
    await stripe.terminal.readers.processPaymentIntent(readerId, {
      payment_intent: intentId,
      // v1 runs the reader tip-free: an on-reader tip mutates the amount AFTER mint and no rate
      // reproduces a dollar tip — every tipped tap would 409-loop the webhook reconcile.
      process_config: { skip_tipping: true },
    });
  } catch (e) {
    // Nothing was collected — the reader never showed the charge. Cancel the PI (best-effort; it
    // is requires_payment_method, so cancel succeeds or the webhook canceled arm mops up) and free
    // the table.
    const code = (e as { code?: string }).code;
    await stripe.paymentIntents.cancel(intentId).catch((cancelErr) => {
      console.error("[terminal] orphan PI cancel failed", {
        paymentIntent: intentId,
        code: (cancelErr as { code?: string }).code,
      });
    });
    await releaseSettlementFor(cart.id, attemptId);
    console.error("[terminal] processPaymentIntent failed", { sessionId, cartId: cart.id, code });
    return { ok: false, error: readerFailCopy(code) };
  }

  // The reader is live with the charge — the freeze stays HELD (the webhook fulfill is the
  // terminal state). The poll extends it while the customer interacts.
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "staff_settle_terminal_start",
          properties: { role: caller.role, mode: session.mode, sessionId, total_cents: amount },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort */
      }
    });
  }
  return { ok: true, paymentIntentId: intentId, totalCents: amount };
}

export type TerminalPollResult =
  | { ok: true; state: "collecting" }
  /** Charged. `orderId` is null until the webhook fulfill lands (usually < a poll interval). */
  | { ok: true; state: "succeeded"; orderId: string | null; totalCents: number }
  | { ok: true; state: "failed"; error: string }
  | { ok: true; state: "canceled" }
  | { ok: false; error: string };

/**
 * The register UI's collect-window poll. Reports the PI's truth AND slides the settlement freeze
 * forward while the customer is still interacting — `extendSettlement` only moves a STILL-FRESH
 * freeze, so it can never revive one an abort released (the split-tender pattern).
 */
export async function terminalStatus(raw: unknown): Promise<TerminalPollResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = terminalPollInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { paymentIntentId } = parsed.data;

  let intent;
  try {
    intent = await getStripe().paymentIntents.retrieve(paymentIntentId);
  } catch (e) {
    console.error("[terminal] poll retrieve failed", {
      paymentIntent: paymentIntentId,
      code: (e as { code?: string }).code,
    });
    return { ok: false, error: POLL_MISS_COPY };
  }
  // Only OUR reader PIs are pollable — the id is a handle, the metadata is the authority.
  const cartId = intent.metadata?.cartId;
  const attempt = intent.metadata?.settleAttempt;
  if (intent.metadata?.kind !== "terminal" || !cartId || !attempt)
    return { ok: false, error: "Invalid request." };

  if (intent.status === "succeeded") {
    // Fulfillment is the webhook's; report the order once it lands (idempotent PI-id lookup).
    const db = serviceClient();
    const { data: order, error: orderErr } = await db
      .from("qr_orders")
      .select("id")
      .eq("stripe_payment_intent_id", intent.id)
      .maybeSingle();
    if (orderErr) {
      console.error("[terminal] poll order lookup failed", {
        paymentIntent: intent.id,
        message: orderErr.message,
      });
    }
    if (order) {
      revalidatePath("/staff");
      revalidatePath(`/staff/table/${parsed.data.sessionId}`);
      return { ok: true, state: "succeeded", orderId: order.id, totalCents: intent.amount };
    }
    // Captured but not yet fulfilled — the window where the freeze matters MOST (money has moved,
    // the cart is still open). Keep it fresh, or a delayed webhook past the TTL hands the cart to
    // a cash settle and the guest is double-charged (review finding).
    //
    // ⚠️ AND SAY SO WHEN THERE IS NOTHING OF OURS TO EXTEND (A3 · M203). The unscoped
    // `extendSettlement` no-oped silently on a null or foreign freeze, so a mutex lost in this exact
    // window — the worst one — left no trace. Nothing can be undone here (the money has moved; the
    // webhook fulfils it, and its cross-tender guard writes `qr_refunds_needed` if cash landed
    // first), so the honest act is to log it loudly under the attempt, not to pretend.
    const { extended, error: extErr } = await extendSettlementFor(cartId, attempt);
    if (!extended)
      console.error("[terminal] captured attempt no longer holds the settlement freeze", {
        cartId,
        paymentIntent: intent.id,
        attempt,
        error: extErr?.message ?? null,
      });
    return { ok: true, state: "succeeded", orderId: null, totalCents: intent.amount };
  }
  if (intent.status === "canceled") return { ok: true, state: "canceled" };
  if (intent.status === "requires_payment_method" && intent.last_payment_error) {
    // The reader collected and the charge DECLINED (a fresh mint has no last_payment_error). The
    // attempt is dead — no live authorization — so release ITS freeze here and now, scoped to the
    // attempt: "try another card or cash" must be true the moment we say it, not after a webhook
    // lands (review finding: the pre-check refuses every retry while the dead freeze is fresh).
    // A stale panel polling an OLD attempt matches zero rows and harms nothing.
    const { error: relErr } = await releaseSettlementFor(cartId, attempt);
    if (relErr)
      console.error("[terminal] decline release failed", { cartId, message: relErr.message });
    return { ok: true, state: "failed", error: declineCopy(intent.last_payment_error.code) };
  }
  // requires_payment_method (fresh) / processing — the customer is mid-interaction: keep the
  // freeze alive so the collect can outlast the 10-min TTL without the cart being taken over.
  //
  // ⚠️ A MUTEX LOST MID-COLLECT ENDS THE COLLECT (A3 · M203 — the half of that row that stayed
  // live after A1 parked the share route). The old unscoped extend no-oped silently, so a reader
  // could keep prompting for a table a cash settle had since taken — the double-collect.
  // `extendSettlementFor` answers three ways here, and the blind pass on this diff is why they are
  // three and not one:
  //
  //   • `extended`          — ours and fresh: keep collecting.
  //   • an ERROR            — an OUTAGE, not a verdict. The first draft read it as "lost", cancelled
  //                           a live tap, and told staff the hold "was lost … being settled another
  //                           way" over a PostgREST hiccup — a fabricated diagnosis. A poll miss lets
  //                           the next tick ask again, which is what the retrieve failure above does.
  //   • zero rows, no error — nothing of ours was FRESH: the freeze aged past the TTL with nobody
  //                           taking it (a backgrounded tablet), or someone acquired it. A re-acquire
  //                           under the SAME attempt separates the two with the statement the counter
  //                           uses: it succeeds only on a free or stale freeze and refuses when a
  //                           colleague holds it fresh (or a diner holds the pay lock). Aged out and
  //                           free → we hold it again, keep collecting. Refused → the table is being
  //                           settled another way beside a live card prompt, so abandon the attempt
  //                           the way staff Cancel does and say what happened.
  const { extended, error: extErr } = await extendSettlementFor(cartId, attempt);
  if (extended) return { ok: true, state: "collecting" };
  if (extErr) {
    console.error("[terminal] settlement extend failed mid-collect — an outage, not a lost mutex", {
      cartId,
      paymentIntent: intent.id,
      attempt,
      error: extErr.message,
    });
    return { ok: false, error: POLL_MISS_COPY };
  }
  let back: SettleResult;
  try {
    back = await acquireSettlement(cartId, attempt);
  } catch (e) {
    console.error("[terminal] re-acquire threw mid-collect", {
      cartId,
      paymentIntent: intent.id,
      attempt,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: POLL_MISS_COPY };
  }
  if (back === "acquired") {
    console.warn("[terminal] settlement freeze re-acquired after aging out mid-collect", {
      cartId,
      paymentIntent: intent.id,
      attempt,
    });
    return { ok: true, state: "collecting" };
  }
  console.error("[terminal] settlement freeze lost mid-collect — abandoning the attempt", {
    cartId,
    paymentIntent: intent.id,
    attempt,
    refusal: back,
  });
  const abandoned = await abandonAttempt(getStripe(), intent);
  if (abandoned === "too_late")
    return { ok: true, state: "succeeded", orderId: null, totalCents: intent.amount };
  // We could not establish the intent's state — neither "paid" nor "nothing charged" is honest.
  if (abandoned === "unknown") return { ok: false, error: POLL_MISS_COPY };
  return { ok: true, state: "failed", error: LOST_HOLD_COPY };
}

/** The poll's transient-miss answer — the panel counts it and keeps Cancel available; the next
 *  tick asks again. Named ONCE because three arms now return it and they must read as one thing. */
const POLL_MISS_COPY = "Couldn’t check the reader just now — still trying.";

/**
 * The poll's copy for a lost mutex. Not a decline (`declineCopy`) — the card was never refused —
 * and not a reader fault (`readerFailCopy`): the table's settlement hold went to someone else while
 * the reader was still prompting. English only, like the two families beside it (K15 owns the
 * Terminal panel's copy as a set; see `settle.reader.*` in `lib/i18n/staff.ts`).
 */
const LOST_HOLD_COPY =
  "This table's payment hold was lost while the reader was waiting — nothing was charged. Check the table isn't being settled another way, then start again.";

/**
 * Abandon a Terminal attempt the way staff Cancel does — the reader's action first (only when its
 * live action IS this PaymentIntent, so a stale panel never wipes another table's prompt), then the
 * PaymentIntent. Three answers: `"canceled"` (nothing was charged), `"too_late"` (the tap already
 * succeeded or is processing — money is moving and the webhook owns the lifecycle from there), and
 * `"unknown"` (Stripe refused the cancel and we could not establish why). Shared by
 * `cancelTerminal` and the poll's lost-mutex arm so the sequence exists once.
 */
async function abandonAttempt(
  stripe: ReturnType<typeof getStripe>,
  intent: { id: string },
): Promise<"canceled" | "too_late" | "unknown"> {
  const readerId = process.env.STRIPE_TERMINAL_READER_ID;
  if (readerId) {
    // Clear the reader ONLY if its current action is THIS payment — cancelAction is reader-scoped,
    // and a stale panel's Cancel must never wipe a different table's live prompt mid-guest-
    // interaction (review finding). Best-effort throughout: the reader may be offline/idle.
    try {
      const reader = await stripe.terminal.readers.retrieve(readerId);
      const actionPi =
        !("deleted" in reader) && reader.action?.type === "process_payment_intent"
          ? (reader.action.process_payment_intent?.payment_intent ?? null)
          : null;
      const actionPiId = typeof actionPi === "string" ? actionPi : (actionPi?.id ?? null);
      if (actionPiId === intent.id) await stripe.terminal.readers.cancelAction(readerId);
    } catch (e) {
      console.error("[terminal] reader cancelAction failed", {
        paymentIntent: intent.id,
        code: (e as { code?: string }).code,
      });
    }
  }
  try {
    await stripe.paymentIntents.cancel(intent.id);
  } catch (e) {
    // ⚠️ THE ERROR CODE DOES NOT SAY WHY (blind pass on this diff, CRITICAL 1). Stripe answers
    // `payment_intent_unexpected_state` both for a tap that already SUCCEEDED and for an intent
    // already CANCELED (a second tablet's poll got there first), and a transport failure says
    // nothing at all. The first draft read every refusal as "the tap won", and the poll then
    // reported `succeeded` with a dollar total for money never taken. So ask the intent itself,
    // and answer only what its state actually says.
    console.error("[terminal] PI cancel refused", {
      paymentIntent: intent.id,
      code: (e as { code?: string }).code,
    });
    let status: string;
    try {
      status = (await stripe.paymentIntents.retrieve(intent.id)).status;
    } catch (re) {
      console.error("[terminal] PI re-read after a refused cancel failed", {
        paymentIntent: intent.id,
        code: (re as { code?: string }).code,
      });
      return "unknown";
    }
    if (status === "succeeded" || status === "processing") return "too_late";
    if (status === "canceled") return "canceled";
    // Still live: the cancel failed for a reason that was not the intent's state. Not a verdict.
    return "unknown";
  }
  return "canceled";
}

export type CancelTerminalResult = { ok: true } | { ok: false; error: string };

/**
 * Staff cancel mid-collect: clear the reader, cancel the PI, free the table. Ordering matters —
 * the reader first (so it stops prompting), then the PI, and the freeze is released ONLY after a
 * successful PI cancel: a PI that already succeeded/processing must keep the freeze (the webhook
 * fulfill owns it from there — "too late to cancel" is the honest answer).
 */
export async function cancelTerminal(raw: unknown): Promise<CancelTerminalResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = terminalPollInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { paymentIntentId } = parsed.data;

  const stripe = getStripe();
  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return { ok: false, error: "Couldn’t reach Stripe — try again." };
  }
  const cartId = intent.metadata?.cartId;
  const attempt = intent.metadata?.settleAttempt;
  if (intent.metadata?.kind !== "terminal" || !cartId || !attempt)
    return { ok: false, error: "Invalid request." };

  const outcome = await abandonAttempt(stripe, intent);
  if (outcome === "too_late")
    return { ok: false, error: "Too late to cancel — the payment already went through." };
  if (outcome === "unknown") return { ok: false, error: "Couldn’t reach Stripe — try again." };
  // Scoped to THIS attempt: a stale panel canceling an old orphaned PI can never null a newer
  // attempt's live freeze (the review's confirmed-HIGH era-confusion class).
  const { error: settleErr } = await releaseSettlementFor(cartId, attempt);
  if (settleErr)
    console.error("[terminal] cancel release failed", { cartId, message: settleErr.message });
  return { ok: true };
}
