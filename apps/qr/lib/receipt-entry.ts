import "server-only";
import { serviceClient } from "@mms/db/server";
import type { OrderHistoryEntry, OrderHistoryLine } from "./rewards";
import { summarizeRefund } from "./refund-view";
import { parseDroppedLines } from "./dropped-view";

/**
 * W7a — the session-less receipt read. ⚠️ Deliberately a `server-only` MODULE, not a `"use server"`
 * action (review HIGH): every export of an action module is a POST-able endpoint, and this read
 * trades a bare order id for a full receipt with NO internal auth — its callers own the
 * authorization (the resolved bearer token on `/track?r=`, or `callerMayReceiveReceipt` inside the
 * actions). Exporting it as an action would have made the order id a credential — exactly what the
 * lib/orders.ts doctrine forbids.
 */

/** Statuses a receipt exists for: settled money. `refunded` is INCLUDED (review MED) — a diner
 *  needs the documentation of a refunded charge MORE, not less; the artifact stamps it honestly. */
export const RECEIPT_STATUSES = ["paid", "refunded"] as const;

export type ReceiptEntry = OrderHistoryEntry & {
  /** W22r — the pickup contact name (qr_orders.customer_name); null on dine-in/legacy rows. */
  customerName: string | null;
};

export async function getReceiptEntry(orderId: string): Promise<ReceiptEntry | null> {
  const db = serviceClient();
  const { data: o, error } = await db
    .from("qr_orders")
    .select(
      "id,created_at,total_cents,refunded_cents,dropped_lines,tender,pickup_slot,table_number,customer_name,subtotal_cents,discount_cents,service_charge_cents,tax_cents,tip_cents,status",
    )
    .eq("id", orderId)
    .in("status", [...RECEIPT_STATUSES])
    .maybeSingle();
  if (error || !o) return null;
  const { data: items } = await db
    .from("qr_order_items")
    .select("name,qty,unit_price_cents,modifiers,fulfillment,notes,refunded_cents")
    .eq("order_id", orderId)
    .order("id"); // deterministic — page, email, and print must list the same receipt identically
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
      // W22r — the kitchen note is part of what was ordered; the receipt documents it. The item
      // sheet promises "add any allergy in the note below and the kitchen will see it" — the
      // artifact proving the note existed matters exactly when that promise matters.
      notes: typeof it.notes === "string" && it.notes.trim() !== "" ? it.notes : null,
      // W23b — which dish came back. The durable receipt is the artifact a guest keeps and forwards
      // to their bank; a line that was refunded has to say so on the copy they hold.
      refundedCents: it.refunded_cents ?? 0,
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
    // W22r — the pickup contact name (W21's required pickup field): a pickup receipt names who
    // it's for, exactly like the counter ticket does. Null on dine-in/legacy rows.
    customerName: o.customer_name ?? null,
    breakdown: {
      subtotalCents: o.subtotal_cents ?? 0,
      discountCents: o.discount_cents ?? 0,
      serviceChargeCents: o.service_charge_cents ?? 0,
      taxCents: o.tax_cents ?? 0,
      tipCents: o.tip_cents ?? 0,
    },
    lines,
    // W23b — derived ONCE, in the read, so the durable page, the email and the print share one
    // verdict. A PARTIAL refund leaves status at 'paid', which is why a boolean could never have
    // carried this and why this receipt used to say "Paid in full" over returned money.
    refund: summarizeRefund(o.total_cents, o.refunded_cents ?? 0, o.status),
    // W23d — the same snapshot the /track slip renders. The durable receipt is the copy a guest
    // keeps and forwards; an order whose basket shrank between the tap and the charge has to say so
    // on the artifact, not only on the live screen they may already have closed.
    dropped: parseDroppedLines(o.dropped_lines),
  };
}
