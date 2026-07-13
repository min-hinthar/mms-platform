"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { setTogoStatusInput } from "@mms/db/schemas";
import { requireStaff } from "./staff";
import { getPostHogClient } from "./posthog-server";
import type { ExpoLine, ExpoQueue, ExpoTicket } from "./expo-types";

/**
 * Expo / bagging station (S4.3a) — the takeaway counterpart to the KDS. Read-only queue of PAID orders
 * with a takeaway portion (togo food + grocery), grouped per order, plus the staff bump (preparing →
 * ready → picked_up). Server Actions are public POSTs (IDOR by default), so EVERY export re-checks
 * requireStaff() and acts via the service-role client — the client UI is the affordance, never the gate
 * (parity with lib/kitchen.ts). The queue is intentionally cross-table (one bagging counter for the room).
 */

const QUEUE_CAP = 200; // a teahouse has a handful of live takeaway bags; bound the read regardless.

/**
 * Live takeaway queue: paid orders whose togo_status is preparing/ready (picked_up drops off), with their
 * takeaway order-items (fulfillment in togo/grocery — the per-line tag S4.3a snapshots onto the order) and
 * a per-order label. Three bounded reads (orders → their takeaway items → those sessions' labels),
 * assembled in TS — a fixed round-trip count. Oldest-first so a forgotten bag floats to the top.
 */
export async function getExpoQueue(): Promise<ExpoQueue> {
  await requireStaff();
  const db = serviceClient();
  const { data: dbNow } = await db.rpc("mms_now");
  const nowIso = dbNow ?? new Date().toISOString();

  const { data: orders } = await db
    .from("qr_orders")
    .select("id,togo_status,session_id,table_number,pickup_slot,arrived_at,created_at")
    .in("togo_status", ["preparing", "ready"])
    .order("created_at", { ascending: true })
    .limit(QUEUE_CAP);
  if (!orders || orders.length === 0) return { tickets: [], serverNow: nowIso };

  const orderIds = orders.map((o) => o.id);
  // Only the TAKEAWAY lines (the bag) — a dine-in line on a mixed order stays on the table, not the counter.
  const { data: items } = await db
    .from("qr_order_items")
    .select("id,order_id,name,qty,modifiers,fulfillment")
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
      status: o.togo_status === "ready" ? "ready" : "preparing",
      pickupSlot: o.pickup_slot ?? null,
      arrivedAt: o.arrived_at ?? null,
      lines,
      createdAt: o.created_at,
    });
  }
  return { tickets, serverNow: nowIso };
}

export type ExpoActionResult = { ok: true } | { ok: false; error: string };

/**
 * Advance an order's takeaway status (S4.3a): preparing → ready (bagged, tell the diner) → picked_up
 * (handed off, drops off the board). Staff-gated; mms_set_togo_status re-asserts the legal edge IN the
 * write ('stale' on a raced/illegal transition). The order's UPDATE is the realtime trigger that lights
 * the diner's /track. revalidate the expo so the initiating staff device reflects it immediately too.
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
        /* analytics best-effort */
      }
    });
  }
  revalidatePath("/staff/expo");
  return { ok: true };
}
