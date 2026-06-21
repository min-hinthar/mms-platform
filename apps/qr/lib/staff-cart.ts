"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { setQtyInput, settleCashInput, staffAddItemInput } from "@mms/db/schemas";
import { requireStaff } from "./staff";
import { lineTax } from "./tax";
import { getCartTotals } from "./totals";
import { insertOrIncLine, priceItem, touchCart } from "./order-lines";
import { paymentInFlightReason } from "./pay-guard";
import { getPostHogClient } from "./posthog-server";

/**
 * Staff write to a table order (S1.3) — "order for a guest" + cash settle ("pay a human"). The cart
 * belongs to the TABLE, not the phone (ORDER-MODEL): staff write the SAME ledger a diner does, through
 * the SAME server-authoritative pricing (lib/order-lines.ts) and the SAME status-atomic RPCs — the only
 * difference is the authorization (requireStaff, not assertCartMember) and provenance (by_seat = null,
 * "added by server"). Server Actions are public POSTs (IDOR by default), so every export re-checks
 * requireStaff() and acts via the service-role client. Money is integer CENTS end-to-end; the client
 * never sends a price or a total.
 */

export type StaffWriteResult = { ok: true } | { ok: false; error: string };
export type SettleCashResult =
  | { ok: true; orderId: string; totalCents: number }
  | { ok: false; error: string };

/** Resolve the open cart for a session (the table's live order). Returns null when the session is
 *  closed or has no open cart (already settled/cancelled). */
async function openCartFor(sessionId: string) {
  const db = serviceClient();
  const { data: session } = await db
    .from("table_sessions")
    .select("id,status,mode")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status === "closed") return { session: null, cart: null };
  const { data: cart } = await db
    .from("qr_carts")
    .select("id,locked,locked_at,settle_at")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  return { session, cart };
}

/**
 * Add an item to a table's open cart FOR a guest. Re-derives price/tax server-side (priceItem), merges
 * identical lines, and attributes the line to no seat (by_seat = null). Refused while a payment is in
 * flight (shared mutex with cash settle / clear-table) — staff mustn't change a total a diner is paying.
 */
export async function staffAddItem(raw: unknown): Promise<StaffWriteResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };
  const parsed = staffAddItemInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sessionId, menuItemId, modifierIds } = parsed.data;

  const { session, cart } = await openCartFor(sessionId);
  if (!session) return { ok: false, error: "That table is closed." };
  if (!cart) return { ok: false, error: "This table has no open order." };
  if (await paymentInFlightReason(cart))
    return { ok: false, error: "This table is mid-payment — wait until they’ve finished." };

  try {
    const dineIn = session.mode === "dinein";
    const { name, unitPriceCents, category, opts } = await priceItem(menuItemId, modifierIds);
    const taxCents = lineTax(unitPriceCents, category, dineIn);
    // by_seat = null: a staff-added line isn't pre-attributed to a guest's split (the host can assign it
    // later via the existing by-person flow). The status-atomic insert throws if the cart isn't open.
    await insertOrIncLine(cart.id, { menuItemId, name, opts, unitPriceCents, taxCents }, null);
    await touchCart(cart.id, "staffAddItem");
  } catch {
    // priceItem (unknown item) or a closed-cart race — honest, non-leaking copy.
    return { ok: false, error: "Couldn’t add that item." };
  }

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "staff_added_item",
          properties: { role: caller.role, sessionId, menuItemId },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort */
      }
    });
  }
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true };
}

/**
 * Set the qty of a line on a table order (0 removes it) — the staff edit on the drill-down. No
 * canMutateLine restriction: staff have authority over any line (unlike a diner, who's guest-own-only).
 * Status-atomic + refused mid-payment. `sessionId` scopes the refresh/revalidate and verifies the line
 * really belongs to this table (defense against a mismatched id).
 */
export async function staffSetQty(sessionId: string, raw: unknown): Promise<StaffWriteResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };
  const parsed = setQtyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { cartItemId, qty } = parsed.data;

  const { session, cart } = await openCartFor(sessionId);
  if (!session) return { ok: false, error: "That table is closed." };
  if (!cart) return { ok: false, error: "This table has no open order." };
  if (await paymentInFlightReason(cart))
    return { ok: false, error: "This table is mid-payment — wait until they’ve finished." };

  const db = serviceClient();
  // The line must belong to THIS table's open cart (an id from another table is a not-found, not an edit).
  const { data: line } = await db
    .from("qr_cart_items")
    .select("id")
    .eq("id", cartItemId)
    .eq("cart_id", cart.id)
    .maybeSingle();
  if (!line) return { ok: false, error: "That item isn’t on this table." };

  // Status-atomic set/delete (qty<=0 removes) — applies only while the cart is 'open' (same RPC the
  // diner path uses). 0 rows ⇒ the cart flipped paid/closed under us.
  const { data: affected } = await db.rpc("mms_cart_item_set_qty_if_open", {
    p_id: cartItemId,
    p_qty: qty,
  });
  if (!affected) return { ok: false, error: "This table’s order is no longer open." };
  await touchCart(cart.id, "staffSetQty");
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true };
}

/**
 * Settle the table order in CASH ("pay a human"). Re-derives the authoritative total server-side
 * (getCartTotals — the single tax engine), then records an idempotent cash order via
 * mms_fulfill_cash_order (atomic open→paid flip, subtotal reconcile, cart-id idempotency). tip_cents=0:
 * a cash tip is in-hand / off-system (Min's call); the SB-1524 service charge is still applied + shown.
 * Refused while a card payment / split is in flight (shared mutex) so cash can't double-charge a table.
 */
export async function settleCash(raw: unknown): Promise<SettleCashResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };
  const parsed = settleCashInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sessionId } = parsed.data;

  const { session, cart } = await openCartFor(sessionId);
  if (!session) return { ok: false, error: "That table is closed." };
  if (!cart) return { ok: false, error: "This table has no open order to settle." };
  if (await paymentInFlightReason(cart))
    return {
      ok: false,
      error: "Someone’s already paying on their phone — wait for that to finish.",
    };

  const db = serviceClient();
  const { count } = await db
    .from("qr_cart_items")
    .select("id", { count: "exact", head: true })
    .eq("cart_id", cart.id);
  if ((count ?? 0) === 0) return { ok: false, error: "There’s nothing on this table to settle." };

  // Authoritative breakdown (cents), tip=0 for cash. The RPC re-derives the subtotal from the live
  // lines and reconciles it against this — a diner racing the settle raises instead of recording stale.
  const totals = await getCartTotals(cart.id, 0);
  const { data: orderId, error } = await db.rpc("mms_fulfill_cash_order", {
    p_cart_id: cart.id,
    p_settled_by: caller.staffId,
    p_subtotal_cents: totals.subtotalCents,
    p_discount_cents: totals.discountCents,
    p_service_charge_cents: totals.serviceChargeCents,
    p_tax_cents: totals.taxCents,
    p_tip_cents: 0,
  });
  if (error || !orderId) {
    console.error("[staff-cart] mms_fulfill_cash_order failed", {
      sessionId,
      cartId: cart.id,
      message: error?.message,
    });
    // A subtotal-mismatch raise means the cart changed under the settle — steer staff to retry fresh.
    return { ok: false, error: "Couldn’t settle — the order changed. Check it and try again." };
  }

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "staff_settle_cash",
          properties: {
            role: caller.role,
            mode: session.mode,
            sessionId,
            total_cents: totals.totalCents,
            item_count: count ?? 0,
          },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail a settled order on a capture error */
      }
    });
  }
  revalidatePath("/staff");
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true, orderId, totalCents: totals.totalCents };
}
