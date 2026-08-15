"use server";
import { after } from "next/server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { receiptLinkInput, setReceiptEmailInput } from "@mms/db/schemas";
import { getReceiptEntry, RECEIPT_STATUSES } from "./receipt-entry";
import { mintReceiptToken } from "./receipt-token";
import { receiptEmailConfigured, sendOrderReceiptEmail } from "./email";
import { withinReceiptRate } from "./rate";

/**
 * W7a (S1) — the receipt artifact's ACTIONS. Every export here is a POST-able Server Action, so
 * every export authenticates internally (the review HIGH that moved the raw entry read out to the
 * `server-only` lib/receipt-entry.ts): the SSR-verified uid must be the order's earner OR hold a
 * qr_order_payers row (the lib/orders.ts doctrine — an order id alone grants nothing). One
 * generic refusal for every miss: no existence oracle.
 */

export type ReceiptLinkResult =
  | {
      ok: true;
      path: string;
      /** The upgraded caller's own account email — a PRE-FILL for the capture form (never
       *  auto-submitted); null for an anonymous diner. */
      accountEmail: string | null;
      /** Where a receipt was CONFIRMED sent (`receipt_sent_at` stamped — review MED: the address
       *  column alone only proves an ask, never a handed-off send). */
      emailedTo: string | null;
      /** C8 feature-off: when false the capture affordance must not render at all. */
      emailEnabled: boolean;
    }
  | { ok: false; reason: "refused" | "unavailable" };

/** Is the SSR-verified caller the order's earner or a recorded payer? Shared by the link mint and
 *  the email capture — the ONE authorization rule for receipt asks. Both probes carry the same
 *  settled-status filter (review MED: the payer half used to skip it — a symmetric predicate is
 *  the mutant-guarded shape). `refunded` stays authorized: the artifact is the diner's
 *  documentation of the charge, stamped honestly. */
async function callerMayReceiveReceipt(orderId: string, uid: string): Promise<boolean> {
  const db = serviceClient();
  const { data: earned, error: earnedErr } = await db
    .from("qr_orders")
    .select("id")
    .eq("id", orderId)
    .in("status", [...RECEIPT_STATUSES])
    .eq("earned_by", uid)
    .maybeSingle();
  if (earnedErr) return false; // fail closed — an unreadable authority never authorizes
  if (earned) return true;
  // Split payers: the durable qr_order_payers proof (W11/M29) — scoped to THIS order AND THIS
  // uid, and confirmed against a settled order (payer rows only exist for fulfilled splits, but
  // the status re-check keeps the two probes symmetric rather than resting on that invariant).
  const { data: payer, error: payerErr } = await db
    .from("qr_order_payers")
    .select("order_id")
    .eq("order_id", orderId)
    .eq("payer_uid", uid)
    .maybeSingle();
  if (payerErr) return false;
  if (!payer) return false;
  const { data: settled, error: settledErr } = await db
    .from("qr_orders")
    .select("id")
    .eq("id", orderId)
    .in("status", [...RECEIPT_STATUSES])
    .maybeSingle();
  if (settledErr) return false;
  return settled != null;
}

export async function getReceiptLink(input: unknown): Promise<ReceiptLinkResult> {
  const parsed = receiptLinkInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "refused" };
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { ok: false, reason: "refused" };
  if (!(await callerMayReceiveReceipt(parsed.data.orderId, user.id)))
    return { ok: false, reason: "refused" };
  const token = await mintReceiptToken(parsed.data.orderId);
  if (!token) return { ok: false, reason: "unavailable" };
  // Post-authz extras for the capture affordance (one round trip powers the whole UI). "Sent" is
  // only claimed off the receipt_sent_at stamp — the address column alone proves an ask.
  const db = serviceClient();
  const { data: emailRow } = await db
    .from("qr_orders")
    .select("receipt_email,receipt_sent_at")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  return {
    ok: true,
    path: `/track?r=${token}`,
    accountEmail: user.is_anonymous !== true ? (user.email ?? null) : null,
    emailedTo: emailRow?.receipt_sent_at ? (emailRow.receipt_email ?? null) : null,
    emailEnabled: receiptEmailConfigured(),
  };
}

export type SetReceiptEmailResult =
  | { ok: true; sentTo: string }
  | { ok: false; reason: "refused" | "invalid" | "rate_limited" | "unavailable" };

/**
 * "Email me this receipt" — consent-first (the diner types or confirms the address; nothing is
 * auto-sent). Order of guards is the placement rule: authorize (earner/payer) → rate (the
 * OUTBOUND-email budget, surfaced honestly — never a silent drop) → validate → write → send via
 * `after()` so the response never couples to Resend. Re-sends are allowed deliberately (the rate
 * bucket bounds them); `receipt_sent_at` stamps only a HANDED-OFF send, and the UI claims
 * "sent ✓" only off that stamp (`ok` here means "on its way", nothing more).
 */
export async function setReceiptEmail(input: unknown): Promise<SetReceiptEmailResult> {
  const parsed = setReceiptEmailInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { orderId, email } = parsed.data;
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { ok: false, reason: "refused" };
  if (!(await callerMayReceiveReceipt(orderId, user.id))) return { ok: false, reason: "refused" };
  if (!receiptEmailConfigured()) return { ok: false, reason: "unavailable" }; // before the rate spend
  if (!(await withinReceiptRate(user.id))) return { ok: false, reason: "rate_limited" };

  const entry = await getReceiptEntry(orderId);
  const token = await mintReceiptToken(orderId);
  if (!entry || !token) return { ok: false, reason: "unavailable" };

  const db = serviceClient();
  const { error: writeErr } = await db
    .from("qr_orders")
    .update({ receipt_email: email })
    .eq("id", orderId)
    .in("status", [...RECEIPT_STATUSES]); // the status guard rides the statement (doctrine)
  if (writeErr) return { ok: false, reason: "unavailable" };

  // The send drains OUT-OF-BAND (the webhook after() discipline): the response never waits on
  // Resend, and a send failure surfaces in logs + the missing receipt_sent_at stamp — never as a
  // stuck screen. sendOrderReceiptEmail never throws.
  after(async () => {
    const sent = await sendOrderReceiptEmail({
      to: email,
      entry,
      receiptPath: `/track?r=${token}`,
    });
    if (sent.ok) {
      await db
        .from("qr_orders")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("id", orderId);
    }
  });
  return { ok: true, sentTo: email };
}
