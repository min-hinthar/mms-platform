"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { serviceClient } from "@mms/db/server";
import { settleCashInput, terminalPollInput } from "@mms/db/schemas";
import { staffGate, STAFF_WRITE_OUTAGE } from "./staff";
import { openCartFor } from "./staff-open-cart";
import { getCartTotals } from "./totals";
import { paymentInFlightReason } from "./pay-guard";
import { acquireSettlement, releaseSettlement, extendSettlement } from "./lock";
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

  // The race-closing claim, BEFORE any money derivation (S1-audit B2 / HANDOFF's Terminal warning):
  // once held, a diner's create-intent and a concurrent cash settle are refused for the window.
  const freeze = await acquireSettlement(cart.id, caller.uid);
  if (freeze !== "acquired")
    return {
      ok: false,
      error:
        freeze === "closed"
          ? "That table is no longer open."
          : "Someone’s already paying on their phone — wait for that to finish.",
    };

  // Post-freeze awaits release on every failure path (closeSecureTab's discipline — the success
  // path deliberately HOLDS the freeze, so no blanket finally).
  const totals = await getCartTotals(cart.id, 0).catch(() => null); // tip 0 — the counter rule
  if (!totals) {
    await releaseSettlement(cart.id);
    console.error("[terminal] settleCard totals failed", { sessionId, cartId: cart.id });
    return { ok: false, error: "Couldn’t total this order just now — try again." };
  }
  const amount = totals.totalCents;
  if (amount <= 0) {
    await releaseSettlement(cart.id);
    return { ok: false, error: "There’s nothing on this table to settle." };
  }

  const stripe = getStripe();
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
        metadata: {
          cartId: cart.id,
          tipRate: "0",
          kind: "terminal",
          settledByStaffId: caller.staffId,
        },
      },
      // Per-ATTEMPT idempotency key (the closeSecureTab lesson): a STABLE key caches a decline for
      // 24h, permanently blocking re-collect after the guest fixes the card. The FREEZE is the
      // double-charge guard; qr_refunds_needed is the freeze-TTL-orphan ledger.
      { idempotencyKey: `pi_${cart.id}_term_${crypto.randomUUID()}` },
    );
    intentId = intent.id;
  } catch (e) {
    await releaseSettlement(cart.id);
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
    await releaseSettlement(cart.id);
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
    return { ok: false, error: "Couldn’t check the reader just now — still trying." };
  }
  // Only OUR reader PIs are pollable — the id is a handle, the metadata is the authority.
  const cartId = intent.metadata?.cartId;
  if (intent.metadata?.kind !== "terminal" || !cartId)
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
      return { ok: true, state: "succeeded", orderId: null, totalCents: intent.amount };
    }
    if (order) {
      revalidatePath("/staff");
      revalidatePath(`/staff/table/${parsed.data.sessionId}`);
    }
    return { ok: true, state: "succeeded", orderId: order?.id ?? null, totalCents: intent.amount };
  }
  if (intent.status === "canceled") return { ok: true, state: "canceled" };
  if (intent.status === "requires_payment_method" && intent.last_payment_error) {
    // The reader collected and the charge DECLINED (a fresh mint has no last_payment_error). The
    // webhook's payment_failed arm releases the freeze; retry re-runs settleCard (same-uid
    // re-acquire is idempotent if the release hasn't landed yet).
    return { ok: true, state: "failed", error: declineCopy(intent.last_payment_error.code) };
  }
  // requires_payment_method (fresh) / processing — the customer is mid-interaction: keep the
  // freeze alive so the collect can outlast the 10-min TTL without the cart being taken over.
  await extendSettlement(cartId);
  return { ok: true, state: "collecting" };
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
  if (intent.metadata?.kind !== "terminal" || !cartId)
    return { ok: false, error: "Invalid request." };

  const readerId = process.env.STRIPE_TERMINAL_READER_ID;
  if (readerId) {
    // Best-effort: the reader may have already finished/failed the action.
    await stripe.terminal.readers.cancelAction(readerId).catch((e) => {
      console.error("[terminal] cancelAction failed", {
        paymentIntent: paymentIntentId,
        code: (e as { code?: string }).code,
      });
    });
  }
  try {
    await stripe.paymentIntents.cancel(intent.id);
  } catch (e) {
    // Already succeeded (the tap won the race) or processing — money is moving; the webhook owns
    // the lifecycle and the freeze stays held.
    console.error("[terminal] PI cancel refused", {
      paymentIntent: intent.id,
      code: (e as { code?: string }).code,
    });
    return { ok: false, error: "Too late to cancel — the payment already went through." };
  }
  const settleErr = await releaseSettlement(cartId);
  if (settleErr)
    console.error("[terminal] cancel release failed", { cartId, message: settleErr.message });
  return { ok: true };
}
