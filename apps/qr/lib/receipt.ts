"use server";
import { after } from "next/server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { receiptLinkInput, setReceiptEmailInput } from "@mms/db/schemas";
import { getReceiptEntry, RECEIPT_STATUSES } from "./receipt-entry";
import { mintReceiptToken } from "./receipt-token";
import { receiptEmailConfigured, sendOrderReceiptEmail } from "./email";
import { withinReceiptRate } from "./rate";
import { COUNTER_TENDERS } from "./counter-tender";

/**
 * W7a (S1) — the receipt artifact's ACTIONS. Every export here is a POST-able Server Action, so
 * every export authenticates internally (the review HIGH that moved the raw entry read out to the
 * `server-only` lib/receipt-entry.ts): the SSR-verified uid must be the order's earner, hold a
 * qr_order_payers row, or — for a counter-settled order — hold a seat at its session (the
 * lib/orders.ts doctrine — an order id alone grants nothing). One generic refusal for every miss: no
 * existence oracle.
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
      /** Lifecycle audit (2026-10-13, blind pass) — may THIS caller ask for the email? Only the
       *  order's earner or a recorded payer: a counter order's seated diner (`seat` arm) gets the
       *  "View & print" link and nothing more — never another diner's address, never its form. */
      canEmail: boolean;
    }
  | { ok: false; reason: "refused" | "unavailable" };

/** WHICH proof admitted the caller to an order's receipt — or null. The arm decides what it buys:
 *  `earner` and `payer` get the link AND the email capture; `seat` (a counter order's tablemate)
 *  gets the link only (`receiptArmMayEmail`). */
export type ReceiptArm = "earner" | "payer" | "seat";

/** Lifecycle audit (2026-10-13, blind pass) — the email capture is the earner's or a payer's, never a
 *  seat's: the seat arm proves only that someone sat at the table, and the address on the order (and
 *  the right to replace it) belongs to whoever paid. Not exported: every export of a "use server"
 *  module is a POST-able action. */
function receiptArmMayEmail(arm: ReceiptArm | null): boolean {
  return arm === "earner" || arm === "payer";
}

/** Is the SSR-verified caller the order's earner, a recorded payer, or — for an order the REGISTER
 *  settled — a seat at its table that was taken BEFORE the settle? Shared by the link mint and the
 *  email capture — the ONE authorization rule for receipt asks, answering WHICH arm admitted the
 *  caller. Every probe carries the same settled-status filter (review MED: the payer half used to
 *  skip it — a symmetric predicate is the mutant-guarded shape). `refunded` stays authorized: the
 *  artifact is the diner's documentation of the charge, stamped honestly. */
async function callerMayReceiveReceipt(orderId: string, uid: string): Promise<ReceiptArm | null> {
  const db = serviceClient();
  const { data: earned, error: earnedErr } = await db
    .from("qr_orders")
    .select("id")
    .eq("id", orderId)
    .in("status", [...RECEIPT_STATUSES])
    .eq("earned_by", uid)
    .maybeSingle();
  if (earnedErr) return null; // fail closed — an unreadable authority never authorizes
  if (earned) return "earner";
  // Split payers: the durable qr_order_payers proof (W11/M29) — scoped to THIS order AND THIS
  // uid, and confirmed against a settled order (payer rows only exist for fulfilled splits, but
  // the status re-check keeps the two probes symmetric rather than resting on that invariant).
  const { data: payer, error: payerErr } = await db
    .from("qr_order_payers")
    .select("order_id")
    .eq("order_id", orderId)
    .eq("payer_uid", uid)
    .maybeSingle();
  if (payerErr) return null;
  if (payer) {
    const { data: settled, error: settledErr } = await db
      .from("qr_orders")
      .select("id")
      .eq("id", orderId)
      .in("status", [...RECEIPT_STATUSES])
      .maybeSingle();
    if (settledErr) return null;
    return settled != null ? "payer" : null;
  }
  // Lifecycle audit (2026-10-13), H — the COUNTER arm, the same rule `getMyOrderFallback` and
  // `getCartOrderRef` already read the order by: a cash or Terminal settle writes no `earned_by`, no
  // payer row and no share (M206), so the seated diner /track shows the order to was refused the very
  // receipt the page promised. Who may have it is who SAT at that table — a `session_members` row for
  // the order's session, durable across the clear that closes it — and only for a COUNTER tender: for
  // a card order, membership is not payment (M29), so a tablemate never mints a card payer's receipt.
  // ⚠️ AND ONLY A SEAT TAKEN BEFORE THE SETTLE (the blind pass on #359): a session outlives the party
  // until staff clear it, and the next party to scan the same sticker joins it (m182) — a seat read
  // at any time admitted them to the party before them's receipt. The order's own `created_at` is the
  // settle; a member whose row is later than it was not at the table that paid.
  const { data: counter, error: counterErr } = await db
    .from("qr_orders")
    .select("session_id,created_at")
    .eq("id", orderId)
    .in("status", [...RECEIPT_STATUSES])
    .in("tender", [...COUNTER_TENDERS])
    .maybeSingle();
  if (counterErr || !counter?.session_id) return null;
  const { data: seat, error: seatErr } = await db
    .from("session_members")
    .select("seat_id")
    .eq("session_id", counter.session_id)
    .eq("seat_id", uid)
    .lte("created_at", counter.created_at)
    .limit(1)
    .maybeSingle();
  if (seatErr) return null; // fail closed — an unreadable membership never authorizes
  return seat != null ? "seat" : null;
}

export async function getReceiptLink(input: unknown): Promise<ReceiptLinkResult> {
  const parsed = receiptLinkInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "refused" };
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { ok: false, reason: "refused" };
  const arm = await callerMayReceiveReceipt(parsed.data.orderId, user.id);
  if (!arm) return { ok: false, reason: "refused" };
  const token = await mintReceiptToken(parsed.data.orderId);
  if (!token) return { ok: false, reason: "unavailable" };
  // The seat arm (a counter order's tablemate) buys the LINK only: never the address on the order —
  // it may be another diner's (the blind pass on #359) — and never the form that would replace it.
  const canEmail = receiptArmMayEmail(arm);
  if (!canEmail)
    return {
      ok: true,
      path: `/track?r=${token}`,
      accountEmail: null,
      emailedTo: null,
      emailEnabled: receiptEmailConfigured(),
      canEmail: false,
    };
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
    canEmail: true,
  };
}

export type SetReceiptEmailResult =
  | { ok: true; sentTo: string }
  | { ok: false; reason: "refused" | "invalid" | "rate_limited" | "unavailable" };

/**
 * "Email me this receipt" — consent-first (the diner types or confirms the address; nothing is
 * auto-sent). Order of guards is the placement rule: authorize (earner/payer — never the counter
 * order's seat arm, which buys the link alone) → rate (the
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
  // The seat arm is refused with the SAME generic answer as a stranger: it may read the receipt, but
  // the address on the order belongs to whoever paid, and replacing it would redirect their receipt.
  if (!receiptArmMayEmail(await callerMayReceiveReceipt(orderId, user.id)))
    return { ok: false, reason: "refused" };
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
