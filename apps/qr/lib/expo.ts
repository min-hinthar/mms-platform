"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { setTogoStatusInput } from "@mms/db/schemas";
import { requireStaff } from "./staff";
import { isConsoleLocked } from "./staff-lock";
import { getPostHogClient } from "./posthog-server";
import type { ExpoLine, ExpoPoll, ExpoTicket } from "./expo-types";

/**
 * Expo / bagging station (S4.3a, reshaped by W3a) — the takeaway counterpart to the KDS. Read-only
 * queue of PAID orders with a takeaway portion (togo food + grocery), grouped per order, plus the staff
 * bump (preparing → ready → picked_up). Server Actions are public POSTs (IDOR by default), so EVERY
 * export re-checks requireStaff() and acts via the service-role client — the client UI is the
 * affordance, never the gate (parity with lib/kitchen.ts). The queue is intentionally cross-table
 * (one bagging counter for the room).
 */

const QUEUE_CAP = 200; // a teahouse has a handful of live takeaway bags; bound the read regardless.

/**
 * Live takeaway queue: paid orders whose togo_status is preparing/ready (picked_up drops off), with
 * their takeaway order-items and a per-order call-out identity. Three bounded reads assembled in TS.
 *
 * W3a sort — EFFECTIVE DUE TIME, not bag age: `(arrived? 0 : 1, pickup_slot ?? created_at)`. A human
 * standing at the counter ("Here now") outranks everything; then bags order by when they're actually
 * due — a 6pm slot paid at noon no longer heads the queue all afternoon while a walk-up scango bag
 * waits at the bottom. K10: gate failures return a discriminant (signin/locked), never a throw the
 * client can't tell from a dropped socket.
 */
export async function getExpoQueue(): Promise<ExpoPoll> {
  try {
    await requireStaff();
  } catch {
    return { ok: false, reason: "signin" };
  }
  if (await isConsoleLocked()) return { ok: false, reason: "locked" };

  const db = serviceClient();
  const { data: dbNow } = await db.rpc("mms_now");
  const nowIso = dbNow ?? new Date().toISOString();

  const { data: orders } = await db
    .from("qr_orders")
    .select(
      "id,togo_status,session_id,table_number,pickup_slot,arrived_at,created_at,customer_name",
    )
    .in("togo_status", ["preparing", "ready"])
    .order("created_at", { ascending: true })
    .limit(QUEUE_CAP);
  if (!orders || orders.length === 0)
    return { ok: true, queue: { tickets: [], serverNow: nowIso } };

  const orderIds = orders.map((o) => o.id);
  // Only the TAKEAWAY lines (the bag) — a dine-in line on a mixed order stays on the table, not the counter.
  const { data: items } = await db
    .from("qr_order_items")
    .select("id,order_id,name,qty,modifiers,fulfillment,notes")
    .in("order_id", orderIds)
    .in("fulfillment", ["togo", "grocery"]);
  const linesByOrder = new Map<string, ExpoLine[]>();
  for (const it of items ?? []) {
    const line: ExpoLine = {
      id: it.id,
      name: it.name,
      qty: it.qty,
      modifiers: Array.isArray(it.modifiers) ? (it.modifiers as string[]) : [],
      fulfillment: it.fulfillment === "grocery" ? "grocery" : "togo",
      notes: it.notes ?? null,
    };
    const arr = linesByOrder.get(it.order_id);
    if (arr) arr.push(line);
    else linesByOrder.set(it.order_id, [line]);
  }

  const sessionIds = [...new Set(orders.map((o) => o.session_id).filter((s): s is string => !!s))];
  const { data: sessions } = sessionIds.length
    ? await db.from("table_sessions").select("id,qr_code,mode").in("id", sessionIds)
    : { data: [] as { id: string; qr_code: string; mode: string }[] };
  const sessById = new Map((sessions ?? []).map((s) => [s.id, s]));

  const tickets: ExpoTicket[] = [];
  for (const o of orders) {
    const lines = linesByOrder.get(o.id);
    if (!lines || lines.length === 0) continue; // no takeaway line snapshot — not a bag (defensive)
    const sess = o.session_id ? sessById.get(o.session_id) : undefined;
    tickets.push({
      orderId: o.id,
      label: sess?.qr_code ?? "Order",
      // K2: the denormalized table snapshot (stamped at fulfillment) — durable past session expiry,
      // and null for a pickup/scango bag (no table). Read off the ORDER, not the (maybe-gone) session.
      tableNumber: o.table_number ?? null,
      mode: sess?.mode ?? "scango",
      customerName: o.customer_name ?? null,
      shortCode: o.id.slice(-6).toUpperCase(),
      status: o.togo_status === "ready" ? "ready" : "preparing",
      pickupSlot: o.pickup_slot ?? null,
      arrivedAt: o.arrived_at ?? null,
      lines,
      createdAt: o.created_at,
    });
  }

  // W3a: effective due time. "Here now" pins (a waiting HUMAN outranks bag age); then due = the
  // pickup slot when one exists, else payment time. Stable tiebreak on the short code.
  tickets.sort((a, b) => {
    const arrived = Number(!a.arrivedAt) - Number(!b.arrivedAt);
    if (arrived !== 0) return arrived;
    const dueA = new Date(a.pickupSlot ?? a.createdAt).getTime();
    const dueB = new Date(b.pickupSlot ?? b.createdAt).getTime();
    if (dueA !== dueB) return dueA - dueB;
    return a.orderId.localeCompare(b.orderId);
  });
  return { ok: true, queue: { tickets, serverNow: nowIso } };
}

export type ExpoActionResult = { ok: true } | { ok: false; error: string };

/**
 * Advance an order's takeaway status (S4.3a): preparing → ready (bagged, tell the diner) → picked_up
 * (handed off, drops off the board). Staff-gated; mms_set_togo_status re-asserts the legal edge IN the
 * write ('stale' on a raced/illegal transition) and stamps togo_ready_at/togo_picked_up_at (W3e — the
 * order-ready board's flash + auto-clear read the real transition times). The order's UPDATE is the
 * realtime trigger that lights the diner's /track. revalidate the expo so the initiating staff device
 * reflects it immediately too.
 */
export async function setTogoStatus(raw: unknown): Promise<ExpoActionResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };
  const parsed = setTogoStatusInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { orderId, to } = parsed.data;

  const { data, error } = await serviceClient().rpc("mms_set_togo_status", {
    p_order: orderId,
    p_to: to,
  });
  if (error) {
    console.error("[expo] mms_set_togo_status failed", { orderId, to, message: error.message });
    return { ok: false, error: "Couldn’t update that bag. Try again." };
  }
  if (data !== "ok") return { ok: false, error: "That bag was already updated — refreshing." }; // 'stale'/'bad_status'

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "expo_set_togo_status",
          properties: { role: caller.role, to },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail a bump on a capture error */
      }
    });
  }
  revalidatePath("/staff/expo");
  return { ok: true };
}
