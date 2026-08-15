"use server";
import { after } from "next/server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { receiptLinkInput, setReceiptEmailInput } from "@mms/db/schemas";
import type { OrderHistoryEntry, OrderHistoryLine } from "./rewards";
import { mintReceiptToken } from "./receipt-token";
import { receiptEmailConfigured, sendOrderReceiptEmail } from "./email";
import { withinReceiptRate } from "./rate";

/**
 * W7a (S1) — the receipt artifact's server layer.
 *
 *  • `getReceiptEntry(orderId)` — the session-less read behind `/track?r=<token>`. The TOKEN is
 *    the entire authorization (resolved by the caller via lib/receipt-token before this runs), so
 *    this is a service-role read scoped to exactly one PAID order. Shape = the /account history
 *    entry, so the artifact and the account receipt can never disagree.
 *  • `getReceiptLink(input)` — mints (or reuses) the durable link for a caller who is ALREADY
 *    authorized on the order: the SSR-verified uid must be the order's earner OR hold a
 *    qr_order_payers row (the lib/orders.ts doctrine — an order id alone grants nothing). One
 *    generic refusal for every miss: no existence oracle.
 */

export async function getReceiptEntry(orderId: string): Promise<OrderHistoryEntry | null> {
  const db = serviceClient();
  const { data: o, error } = await db
    .from("qr_orders")
    .select(
      "id,created_at,total_cents,tender,pickup_slot,table_number,subtotal_cents,discount_cents,service_charge_cents,tax_cents,tip_cents,status",
    )
    .eq("id", orderId)
    .eq("status", "paid") // a receipt exists only for settled money — never a pending/failed order
    .maybeSingle();
  if (error || !o) return null;
  const { data: items } = await db
    .from("qr_order_items")
    .select("name,qty,unit_price_cents,modifiers,fulfillment")
    .eq("order_id", orderId);
  const lines: OrderHistoryLine[] = (items ?? []).map((it) => {
    // modifiers is a string[] of option labels; degrade a malformed row to no mods (the
    // getOrderHistory guard) rather than crash the artifact.
    const raw = it.modifiers;
    const mods = Array.isArray(raw) ? raw.filter((m): m is string => typeof m === "string") : [];
    return {
      name: it.name,
      qty: it.qty,
      unitPriceCents: it.unit_price_cents ?? 0,
      mods,
      fulfillment: it.fulfillment ?? "dinein",
      // The artifact is snapshot-pure: no live-catalog join (photos/Burmese ride the /account
      // history where the S14b live-vs-snapshot posture is documented; a durable receipt shows
      // exactly what was charged, nothing that can drift).
      imageUrl: null,
      nameMy: null,
    };
  });
  return {
    id: o.id,
    code: o.id.slice(-6).toUpperCase(),
    createdAt: o.created_at,
    totalCents: o.total_cents,
    tender: o.tender,
    pickupSlot: o.pickup_slot ?? null,
    tableNumber: o.table_number ?? null,
    breakdown: {
      subtotalCents: o.subtotal_cents ?? 0,
      discountCents: o.discount_cents ?? 0,
      serviceChargeCents: o.service_charge_cents ?? 0,
      taxCents: o.tax_cents ?? 0,
      tipCents: o.tip_cents ?? 0,
    },
    lines,
  };
}

export type ReceiptLinkResult =
  | {
      ok: true;
      path: string;
      /** The upgraded caller's own account email — a PRE-FILL for the capture form (never
       *  auto-submitted); null for an anonymous diner. */
      accountEmail: string | null;
      /** Where a receipt was already asked sent (renders "Sent ✓ · Send again"). */
      emailedTo: string | null;
      /** C8 feature-off: when false the capture affordance must not render at all. */
      emailEnabled: boolean;
    }
  | { ok: false; reason: "refused" | "unavailable" };

/** Is the SSR-verified caller the order's earner or a recorded payer? Shared by the link mint and
 *  (W7a·2) the email capture — the ONE authorization rule for receipt asks. */
async function callerMayReceiveReceipt(orderId: string, uid: string): Promise<boolean> {
  const db = serviceClient();
  const { data: earned, error: earnedErr } = await db
    .from("qr_orders")
    .select("id")
    .eq("id", orderId)
    .eq("status", "paid")
    .eq("earned_by", uid)
    .maybeSingle();
  if (earnedErr) return false; // fail closed — an unreadable authority never authorizes
  if (earned) return true;
  // Split payers: the durable qr_order_payers proof (W11/M29) — scoped to THIS order AND THIS uid.
  const { data: payer, error: payerErr } = await db
    .from("qr_order_payers")
    .select("order_id")
    .eq("order_id", orderId)
    .eq("payer_uid", uid)
    .maybeSingle();
  if (payerErr) return false;
  return payer != null;
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
  // Post-authz extras for the capture affordance (one round trip powers the whole UI): the
  // upgraded caller's own email as a pre-fill, and any already-recorded receipt address.
  const db = serviceClient();
  const { data: emailRow } = await db
    .from("qr_orders")
    .select("receipt_email")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  return {
    ok: true,
    path: `/track?r=${token}`,
    accountEmail: user.is_anonymous !== true ? (user.email ?? null) : null,
    emailedTo: emailRow?.receipt_email ?? null,
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
 * bucket bounds them); `receipt_sent_at` stamps only a HANDED-OFF send (the `after` block), so
 * "Sent" is never claimed for a send that failed configuration.
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
  if (!(await withinReceiptRate(user.id))) return { ok: false, reason: "rate_limited" };
  if (!receiptEmailConfigured()) return { ok: false, reason: "unavailable" };

  const entry = await getReceiptEntry(orderId);
  const token = await mintReceiptToken(orderId);
  if (!entry || !token) return { ok: false, reason: "unavailable" };

  const db = serviceClient();
  const { error: writeErr } = await db
    .from("qr_orders")
    .update({ receipt_email: email })
    .eq("id", orderId)
    .eq("status", "paid"); // the status guard rides the statement (doctrine), not just the probe
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
