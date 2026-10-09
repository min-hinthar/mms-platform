import "server-only";
import { serviceClient } from "@mms/db/server";
import { announceArrivalInput } from "@mms/db/schemas";
import { assertSessionMember, AuthzError, getCallerUid } from "./authz";
import { assertMutationRate } from "./rate";
import { COUNTER_TENDERS } from "./counter-tender";
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
 * four hours ahead, session-ttl.ts), one of the DURABLE proofs the tracker's own fallback read
 * accepts (`getMyOrderFallback`, lib/orders.ts; Codex r1 on #330): the diner the order was EARNED BY
 * (`earned_by`, stamped at fulfilment), a split PAYER of it (`qr_order_payers`), or — for a
 * COUNTER-paid order only (`COUNTER_TENDERS`, the one shared list; Codex r2) — a seat in its session
 * whatever that session's status now (`session_members`, the counter arm). Without these
 * "I’m here" refused every tap on exactly the far-booked pickup M65 is about. A transport failure
 * on any proof is `failed` — never a decided refusal that would retire the guest's pending record.
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
       *  bag already left; `closed` — the order is no longer paid (refunded / failed); `rate` — too
       *  many taps; `failed` — the UPDATE, or a proof it depends on, could not be read. Every value
       *  but `rate` and `failed` is a decided answer the client may act on. */
      reason: "unauthorized" | "not_today" | "collected" | "closed" | "rate" | "failed";
    };

export async function stampArrival(raw: { orderId: string }, nowMs: number): Promise<ArrivalWrite> {
  const parsed = announceArrivalInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "unauthorized" };
  const { orderId } = parsed.data;

  const db = serviceClient();
  const { data: order, error: lookupErr } = await db
    .from("qr_orders")
    .select("id,session_id,earned_by,arrived_at,tender")
    .eq("id", orderId)
    .maybeSingle();
  // A read that FAILED is not a read that found nothing (Codex r2 on #330): `unauthorized` is a
  // decided answer the client retires its pending record on, so a transient error must stay
  // `failed` and the arrival is retried on the next visit.
  if (lookupErr) {
    console.error("[arrival] order lookup failed", { orderId, message: lookupErr.message });
    return { ok: false, reason: "failed" };
  }
  // One generic answer for unknown/not-yours — authorization is decided BEFORE the already-stamped
  // success short-circuit, so a non-member replaying a leaked order id can't tell a stamped order
  // from an unknown one.
  if (!order) return { ok: false, reason: "unauthorized" };
  const authz = await authorizedUid(db, order);
  if ("refused" in authz) return { ok: false, reason: authz.refused };
  const { uid } = authz;
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
    .eq("status", "paid") // a refunded or failed order never takes an arrival (Codex r1 on #330)
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
      .select("arrived_at,togo_status,status")
      .eq("id", orderId)
      .maybeSingle();
    if (after?.arrived_at) return { ok: true };
    if (after && after.status !== "paid") return { ok: false, reason: "closed" };
    if (after?.togo_status === "picked_up") return { ok: false, reason: "collected" };
    return { ok: false, reason: "not_today" };
  }
  return { ok: true };
}

type Authz = { uid: string } | { refused: "unauthorized" | "failed" };

/** A proof that could not be READ (the auth transport, a table) is not a refusal. */
function unavailable(e: unknown): boolean {
  return e instanceof AuthzError && e.code === "unavailable";
}

/** The session arm first (the live read's own gate), then the durable proofs the tracker's fallback
 *  read accepts: `earned_by`, a split payer row, a seat in the order's session whatever its status. */
async function authorizedUid(
  db: ReturnType<typeof serviceClient>,
  order: { id: string; session_id: string | null; earned_by: string | null; tender: string | null },
): Promise<Authz> {
  if (order.session_id) {
    try {
      const { uid } = await assertSessionMember(order.session_id);
      return { uid };
    } catch (e) {
      if (unavailable(e)) return { refused: "failed" };
      /* the session lapsed or the caller is not a member — the durable proofs decide below */
    }
  }
  let uid: string;
  try {
    uid = await getCallerUid();
  } catch (e) {
    return { refused: unavailable(e) ? "failed" : "unauthorized" };
  }
  if (order.earned_by === uid) return { uid };
  const { data: payer, error: payerErr } = await db
    .from("qr_order_payers")
    .select("order_id")
    .eq("order_id", order.id)
    .eq("payer_uid", uid)
    .limit(1)
    .maybeSingle();
  if (payerErr) return { refused: "failed" };
  if (payer) return { uid };
  // A seat is the COUNTER arm's proof, and only for a counter-paid order — the same gate
  // `getMyOrderFallback` applies before it reads `session_members` (Codex r2 on #330). A card-paid
  // pickup's former tablemate kept a seat in the session, not a claim on someone else's bag.
  const counterPaid = (COUNTER_TENDERS as readonly string[]).includes(order.tender ?? "");
  if (order.session_id && counterPaid) {
    const { data: seat, error: seatErr } = await db
      .from("session_members")
      .select("seat_id")
      .eq("session_id", order.session_id)
      .eq("seat_id", uid)
      .limit(1)
      .maybeSingle();
    if (seatErr) return { refused: "failed" };
    if (seat) return { uid };
  }
  return { refused: "unauthorized" };
}
