import "server-only";
import { serviceClient } from "@mms/db/server";
import { getStripe } from "./stripe";
import { extendSettlement, releaseSettlement, CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock";

/**
 * Split-tender settlement orchestration (M3·P3.3b, Option A: authorize-all → capture-together). Driven
 * by the Stripe webhook:
 *   • a share authorizes (amount_capturable_updated) → mark `authorized`; once EVERY share is
 *     authorized/captured, CAPTURE all the authorized PIs together (no money moves until the whole
 *     table is covered).
 *   • a capture lands (payment_intent.succeeded) → mark `captured`; once all are captured, fulfill the
 *     ONE order (mms_fulfill_split_order — idempotent on the cart open→paid flip) and lift the freeze.
 * All steps are idempotent + safe under Stripe's ≤72h redelivery: re-marking is a no-op, re-capturing a
 * captured PI is tolerated, and fulfillment claims the cart atomically. Helpers THROW on a hard error
 * so the webhook can 5xx and let Stripe retry.
 *
 * W10c (M31) — that last sentence used to be FALSE for every call but one. postgrest-js resolves a
 * fetch failure into `{ data: null, error }` instead of rejecting, and these helpers discarded the
 * result of every write and destructured only `{ data }` on every read. So a DB outage produced
 * exactly the shape of success: the status update "worked", `cartIdForPi` returned null, the helper
 * returned early, and the webhook 200-ACKed — permanently consuming a Stripe event whose ONLY
 * durability mechanism is a non-2xx. Money transitions (a share authorized, a table captured) were
 * lost with no retry and no alarm.
 *
 * Every read and write below now checks `error` and throws, so the webhook's existing try/catch 5xxes
 * and Stripe redelivers for up to 72h. Throwing AFTER a Stripe capture is safe: re-capturing a
 * captured PI is explicitly tolerated (see the unexpected_state branch), so a redelivery re-converges.
 * The one thing that must never happen is silence.
 */

type ShareRow = { stripe_payment_intent_id: string | null; status: string; amount_cents: number };

/**
 * The cart a share's PI belongs to. `null` means a GENUINE no-row (an event for a PI we don't own —
 * e.g. a single-pay intent arriving on a split branch), which callers correctly treat as "nothing to
 * do". An unreadable row is NOT that, and must not masquerade as it: it throws.
 */
async function cartIdForPi(
  db: ReturnType<typeof serviceClient>,
  piId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("qr_cart_shares")
    .select("cart_id")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle();
  // maybeSingle() returns { data: null, error: null } for zero rows, so `error` here is always a real
  // failure — never the no-row case the null return is for.
  if (error) throw new Error(`cartIdForPi: share lookup failed — ${error.message}`);
  return data?.cart_id ?? null;
}

/**
 * What Stripe says about this PaymentIntent RIGHT NOW, or null when the PI can't exist.
 *
 * Both status handlers act on an event that may be up to 72h old and is not ordered relative to any
 * other, so neither may infer the current state from the event's own name. Everything but
 * `resource_missing` rethrows — a transport failure must 5xx and be retried, and a bad or restricted
 * key heals on a later redelivery once it is fixed.
 *
 * ⚠️ Round 5 — `resource_missing` is NOT the same answer for both callers, so it isn't the helper's
 * decision to make. For a FAILURE event there is genuinely nothing to record, so ACKing is right. For
 * an AUTHORIZATION event the thing we can't look up is a hold that Stripe just told us had landed:
 * swallowing that consumes its only notice and leaves the share `pending` while the hold expires. So
 * the caller says whether a permanent miss is fatal.
 */
async function livePaymentIntent(
  piId: string,
  opts: { missingIsFatal: boolean },
): Promise<{ status: string } | null> {
  try {
    return await getStripe().paymentIntents.retrieve(piId);
  } catch (e) {
    if ((e as { code?: string }).code === "resource_missing" && !opts.missingIsFatal) {
      console.error("[split-settle] PaymentIntent not found", { paymentIntent: piId });
      return null;
    }
    throw e;
  }
}

/** A share's PI was authorized (capture_method=manual confirmed). Mark it, then capture-all if ready. */
export async function onShareAuthorized(piId: string): Promise<void> {
  const db = serviceClient();
  // ⚠️ W10c pre-merge review, round 3 — the revival below has to be SYMMETRIC with `onShareFailed`:
  // ask Stripe whether the hold is live before re-opening a share that is currently `failed`.
  //
  // Widening the predicate without this check turned a clean failure into a charged one. The trace:
  // every share authorizes → `captureAllIfReady` captures P first and P's ISSUER declines the capture
  // → that is not `payment_intent_unexpected_state`, so it rethrows → 500, and Q and R are untouched
  // (nobody charged) → `payment_failed` marks P `failed` → then Stripe redelivers the ORIGINAL
  // `amount_capturable_updated` for P, which flips P back to `authorized` on a PaymentIntent that is
  // now DEAD → the all-authorized gate passes again → Q and R are really captured → P fails again and
  // ends `canceled`. Two diners charged, the order unfulfillable, and the host's abort refuses
  // ("Payment already completed — the order will finish"). It will not finish.
  //
  // A genuine decline-then-retry answers `requires_capture` here; a stale redelivery of a dead PI
  // answers `requires_payment_method` and is skipped. That is the whole difference, and it is the
  // difference between "nobody was charged" and "everyone but one was".
  const pi = await livePaymentIntent(piId, { missingIsFatal: true });
  if (!pi) return;
  // `succeeded` = already captured (a redelivery arriving after the capture); still a real
  // authorization, and the row can only move pending/failed → authorized, so the succeeded webhook
  // still marks it captured afterwards.
  if (pi.status !== "requires_capture" && pi.status !== "succeeded") {
    console.warn("[split-settle] onShareAuthorized: no live authorization — no mark", {
      paymentIntent: piId,
      status: pi.status,
    });
    return;
  }
  const { data: marked, error: markError } = await db
    .from("qr_cart_shares")
    .update({ status: "authorized", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId)
    // ⚠️ W10c pre-merge review — `failed` MUST be here, and `.select()` MUST be chained.
    //
    // With `.eq("status","pending")` a declined-then-retried share could never come back. The plain
    // path, no race and no outage required: the card is declined → `onShareFailed` marks the row
    // `failed` → the diner enters another card in the SAME still-mounted Element (SharePay re-enables
    // on `payErr` and the row stays payable, so `confirmPayment` runs against the SAME PaymentIntent,
    // never re-minting) → the hold lands → this event fires → 0 rows match → postgrest returns
    // `{ error: null }` for a 0-row update, so nothing threw and the webhook 200-ACKed the event
    // forever. The share sat at `failed` over a LIVE ~7-day hold, `captureAllIfReady`'s
    // all-authorized gate could never pass, and the table was finished.
    //
    // This is pre-existing, but W10c is what makes it bite: before this slice the `failed` mark was
    // swallowed on error and often never landed. Making that mark reliable is exactly what turns a
    // rare loss into a routine dead end — so the correcting transition has to exist.
    //
    // Still never `captured` or `canceled`: those are terminal and money-bearing.
    .in("status", ["pending", "failed"])
    .select("id");
  // A lost authorization mark strands a real card hold with no record — 5xx so Stripe redelivers.
  if (markError) throw new Error(`onShareAuthorized: mark failed — ${markError.message}`);
  // "We were told to mark and marked nothing" is not success. It is either a redelivery of an event
  // whose row is already authorized/captured (benign, common) or a row this PI no longer owns
  // (a tip change re-minted it) — neither is retryable, so log rather than 500, but never silently.
  if ((marked ?? []).length === 0)
    console.warn("[split-settle] onShareAuthorized matched no payable share", {
      paymentIntent: piId,
    });
  const cartId = await cartIdForPi(db, piId);
  if (!cartId) return;
  // W1·Q4: a payer just authorized — the settlement is demonstrably alive, so slide the freeze
  // forward (extend-only; never revives an aborted/stale one). Keeps a slow table's freeze fresh
  // between authorizations so the LAST payer's capture isn't refused at the TTL.
  await extendSettlement(cartId);
  await captureAllIfReady(db, cartId);
}

/** Once every share is authorized (or a $0 share auto-captured), capture the authorized PIs together.
 *  Exported for the ONE non-webhook trigger: create-share-intent's $0-share auto-settle (the last
 *  share to settle may take no PI, so no webhook would ever fire the all-covered check). */
export async function captureAllIfReady(
  db: ReturnType<typeof serviceClient>,
  cartId: string,
): Promise<void> {
  // Gate on a LIVE settlement before taking any money. If the cart isn't open (already paid/cancelled)
  // or the freeze was LIFTED (settle_at null — the host aborted and holds are being canceled), do NOT
  // capture — capturing a dead settlement is exactly the charged-with-no-order trap.
  const { data: cart, error: cartError } = await db
    .from("qr_carts")
    .select("status,settle_at,locked,locked_at")
    .eq("id", cartId)
    .maybeSingle();
  // An unreadable cart is not a dead settlement. Falling through would silently DECLINE to capture a
  // fully-authorized table and 200-ACK the event, leaving every payer's hold to expire uncaptured.
  if (cartError) throw new Error(`captureAllIfReady: cart unreadable — ${cartError.message}`);
  if (cart?.status !== "open" || cart.settle_at == null) return;

  const { data, error: sharesError } = await db
    .from("qr_cart_shares")
    .select("stripe_payment_intent_id,status,amount_cents")
    .eq("cart_id", cartId);
  // Likewise: an unreadable share list is not an empty one — treating it as empty skips the capture.
  if (sharesError) throw new Error(`captureAllIfReady: shares unreadable — ${sharesError.message}`);
  const shares = (data ?? []) as ShareRow[];
  if (shares.length === 0) return;
  // NO share may still be pending/failed/canceled — every one authorized or already captured.
  if (!shares.every((s) => s.status === "authorized" || s.status === "captured")) return;

  // Freshness (W1·Q4, relaxed for the fully-covered case): a fresh freeze always proceeds. A STALE
  // (but non-null) freeze may only proceed when the table is FULLY covered (checked above) AND no
  // single payer holds a fresh pay-lock — a stale settlement is exactly what acquireCartLock's
  // takeover branch accepts, so a fresh lock means a single-pay attempt is in flight and capture
  // must yield (the atomic open→paid flip in each fulfill path stays the final backstop). Without
  // this, a table that took >TTL to authorize every card dead-ends: capture refused forever,
  // authorization holds sitting ~7 days.
  const fresh = new Date(cart.settle_at).getTime() > Date.now() - SETTLE_TTL_MS;
  const singlePayInFlight =
    cart.locked === true &&
    cart.locked_at != null &&
    new Date(cart.locked_at).getTime() > Date.now() - CART_LOCK_TTL_MS;
  if (!fresh && singlePayInFlight) return;

  const nowIso = new Date().toISOString();
  for (const s of shares) {
    if (s.status !== "authorized" || !s.stripe_payment_intent_id) continue;
    // ⚠️ W11 (M45) — STAMP the share capture-claimed BEFORE touching Stripe. This write is the
    // serialization token between the capture loop and the two exits (abort, re-open): their deletes
    // exclude a stamped row and their refusals treat one as money in motion, so the race where an exit
    // releases payer A's hold and only then meets payer B's already-captured one closes HERE — at the
    // one point both sides order through the database. Fail closed on a write error: capturing an
    // unstamped share re-opens the exact window this stamp exists to shut, and the webhook's retry
    // machinery re-drives us for free.
    const { count: stamped, error: stampError } = await db
      .from("qr_cart_shares")
      .update({ capture_started_at: nowIso }, { count: "exact" })
      .eq("stripe_payment_intent_id", s.stripe_payment_intent_id)
      .eq("status", "authorized")
      .is("capture_started_at", null);
    if (stampError)
      throw new Error(
        `captureAllIfReady: capture-claim stamp failed for ${s.stripe_payment_intent_id} — ${stampError.message}`,
      );
    if ((stamped ?? 0) === 0) {
      // Two ways to stamp nothing, with opposite answers. A redelivered loop meeting its OWN earlier
      // stamp must still capture (the retry is the recovery); an abort that claimed the row first
      // (status no longer 'authorized') must be respected — capturing would charge a card the abort
      // just promised was released. One read tells them apart; fail closed on anything else.
      const { data: nowRow, error: reReadErr } = await db
        .from("qr_cart_shares")
        .select("status")
        .eq("stripe_payment_intent_id", s.stripe_payment_intent_id)
        .maybeSingle();
      if (reReadErr)
        throw new Error(
          `captureAllIfReady: stamp re-read failed for ${s.stripe_payment_intent_id} — ${reReadErr.message}`,
        );
      if (nowRow?.status !== "authorized") continue;
    }
    // Capture, then CONFIRM the PI actually took money before marking the share 'captured'. A concurrent
    // abort may have canceled this PI — capture then throws `unexpected_state` and NO money moved;
    // marking it captured would inflate the order total. So re-fetch the true state: 'succeeded' (money
    // taken, incl. an already-captured redelivery) → captured; anything else (e.g. canceled) → canceled.
    let succeeded = false;
    try {
      const pi = await getStripe().paymentIntents.capture(s.stripe_payment_intent_id);
      succeeded = pi.status === "succeeded";
    } catch (e) {
      if ((e as { code?: string }).code !== "payment_intent_unexpected_state") throw e;
      const pi = await getStripe().paymentIntents.retrieve(s.stripe_payment_intent_id);
      succeeded = pi.status === "succeeded";
    }
    // Mark immediately (don't wait for the succeeded webhook) so an abort in the capture→succeeded window
    // can't see 'authorized' and delete a share whose money is already taken. Never downgrade a captured row.
    // A capture that took NO money clears its claim stamp (W11/M45): the stamp means "money in motion",
    // and leaving it on a canceled share would permanently block the abort that is now the table's only
    // way forward. A succeeded capture keeps it — the row is terminal and the audit trail is useful.
    const { error: markError } = await db
      .from("qr_cart_shares")
      .update({
        status: succeeded ? "captured" : "canceled",
        ...(succeeded ? {} : { capture_started_at: null }),
        updated_at: nowIso,
      })
      .eq("stripe_payment_intent_id", s.stripe_payment_intent_id)
      .neq("status", "captured");
    // This is the sharpest edge in the file: the money has ALREADY moved at Stripe by the time we get
    // here, so a swallowed failure leaves a captured card with the share still reading 'authorized' —
    // the exact charged-with-no-order state the whole design exists to prevent, and invisible.
    // Throwing is both safe and self-healing: the webhook 5xxes, Stripe redelivers, and the redelivery
    // re-enters this loop where `capture` on an already-captured PI raises `payment_intent_unexpected_state`
    // → the retrieve branch above sees 'succeeded' → the mark is retried. Idempotent by construction.
    if (markError)
      throw new Error(
        `captureAllIfReady: post-capture mark failed for ${s.stripe_payment_intent_id} — ${markError.message}`,
      );
  }
  // Fulfillment + side-effects (QBO / analytics) run on the succeeded webhook (onShareCaptured) — the
  // single place, consistent with the single-pay path. Stripe reliably delivers succeeded after capture.
}

/** A share's PI was captured. Mark it; once ALL shares are captured, fulfill the order. Returns the
 *  order id only on the call that actually fulfills (for analytics / QBO), else null. */
export async function onShareCaptured(piId: string): Promise<string | null> {
  const db = serviceClient();
  const { error: markError } = await db
    .from("qr_cart_shares")
    .update({ status: "captured", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId)
    .in("status", ["pending", "authorized"]); // idempotent
  // Money is already taken for this share; losing the mark would stall the table's fulfillment
  // forever (the all-captured check below can never pass). 5xx → redeliver → the mark retries.
  if (markError) throw new Error(`onShareCaptured: mark failed — ${markError.message}`);
  const cartId = await cartIdForPi(db, piId);
  if (!cartId) return null;

  const { data, error: sharesError } = await db
    .from("qr_cart_shares")
    .select("status,amount_cents")
    .eq("cart_id", cartId);
  // An unreadable share list must not read as "no shares" — that returns null and the ORDER IS NEVER
  // FULFILLED for a table whose cards have all been charged.
  if (sharesError) throw new Error(`onShareCaptured: shares unreadable — ${sharesError.message}`);
  const shares = (data ?? []) as Pick<ShareRow, "status" | "amount_cents">[];
  if (shares.length === 0) return null;
  if (!shares.every((s) => s.status === "captured")) {
    // W1·Q4 straggler re-drive: if a previous capture-all pass died mid-loop (e.g. the $0-share
    // request path hit a transient Stripe error), some shares sit 'authorized' with no future
    // webhook to re-trigger them — THIS redelivered/next succeeded event is the retry. Idempotent:
    // it only captures when the table is fully covered, and a captured PI re-capture is tolerated.
    await captureAllIfReady(db, cartId);
    return null;
  }

  // Fire the order's side-effects (QBO + analytics) only on the call that actually CREATES it: read the
  // cart's pre-state — the fn's atomic open→paid flip is the real claim, so a redelivery (cart already
  // 'paid') returns null here and the caller skips the side-effects (QBO is idempotent regardless).
  const { data: cartRow, error: cartRowError } = await db
    .from("qr_carts")
    .select("status")
    .eq("id", cartId)
    .maybeSingle();
  // Deliberate throw rather than a degrade: `wasOpen` decides whether the order's side-effects (QBO
  // invoice, analytics) fire. An unreadable row would read as "already paid" and silently skip them
  // on the one call that actually creates the order — a missing invoice with no trace.
  if (cartRowError)
    throw new Error(`onShareCaptured: cart status unreadable — ${cartRowError.message}`);
  const wasOpen = cartRow?.status === "open";

  // Σ of the captured amounts == the order total (the fn re-verifies + snapshots one order).
  //
  // ⚠️ W10d — this is DELIBERATELY the same sum the RPC re-computes, i.e. the guard downstream is a
  // tautology, and OPEN-ITEMS M1/M25 stay OPEN because of it. An attempt to give it a real second
  // opinion (the cart's live total + tips) was written and reverted: the ledger is pinned at
  // `openSettlement` while `getCartTotals` is LIVE and time-dependent, so the two legitimately diverge
  // — the webhook burns the applied reward immediately after this call (`mms_reward_discount` filters
  // `redeemed_at is null`), a time-windowed promo can expire mid-settlement, and this function is
  // re-entered by every sibling and redelivered `succeeded` event. Comparing a pinned value against a
  // live one turned a self-healing no-op into a permanent 72h failure loop. The real fix is to PERSIST
  // the expected total when the split opens and reconcile against that constant; it needs a migration.
  // ⚠️ W11 (M1/M25) — the caller-supplied expectation is GONE. It was a tautology (this code summed
  // the same rows the RPC re-sums), and the reverted W10d attempt proved a LIVE second opinion is
  // wrong (the cart total legitimately moves mid-settlement). The RPC now reconciles the captured
  // ledger against `qr_carts.settle_expected_cents`, PINNED at openSettlement from the same derivation
  // that produced these shares — a constant, so redeliveries always compute the same verdict. A
  // mismatch writes a durable `qr_refunds_needed` row before raising (M43).
  const { data: orderId, error } = await db.rpc("mms_fulfill_split_order", {
    p_cart_id: cartId,
  });
  if (error) {
    // ⚠️ W11 review — the durable record must be written HERE, outside the RPC's transaction: an
    // insert inside the fn is rolled back by its own raise, so the operator surface could never
    // materialize. Idempotent on the synthetic key; best-effort (the throw below is what keeps Stripe
    // redelivering, and each redelivery re-attempts this upsert).
    if (/mismatch/.test(error.message)) {
      const { error: recordErr } = await db.from("qr_refunds_needed").upsert(
        {
          payment_intent: `split:${cartId}`,
          cart_id: cartId,
          amount_cents: shares.reduce((a, s) => a + s.amount_cents, 0),
          reason: "split_reconcile_mismatch",
        },
        { onConflict: "payment_intent", ignoreDuplicates: true },
      );
      if (recordErr)
        console.error("[split-settle] could not record the reconcile mismatch", {
          cartId,
          error: recordErr.message,
        });
    }
    throw new Error(`mms_fulfill_split_order failed: ${error.message}`);
  }
  await releaseSettlement(cartId); // lift the freeze (idempotent; the cart is already 'paid')
  return wasOpen ? (orderId ?? null) : null;
}

/** A share's PI failed. Mark it; settlement stalls until the host aborts (cancels the rest) or the
 *  payer retries. We deliberately do NOT auto-lift the freeze — the host decides. */
export async function onShareFailed(piId: string): Promise<void> {
  const db = serviceClient();
  // ⚠️ W10c — decide from STRIPE, never from delivery order. Two opposite ways to get this wrong, and
  // this function got each of them in turn:
  //
  //   • Unguarded (the original): the 500-and-retry this branch now uses turns one lost event into up
  //     to 72h of redeliveries, so a decline that the payer then RETRIED on the same clientSecret
  //     (Elements keeps the PI; `create-share-intent` is idempotent on `share_<id>_<amount>` and hands
  //     the same one back), authorized, and captured with the table would be downgraded to 'failed' by
  //     the original event landing late — `onShareCaptured`'s all-captured check could then never
  //     pass, so money was taken with no order, and `create-share-intent` (claiming on
  //     `pending|failed|canceled`) would let that seat mint a SECOND PI.
  //   • Over-guarded (pre-PR review's fix, caught pre-merge): excluding `authorized` made
  //     authorized→failed unrepresentable — but that is a REAL transition. A capture declined by the
  //     issuer fires `payment_failed` while the row still reads 'authorized', and nothing else records
  //     it (`onShareCanceled` only covers `payment_intent.canceled`). The mark is what short-circuits
  //     `captureAllIfReady`'s all-authorized gate and what lets the payer re-pay; without it the table
  //     dead-ends with a captured sibling, an infinite capture-retry storm, a 409 on the payer's retry
  //     and an abort that refuses ("Payment already completed"). Worse than the bug it fixed.
  //
  // So ask the PaymentIntent what is true NOW — the same "confirm the real state before writing"
  // discipline `captureAllIfReady` already uses after its capture. A stale redelivery finds a
  // succeeded/still-live PI and is skipped; a genuine decline finds no live authorization and marks.
  const pi = await livePaymentIntent(piId, { missingIsFatal: false });
  if (!pi) return;
  // ⚠️ Pre-merge review — an ALLOW-list, not a skip-list. The question is not "is there a hold?" but
  // "is a payment attempt still alive on this PaymentIntent?", and only ONE Stripe status answers no
  // while leaving something to record: `requires_payment_method` (Stripe's terminal state for both a
  // declined confirm and a declined capture). `requires_action` / `requires_confirmation` are LIVE —
  // a 3DS step-up parks a PI there for as long as the diner takes on their bank's OTP screen, and the
  // earlier skip-list let a redelivery landing in that window mark a share `failed` mid-challenge.
  // `canceled` belongs to `onShareCanceled`. Phrasing it as an allow-list also means a status Stripe
  // adds later defaults to "leave the row alone and tell us", never to a destructive write.
  if (pi.status !== "requires_payment_method") {
    console.warn("[split-settle] onShareFailed: PaymentIntent is not in a failed state — no mark", {
      paymentIntent: piId,
      status: pi.status,
    });
    return;
  }
  const { data: marked, error } = await db
    .from("qr_cart_shares")
    // W11 review — clear the capture-claim stamp too: an issuer declining the CAPTURE (card_declined,
    // not unexpected_state) lands here with the stamp still set, and a stamped share permanently blocks
    // the abort that is now the table's only way forward. This mark IS the conclusion that no money
    // moved, so it owns the clear — same rule as captureAllIfReady's mark-canceled branch.
    .update({ status: "failed", capture_started_at: null, updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId)
    // Belt to the Stripe check's braces: never downgrade a terminal row. `authorized` IS included —
    // that is the decline-at-capture case above, and the retrieve is what makes it safe. The
    // retrieve→update gap stays a (narrow) TOCTOU window; what closes its consequence is
    // `onShareAuthorized` accepting `failed`, so a mark that raced a real authorization self-corrects.
    .in("status", ["pending", "failed", "authorized"])
    .select("id");
  // A lost 'failed' mark leaves the board showing that payer as still pending, so the host waits on a
  // card that already declined — the table stalls with no one able to see why.
  if (error) throw new Error(`onShareFailed: mark failed — ${error.message}`);
  // This file's header says the one thing that must never happen is silence. An affirmative decision
  // that wrote nothing is exactly that, so say it — a captured/canceled row is a legitimate no-op, but
  // it must not look identical to a successful mark.
  if ((marked ?? []).length === 0)
    console.warn("[split-settle] onShareFailed matched no markable share", { paymentIntent: piId });
}

/** A share's PI was canceled (host abort or a tip-change replacement). Record it for the board. */
export async function onShareCanceled(piId: string): Promise<void> {
  const db = serviceClient();
  const { error } = await db
    .from("qr_cart_shares")
    // Same stamp-clearing rule as onShareFailed: a canceled PI took no money.
    .update({ status: "canceled", capture_started_at: null, updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId)
    .in("status", ["pending", "authorized"]); // never overwrite a captured share
  // A lost 'canceled' mark leaves a released hold showing as live on the board, so the table believes
  // it is still covered by money that is gone.
  if (error) throw new Error(`onShareCanceled: mark failed — ${error.message}`);
}
