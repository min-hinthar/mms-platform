"use server";
import { serviceClient } from "@mms/db/server";
import { announceArrivalInput } from "@mms/db/schemas";
import { assertSessionMember } from "./authz";
import { assertMutationRate } from "./rate";

/**
 * J5 — the pickup "I'm here" ping (deferred from J3 to this migration window). Stamps
 * `qr_orders.arrived_at` ONCE for the caller's own order; the expo board reads it over the existing
 * floor realtime path (the qr_orders UPDATE event it already watches) — no broadcast channel, no new
 * realtime policy.
 *
 * AuthZ: the caller must be a member of the order's session (assertSessionMember — the same gate the
 * order read rides via RLS). Idempotent in the SQL statement: `.is("arrived_at", null)` makes a
 * double-tap / offline-retry a no-op, and the update touches nothing else (never the money or status
 * columns — a hostile client gets exactly one nullable timestamp of write surface).
 */
export type AnnounceArrivalResult = { ok: true } | { ok: false; error: string };

export async function announceArrival(raw: { orderId: string }): Promise<AnnounceArrivalResult> {
  const parsed = announceArrivalInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Couldn’t let the counter know — try again." };
  const { orderId } = parsed.data;

  const db = serviceClient();
  const { data: order } = await db
    .from("qr_orders")
    .select("id,session_id,arrived_at")
    .eq("id", orderId)
    .maybeSingle();
  // One generic error for unknown/not-yours (no existence oracle) — membership is asserted BEFORE the
  // already-stamped success short-circuit, so a non-member replaying a leaked order id can't tell a
  // stamped order from an unknown one.
  if (!order || !order.session_id)
    return { ok: false, error: "Couldn’t let the counter know — try again." };
  try {
    const { uid } = await assertSessionMember(order.session_id);
    // Same per-device flood guard as every diner mutation (P3.4) — hammering an unstamped order id
    // must not buy unbounded service-role work, even though the write surface is one timestamp.
    await assertMutationRate(uid);
  } catch {
    return { ok: false, error: "Couldn’t let the counter know — try again." };
  }
  // Already stamped (a double-tap / offline retry) is a MEMBER's success — the counter already knows.
  if (order.arrived_at) return { ok: true };

  const { error } = await db
    .from("qr_orders")
    .update({ arrived_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("arrived_at", null); // idempotence in the statement, not just the read above
  if (error) {
    console.error("[arrival] stamp failed", { orderId, message: error.message });
    return { ok: false, error: "Couldn’t let the counter know — try again." };
  }
  return { ok: true };
}
