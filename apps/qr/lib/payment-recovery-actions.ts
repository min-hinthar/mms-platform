"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { serverClient, serviceClient } from "@mms/db/server";
import { checkTablePaymentInput, recoverPaymentInput } from "@mms/db/schemas";
import { isTransportFailure } from "./authz";
import { staffGate } from "./staff";
import { withinRecoverCartRate, withinRecoverRate } from "./rate";
import { recoverIntent } from "./payment-recovery";
import type { RecoveryAnswer } from "./payment-recovery-verdict";

/**
 * M160(b) — the two people-facing doors into the stranded-payment recovery. Both are bounded BEFORE
 * Stripe is called (`RECOVER_RATE`, `RECOVER_CART_RATE`), both find the intent through the cart's
 * own link (`live_payment_intent_id`, M151) rather than trusting the caller's word for it, and both
 * end in `recoverIntent` — Stripe's own answer, then the webhook's own fulfillment.
 */

/**
 * /track: "my order hasn't appeared — is my payment stuck?" The guest names the PaymentIntent their
 * redirect carried; that id is an address, not a proof. The proof is the binding: the cart that
 * links this intent, and the intent's `earnerUid` equal to the caller's verified uid — so a guest can
 * only ever recover THEIR OWN payment, and only one Stripe still says succeeded.
 *
 * Answers `recorded` before any Stripe call when the order already exists (the ordinary case: the
 * webhook was merely slower than the guest's patience).
 */
export async function recoverMyPayment(raw: unknown): Promise<RecoveryAnswer> {
  const parsed = recoverPaymentInput.safeParse(raw);
  if (!parsed.success) return { kind: "refused" };
  const { paymentIntent } = parsed.data;

  const supa = serverClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await supa.auth.getUser();
  // Unknowable ≠ unauthenticated (W10a): an auth outage is an error, not a refusal.
  if (authErr && isTransportFailure(authErr)) return { kind: "error" };
  if (!user) return { kind: "refused" };
  if (!(await withinRecoverRate(user.id))) return { kind: "wait" };

  const db = serviceClient();
  const { data: order, error: orderErr } = await db
    .from("qr_orders")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent)
    .maybeSingle();
  if (orderErr) {
    console.error("[payment-recovery] track: order read failed", { error: orderErr.message });
    return { kind: "error" };
  }
  if (order) return { kind: "recorded" };

  const { data: cart, error: cartErr } = await db
    .from("qr_carts")
    .select("id")
    .eq("live_payment_intent_id", paymentIntent)
    .maybeSingle();
  if (cartErr) {
    console.error("[payment-recovery] track: cart read failed", { error: cartErr.message });
    return { kind: "error" };
  }
  // No cart names this intent: it was superseded, cancelled, or is not one of ours. Nothing a guest
  // door may fulfill — the webhook and the cron still can, under their own authority.
  if (!cart) return { kind: "nothing" };
  if (!(await withinRecoverCartRate(cart.id))) return { kind: "wait" };

  return recoverIntent(paymentIntent, { cartId: cart.id, payerUid: user.id }, "track");
}

/**
 * Staff's "Check payment": a table whose clear refused because a card payment started and did not
 * finish (`card_live`). Staff-authorized; the intent is the one the table's OPEN cart links, never
 * one a request names. On `recorded` the table's pages are revalidated so the floor shows it paid.
 */
export async function checkTablePayment(raw: unknown): Promise<RecoveryAnswer> {
  const gate = await staffGate();
  if (!gate.ok) return { kind: "refused" };
  const parsed = checkTablePaymentInput.safeParse(raw);
  if (!parsed.success) return { kind: "refused" };
  const { sessionId } = parsed.data;

  const { data: cart, error } = await serviceClient()
    .from("qr_carts")
    .select("id,live_payment_intent_id")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  if (error) {
    console.error("[payment-recovery] staff: cart read failed", {
      sessionId,
      error: error.message,
    });
    return { kind: "error" };
  }
  if (!cart?.live_payment_intent_id) return { kind: "nothing" };
  if (!(await withinRecoverCartRate(cart.id))) return { kind: "wait" };

  const answer = await recoverIntent(
    cart.live_payment_intent_id,
    { cartId: cart.id, payerUid: null },
    "staff",
  );
  if (answer.kind === "recorded" || answer.kind === "refund_needed") {
    revalidatePath("/staff");
    revalidatePath(`/staff/table/${sessionId}`);
    revalidatePath("/staff/kitchen");
  }
  return answer;
}
