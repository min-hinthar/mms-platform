"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { refundLineInput } from "@mms/db/schemas";
import { AuthzError } from "./authz";
import { getStaffAuth, requireStaff, roleAtLeast } from "./staff";
import { verifyStaffPin } from "./staff-pin";
import { getStripe } from "./stripe";
import { getPostHogClient } from "./posthog-server";

/**
 * Line-level refunds (S4.3b) — money-OUT, the captured-line counterpart to S2.3's open-cart void. The
 * manager-facing /staff/orders surface lists paid orders; a manager refunds a specific line. The amount +
 * PaymentIntent are SERVER-derived (mms_refund_authorize) — the client never sends a figure. The Stripe
 * refund is idempotency-keyed on the line (a double-submit returns the SAME refund — no double money out),
 * recorded in the mms_refunds ledger + mms_approvals audit, and charge.refunded reconciles the order status.
 * Every export re-checks requireStaff('manager') + a self-PIN step-up (the money-out re-auth at action time).
 */

export type StaffOrderLine = {
  id: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  taxCents: number;
  fulfillment: string;
  refunded: boolean;
  /** The server-derived refundable amount (cents) — discounted goods + the line's share of order tax. The
   *  display echo of mms_refund_authorize so the sheet shows exactly what will be refunded (S4-audit P0-1/P1-1). */
  refundableCents: number;
};

/**
 * The refundable amount for one paid line, in cents — MIRRORS mms_refund_authorize (the SQL is the
 * authority; this is the display echo, like lib/tax.ts mirrors mms_line_tax). Discounted goods (line gross
 * minus its pro-rata share of the order discount) + the line's share of the order's discounted tax (pro-rata
 * by taxable gross). Service/tip are order-level → excluded. Does NOT apply the over-refund cap — the display
 * shows the normal single-refund amount; the server clamps and returns the authoritative figure on submit.
 * KEEP IN LOCKSTEP with the SQL: any change to the refund formula must land in both.
 */
function lineRefundableCents(
  line: { unitPriceCents: number; qty: number; taxCents: number },
  order: { subtotalCents: number; discountCents: number; taxCents: number },
  taxableBaseCents: number,
): number {
  const lineGross = line.unitPriceCents * line.qty;
  const lineDiscount =
    order.subtotalCents > 0
      ? Math.round((order.discountCents * lineGross) / order.subtotalCents)
      : 0;
  const goods = lineGross - lineDiscount;
  const lineTax =
    line.taxCents > 0 && taxableBaseCents > 0
      ? Math.round((order.taxCents * lineGross) / taxableBaseCents)
      : 0;
  return goods + lineTax;
}

export type StaffOrder = {
  id: string;
  createdAt: string;
  totalCents: number;
  status: string; // 'paid' | 'refunded'
  tender: string;
  /** Split-tender orders carry no PI on the order (the payer PIs live on qr_cart_shares) → per-line refund
   *  isn't supported here yet; the UI disables it with a "refund via dashboard" note. */
  isSplit: boolean;
  label: string;
  lines: StaffOrderLine[];
};

/**
 * Recent paid/refunded orders for the manager refund surface. Manager-gated; service-role read (the
 * cross-table order list is a manager tool, like the KDS). Bounded to the most recent 50. Each line is
 * flagged `refunded` (a mms_refunds row exists) so the UI disables an already-refunded line.
 */
