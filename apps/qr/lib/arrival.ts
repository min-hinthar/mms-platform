import "server-only";
import { serviceClient } from "@mms/db/server";
import { announceArrivalInput } from "@mms/db/schemas";
import { assertSessionMember, getCallerUid } from "./authz";
import { assertMutationRate } from "./rate";
import { pickupDayBounds } from "./pickup-promise";

/**
 * J5 → PD3 — the pickup "I’m here" stamp, the ONE write behind the Server Action
 * (`lib/arrival-action.ts`), the `pagehide` beacon and the next-visit reconcile
 * (`app/api/track/arrival/route.ts`). Stamps `qr_orders.arrived_at` ONCE for the caller's own
 * order; the expo board reads it over the existing floor realtime path (the qr_orders UPDATE event
 * it already watches) and the counter bell rings `here:` for it (lib/counter-attention.ts).
 *
 * ⚠️ NOT a `"use server"` module: every export of one is a public POST, and this function takes the
 * clock as a parameter so the suite can pin the day rule — a client must never be able to pass it.
 *
 * AuthZ (m3 decision 22): the caller is a member of the order's session (`assertSessionMember`, the
 * gate the order read rides via RLS) — or, once that session has lapsed (a pickup booked more than
 * four hours ahead, session-ttl.ts), the diner the order was EARNED BY (`earned_by`, stamped at
 * fulfilment, the authority `getMyOrderFallback` already reads). Without the second arm "I’m here"
 * refused every tap on exactly the far-booked pickup M65 is about.
 *
 * The write is guarded IN THE STATEMENT, not only in the read above it (the CLAUDE.md W17 rule):
 *   - `.is("arrived_at", null)` — idempotent: a double-tap, a beacon AND a reconcile, a second tab
 *     all record ONE arrival;
 *   - `.gte/.lt("pickup_slot", today)` — decision 5's same-day rule, the restaurant's calendar day
 *     (`pickupDayBounds`), so a couch tap the night before never rings Dad's bell;
 *   - `.or(togo_status is null | <> 'picked_up')` — a collected bag never takes an arrival (null is
 *     a pickup the webhook has not initialised yet, which still does);
 *   - `.select("id")` + a row check — `.update()` reports success on zero rows, so a blocked write
 *     would otherwise answer `ok` and the card would say the counter knows.
 */
export type ArrivalWrite =
  | { ok: true }
  | {
      ok: false;
      /** `unauthorized` — unknown, malformed or not the caller's (ONE answer: no existence oracle);
       *  `not_today` — the slot is on another day (or the order is not a pickup); `collected` — the
       *  bag already left; `rate` — too many taps; `failed` — the UPDATE itself failed. Every value
       *  but `failed` is a decided answer the client may act on. */
      reason: "unauthorized" | "not_today" | "collected" | "rate" | "failed";
    };

export async function stampArrival(raw: { orderId: string }, nowMs: number): Promise<ArrivalWrite> {
  const parsed = announceArrivalInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "unauthorized" };
  const { orderId } = parsed.data;

  const db = serviceClient();
  const { data: order } = await db
    .from("qr_orders")
    .select("id,session_id,earned_by,arrived_at")
    .eq("id", orderId)
    .maybeSingle();
  // One generic answer for unknown/not-yours — authorization is decided BEFORE the already-stamped
  // success short-circuit, so a non-member replaying a leaked order id can't tell a stamped order
  // from an unknown one.
  if (!order) return { ok: false, reason: "unauthorized" };
  const uid = await authorizedUid(order.session_id, order.earned_by);
  if (!uid) return { ok: false, reason: "unauthorized" };
  // Same per-device flood guard as every diner mutation (P3.4) — hammering an unstamped order id
  // must not buy unbounded service-role work, even though the write surface is one timestamp.
  try {
    await assertMutationRate(uid);
  } catch {
    return { ok: false, reason: "rate" };
  }
  // Already stamped (a double-tap, a beacon that landed, a second tab) is a MEMBER's success — the
  // counter already knows.
  if (order.arrived_at) return { ok: true };

  const { start, end } = pickupDayBounds(nowMs);
  const { data: rows, error } = await db
    .from("qr_orders")
    .update({ arrived_at: new Date(nowMs).toISOString() })
    .eq("id", orderId)
    .is("arrived_at", null) // idempotence in the statement, not just the read above
    .gte("pickup_slot", start)
    .lt("pickup_slot", end) // the pickup's own day — decision 5, enforced here, not only drawn
    .or("togo_status.is.null,togo_status.neq.picked_up") // a collected bag never takes an arrival
    .select("id");
  if (error) {
    console.error("[arrival] stamp failed", { orderId, message: error.message });
    return { ok: false, reason: "failed" };
  }
  if ((rows ?? []).length === 0) {
    // The statement refused. Say WHICH guard, from a fresh read — the answer decides whether the
    // card returns to the question (not today) or the pending record is simply retired (collected,
    // or a race that stamped it meanwhile).
    const { data: after } = await db
      .from("qr_orders")
      .select("arrived_at,togo_status")
      .eq("id", orderId)
      .maybeSingle();
    if (after?.arrived_at) return { ok: true };
    if (after?.togo_status === "picked_up") return { ok: false, reason: "collected" };
    return { ok: false, reason: "not_today" };
  }
  return { ok: true };
}

/** The session arm first (the live read's own gate), then the durable earned_by arm. Null = neither. */
async function authorizedUid(
  sessionId: string | null,
  earnedBy: string | null,
): Promise<string | null> {
  if (sessionId) {
    try {
      const { uid } = await assertSessionMember(sessionId);
      return uid;
    } catch {
      /* the session lapsed or the caller is not a member — the earned_by arm decides below */
    }
  }
  if (!earnedBy) return null;
  try {
    const uid = await getCallerUid();
    return earnedBy === uid ? uid : null;
  } catch {
    return null;
  }
}
