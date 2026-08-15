import "server-only";
import { serviceClient } from "@mms/db/server";
import type { OrderHistoryEntry, OrderHistoryLine } from "./rewards";

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
  /** The order was fully refunded after settlement — the artifact stamps "Refunded". */
  refunded: boolean;
};

export async function getReceiptEntry(orderId: string): Promise<ReceiptEntry | null> {
  const db = serviceClient();
  const { data: o, error } = await db
    .from("qr_orders")
    .select(
      "id,created_at,total_cents,tender,pickup_slot,table_number,subtotal_cents,discount_cents,service_charge_cents,tax_cents,tip_cents,status",
    )
    .eq("id", orderId)
    .in("status", [...RECEIPT_STATUSES])
    .maybeSingle();
  if (error || !o) return null;
  const { data: items } = await db
    .from("qr_order_items")
    .select("name,qty,unit_price_cents,modifiers,fulfillment")
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
    refunded: o.status === "refunded",
  };
}