export async function getStaffOrders(): Promise<StaffOrder[]> {
  await requireStaff("manager");
  const db = serviceClient();
  // W10b — a failed read must not render as "no recent orders" (false-empty), and a failed REFUNDS
  // read must not clear the `refunded` flags (re-offering a refund on an already-refunded line; the
  // idempotency key is the backstop, not the UI). Throw to the caller's failure state instead.
  const unavailable = () =>
    new AuthzError("We can’t reach the ordering system right now", 503, "unavailable");
  const { data: orders, error: ordersError } = await db
    .from("qr_orders")
    .select(
      "id,created_at,subtotal_cents,discount_cents,tax_cents,service_charge_cents,tip_cents,total_cents,status,tender,stripe_payment_intent_id,session_id,qr_order_items(id,name,qty,unit_price_cents,tax_cents,fulfillment)",
    )
    .in("status", ["paid", "refunded"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (ordersError) throw unavailable();
  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: refunds, error: refundsError } = await db
    .from("mms_refunds")
    .select("order_item_id")
    .in("order_id", orderIds);
  if (refundsError) throw unavailable();
  const refundedLines = new Set(
    (refunds ?? []).map((r) => r.order_item_id).filter((x): x is string => !!x),
  );

  const sessionIds = [...new Set(orders.map((o) => o.session_id).filter((s): s is string => !!s))];
  const { data: sessions, error: sessionsError } = sessionIds.length
    ? await db.from("table_sessions").select("id,qr_code").in("id", sessionIds)
    : { data: [] as { id: string; qr_code: string }[], error: null };
  if (sessionsError) throw unavailable();
  const labelBy = new Map((sessions ?? []).map((s) => [s.id, s.qr_code]));

  return orders.map((o) => {
    const items = o.qr_order_items ?? [];
    // The taxable subtotal base for this order (taxable lines have a stored per-unit tax > 0) — the
    // denominator for each line's pro-rata share of the order tax, matching mms_refund_authorize.
    const taxableBaseCents = items.reduce(
      (a, li) => a + (li.tax_cents > 0 ? li.unit_price_cents * li.qty : 0),
      0,
    );
    return {
      id: o.id,
      createdAt: o.created_at,
      totalCents: o.total_cents,
      status: o.status,
      tender: o.tender,
      isSplit: o.stripe_payment_intent_id == null,
      label: (o.session_id ? labelBy.get(o.session_id) : null) ?? "Order",
      lines: items.map((li) => ({
        id: li.id,
        name: li.name,
        qty: li.qty,
        unitPriceCents: li.unit_price_cents,
        taxCents: li.tax_cents,
        fulfillment: li.fulfillment,
        refunded: refundedLines.has(li.id),
        refundableCents: lineRefundableCents(
          { unitPriceCents: li.unit_price_cents, qty: li.qty, taxCents: li.tax_cents },
          {
            subtotalCents: o.subtotal_cents,
            discountCents: o.discount_cents,
            taxCents: o.tax_cents,
          },
          taxableBaseCents,
        ),
      })),
    };
  });
}

export type RefundResult =
  | { ok: true; amountCents: number }
  | { ok: false; reason: "pin_wrong"; attemptsRemaining: number }
  | { ok: false; reason: "pin_locked"; lockedUntil: string }
  | {
      ok: false;
      reason:
        | "not_manager"
        | "pin_no_pin"
        | "not_found"
        | "not_paid"
        | "split_unsupported"
        | "already_refunded"
        | "fully_refunded"
        | "stripe_error"
        | "error"
        // W10b: platform unreachable — no money moved; not a verdict about the line or the manager.
        | "outage";
    };

/**
 * Refund ONE paid line. Manager-gated + self-PIN step-up (money-out re-auth). mms_refund_authorize
 * server-derives the amount (goods + that line's tax) + the PI and validates paid/single-PI/not-already-
 * refunded; the Stripe refund is idempotency-keyed on the line (no double money out); mms_record_refund
 * writes the ledger + audit. A record failure AFTER a successful Stripe refund is logged, not surfaced —
 * the charge.refunded webhook reconciles the status regardless (the money already moved correctly).
 */
export async function refundLine(raw: unknown): Promise<RefundResult> {
  const staffAuth = await getStaffAuth();
  // W10b — unknowable ≠ "not a manager": that verdict on a money-out surface reads as a demotion.
  if (staffAuth.kind === "unavailable") return { ok: false, reason: "outage" };
  const caller =
    staffAuth.kind === "staff" && roleAtLeast(staffAuth.caller.role, "manager")
      ? staffAuth.caller
      : null;
  if (!caller) return { ok: false, reason: "not_manager" };
  const parsed = refundLineInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error" };
  const { orderItemId, reason, pin } = parsed.data;

  // Money-out step-up: re-confirm the manager's identity at action time (the surface is manager-gated, so
  // this is a re-auth, not a second person). Lockout-counted; a bad/locked PIN never reaches Stripe.
  const v = await verifyStaffPin(caller.staffId, pin);
  if (v.status === "wrong")
    return { ok: false, reason: "pin_wrong", attemptsRemaining: v.attemptsRemaining };
  if (v.status === "locked") return { ok: false, reason: "pin_locked", lockedUntil: v.lockedUntil };
  if (v.status === "no_pin") return { ok: false, reason: "pin_no_pin" };
  if (v.status !== "ok") return { ok: false, reason: "error" };

  const db = serviceClient();
  const { data: authRows, error: authErr } = await db.rpc("mms_refund_authorize", {
    p_line_item: orderItemId,
    p_initiator: caller.staffId,
  });
  if (authErr) {
    console.error("[refunds] mms_refund_authorize failed", {
      orderItemId,
      message: authErr.message,
    });
    return { ok: false, reason: "error" };
  }
  const auth = authRows?.[0];
  if (!auth) return { ok: false, reason: "error" };
  if (auth.reason !== "ok")
    return {
      ok: false,
      reason: auth.reason as
        | "not_manager"
        | "not_found"
        | "not_paid"
        | "split_unsupported"
        | "already_refunded"
        | "fully_refunded",
    };

  // Execute the Stripe refund — server-derived amount + PI, idempotency-keyed on the line so a double
  // submit / retry returns the SAME refund (Stripe idempotency = the primary no-double-refund guard).
  let refundId: string;
  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: auth.payment_intent,
        amount: auth.amount_cents,
        reason: "requested_by_customer",
        metadata: { orderItemId, reasonCode: reason, initiator: caller.staffId },
      },
      { idempotencyKey: `refundline_${orderItemId}` },
    );
    refundId = refund.id;
  } catch (e) {
    console.error("[refunds] stripe refund failed", { orderItemId, error: e });
    return { ok: false, reason: "stripe_error" };
  }

  const { error: recErr } = await db.rpc("mms_record_refund", {
    p_order_item: orderItemId,
    p_amount: auth.amount_cents,
    p_stripe_refund_id: refundId,
    p_reason: reason,
    p_initiator: caller.staffId,
  });
  if (recErr)
    // The refund SUCCEEDED at Stripe; only our ledger write failed. Don't surface an error (the money moved
    // correctly). The charge.refunded webhook BACKSTOPS this: it re-records the mms_refunds ledger row +
    // mms_approvals audit from the refund's metadata (orderItemId/reasonCode/initiator we set above),
    // idempotent on the refund id — so the audit trail + the already-refunded guard are restored.
    console.error(
      "[refunds] mms_record_refund failed (refund issued; charge.refunded will re-record)",
      {
        orderItemId,
        refundId,
        message: recErr.message,
      },
    );

  revalidatePath("/staff/orders");

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "line_refunded",
          properties: { role: caller.role, reason, amount_cents: auth.amount_cents },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail an issued refund on a capture error */
      }
    });
  }
  return { ok: true, amountCents: auth.amount_cents };
}
