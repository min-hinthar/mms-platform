import "server-only";
import { serviceClient } from "@mms/db/server";
import { getStripe } from "./stripe";
import { releaseSettlement } from "./lock";

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
 */

type ShareRow = { stripe_payment_intent_id: string | null; status: string; amount_cents: number };

async function cartIdForPi(
  db: ReturnType<typeof serviceClient>,
  piId: string,
): Promise<string | null> {
  const { data } = await db
    .from("qr_cart_shares")
    .select("cart_id")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle();
  return data?.cart_id ?? null;
}

/** A share's PI was authorized (capture_method=manual confirmed). Mark it, then capture-all if ready. */
export async function onShareAuthorized(piId: string): Promise<void> {
  const db = serviceClient();
  await db
    .from("qr_cart_shares")
    .update({ status: "authorized", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId)
    .eq("status", "pending"); // idempotent: only pending → authorized
  const cartId = await cartIdForPi(db, piId);
  if (cartId) await captureAllIfReady(db, cartId);
}

/** Once every share is authorized (or a $0 share auto-captured), capture the authorized PIs together. */
async function captureAllIfReady(
  db: ReturnType<typeof serviceClient>,
  cartId: string,
): Promise<void> {
  const { data } = await db
    .from("qr_cart_shares")
    .select("stripe_payment_intent_id,status,amount_cents")
    .eq("cart_id", cartId);
  const shares = (data ?? []) as ShareRow[];
  if (shares.length === 0) return;
  // Gate: NO share may still be pending/failed/canceled — every one authorized or already captured.
  if (!shares.every((s) => s.status === "authorized" || s.status === "captured")) return;

  const nowIso = new Date().toISOString();
  for (const s of shares) {
    if (s.status === "authorized" && s.stripe_payment_intent_id) {
      try {
        await getStripe().paymentIntents.capture(s.stripe_payment_intent_id);
      } catch (e) {
        // A redelivery may re-capture an already-captured PI → Stripe returns
        // `payment_intent_unexpected_state`; that's fine. Anything else is a real failure → rethrow so
        // the webhook 5xx's and Stripe retries.
        const code = (e as { code?: string }).code;
        if (code !== "payment_intent_unexpected_state") throw e;
      }
      // Mark 'captured' IMMEDIATELY — not waiting for the succeeded webhook — so an abort in the
      // capture→succeeded window can't see 'authorized' and delete a share whose money is already taken
      // (abortSettlement refuses once any share is captured).
      await db
        .from("qr_cart_shares")
        .update({ status: "captured", updated_at: nowIso })
        .eq("stripe_payment_intent_id", s.stripe_payment_intent_id);
    }
  }
  // Fulfillment + side-effects (QBO / analytics) run on the succeeded webhook (onShareCaptured) — the
  // single place, consistent with the single-pay path. Stripe reliably delivers succeeded after capture.
}

/** A share's PI was captured. Mark it; once ALL shares are captured, fulfill the order. Returns the
 *  order id only on the call that actually fulfills (for analytics / QBO), else null. */
export async function onShareCaptured(piId: string): Promise<string | null> {
  const db = serviceClient();
  await db
    .from("qr_cart_shares")
    .update({ status: "captured", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId)
    .in("status", ["pending", "authorized"]); // idempotent
  const cartId = await cartIdForPi(db, piId);
  if (!cartId) return null;

  const { data } = await db
    .from("qr_cart_shares")
    .select("status,amount_cents")
    .eq("cart_id", cartId);
  const shares = (data ?? []) as Pick<ShareRow, "status" | "amount_cents">[];
  if (shares.length === 0 || !shares.every((s) => s.status === "captured")) return null;

  // Fire the order's side-effects (QBO + analytics) only on the call that actually CREATES it: read the
  // cart's pre-state — the fn's atomic open→paid flip is the real claim, so a redelivery (cart already
  // 'paid') returns null here and the caller skips the side-effects (QBO is idempotent regardless).
  const { data: cartRow } = await db
    .from("qr_carts")
    .select("status")
    .eq("id", cartId)
    .maybeSingle();
  const wasOpen = cartRow?.status === "open";

  // Σ of the captured amounts == the order total (the fn re-verifies + snapshots one order).
  const expected = shares.reduce((a, s) => a + s.amount_cents, 0);
  const { data: orderId, error } = await db.rpc("mms_fulfill_split_order", {
    p_cart_id: cartId,
    p_expected_total_cents: expected,
  });
  if (error) throw new Error(`mms_fulfill_split_order failed: ${error.message}`);
  await releaseSettlement(cartId); // lift the freeze (idempotent; the cart is already 'paid')
  return wasOpen ? (orderId ?? null) : null;
}

/** A share's PI failed. Mark it; settlement stalls until the host aborts (cancels the rest) or the
 *  payer retries. We deliberately do NOT auto-lift the freeze — the host decides. */
export async function onShareFailed(piId: string): Promise<void> {
  const db = serviceClient();
  await db
    .from("qr_cart_shares")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId);
}

/** A share's PI was canceled (host abort or a tip-change replacement). Record it for the board. */
export async function onShareCanceled(piId: string): Promise<void> {
  const db = serviceClient();
  await db
    .from("qr_cart_shares")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId)
    .in("status", ["pending", "authorized"]); // never overwrite a captured share
}
