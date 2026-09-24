"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { staffFireInput, staffUndoFireInput } from "@mms/db/schemas";
import { getStaffAuth, roleAtLeast, type StaffCaller } from "./staff";
import { openCartFor } from "./staff-open-cart";
import { paymentInFlightReason } from "./pay-guard";
import { touchCart } from "./order-lines";
import { maybeRenewSession } from "./authz";
import { getPostHogClient } from "./posthog-server";
import type { StaffFireResult, StaffSendReason, StaffUndoResult } from "./staff-send-view";

/**
 * Phase 2a · send — the staff console's "Send to kitchen" and its take-back (P2k).
 *
 * `staffFireCart` used to live in `kitchen.ts` with no caller. Wired as it stood it would have lied
 * three ways: on a counter cart the RPC fires nothing and it said "it's all in the kitchen already"
 * over unsent food; it dropped the RPC's batch and deadline, so a mis-tap on a shared tablet could
 * not be undone; and it ignored a live payment the diner's own `sendToKitchen` refuses under. It
 * moved here (out of the KDS module, which reads the queue) and every refusal is now a member of one
 * union decided by WHERE it happened — never by the text of a message — so the table page maps it to
 * the device language (`fireNotice` / `undoNotice` in `staff-send-view.ts`).
 *
 * Server Actions are public POSTs (IDOR by default): both exports gate on the staff session first and
 * write only through the service-role RPCs, whose own statements carry every status guard (fire:
 * cart open, session dine-in, line draft, fulfillment dine-in; undo: fired, not comped, still in
 * grace, this batch, cart open, dine-in — 20260624030000_s4_money_remediation.sql). The pre-reads
 * here decide the HONEST refusal; the SQL decides what actually moves, so a race between the read
 * and the write fails safe.
 *
 * A fire that races a settle freeze is benign: the lines are charged either way, and
 * `mms_fire_pending_food` is idempotent on fired lines. No amount is read or written here.
 */

type GateRefusal = { ok: false; reason: Extract<StaffSendReason, "signin" | "outage" | "role"> };

/** The staff gate, answering a REASON by where it failed (the auth read, the staff row, the role)
 *  rather than `staffGate`'s sentence — a sentence the client would have to match by text. */
async function sendGate(): Promise<{ ok: true; caller: StaffCaller } | GateRefusal> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "signin" };
  if (!roleAtLeast(auth.caller.role, "server")) return { ok: false, reason: "role" };
  return { ok: true, caller: auth.caller };
}

type TableRefusal = {
  ok: false;
  reason: Extract<StaffSendReason, "outage" | "closed" | "counter" | "paying">;
};

/** The shared prefix: the session's open cart, dine-in, and no money moving on it. */
async function sendableTable(sessionId: string) {
  const { session, cart, unavailable } = await openCartFor(sessionId);
  // W10b — an unread table is not a closed one; name the outage.
  if (unavailable) return { ok: false, reason: "outage" } satisfies TableRefusal;
  if (!session || !cart) return { ok: false, reason: "closed" } satisfies TableRefusal;
  // A counter (pickup / scan-and-go) order cooks when it is PAID — the fire RPC is dine-in only, so
  // without this the answer would be "nothing to send" over a cart full of unsent food.
  if (session.mode !== "dinein") return { ok: false, reason: "counter" } satisfies TableRefusal;
  // Parity with the diner's sendToKitchen (locked / settling): never move lines under a payment.
  if (await paymentInFlightReason(cart))
    return { ok: false, reason: "paying" } satisfies TableRefusal;
  return { ok: true as const, session, cart };
}

/**
 * The after-commit tail both actions share: re-sync the host's phone (the cart's `updated_at` is
 * what the diner realtime watches), slide the table's expiry (staff are working it — a phone-less
 * table otherwise aged off the floor and the KDS 4h after "Start a table"), and refresh the pages.
 * Each step is non-fatal and CONTAINED (the renewal contains its own): the write already committed,
 * and a throw here would turn a successful send into "couldn't confirm" and cost the undo its batch.
 */
async function afterCommit(
  sessionId: string,
  cartId: string,
  expiresAt: string,
  ctx: string,
): Promise<void> {
  try {
    await touchCart(cartId, ctx);
  } catch (e) {
    console.error(`[staff-send] touchCart threw (${ctx})`, e); // deliberate: the write committed
  }
  await maybeRenewSession(serviceClient(), sessionId, expiresAt); // non-throwing by contract
  revalidatePath(`/staff/table/${sessionId}`);
  revalidatePath("/staff/kitchen");
}

function capture(caller: StaffCaller, event: string, properties: Record<string, string | number>) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  after(async () => {
    try {
      const ph = getPostHogClient();
      ph.capture({
        distinctId: `staff:${caller.staffId}`,
        event,
        properties: { role: caller.role, ...properties },
      });
      await ph.flush();
    } catch {
      /* deliberate: analytics are best-effort and never fail a send */
    }
  });
}

/**
 * Send the table's unsent dine-in round to the kitchen. Returns the RPC's batch and the server's
 * deadline beside `serverNow` — the diner's `SendToKitchenResult` shape — so the console counts the
 * server-MEASURED grace down from its own receipt (`lib/send-grace.ts`) and its Undo targets exactly
 * this batch.
 */
export async function staffFireCart(raw: unknown): Promise<StaffFireResult> {
  const gate = await sendGate();
  if (!gate.ok) return gate;
  const parsed = staffFireInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { sessionId } = parsed.data;

  const table = await sendableTable(sessionId);
  if (!table.ok) return table;

  const { data: rows, error } = await serviceClient().rpc("mms_fire_cart", {
    p_cart_id: table.cart.id,
  });
  if (error) {
    console.error("[staff-send] mms_fire_cart failed", { sessionId, message: error.message });
    return { ok: false, reason: "failed" };
  }
  // mms_fire_cart returns (fired, batch, fire_deadline) — the batch and deadline it stamped, read
  // from the write itself (a read-back could be won by a concurrent make-it-now).
  const row = rows?.[0];
  const fired = row?.fired ?? 0;
  // Nothing still draft and dine-in: a colleague (or the host's phone) sent it first, or only to-go
  // lines remain. The refreshed slot then says which.
  if (!fired) return { ok: false, reason: "nothing" };

  await afterCommit(sessionId, table.cart.id, table.session.expires_at, "staffFireCart");
  capture(gate.caller, "staff_fire_cart", { sessionId, lines: fired });
  return {
    ok: true,
    fired,
    undoUntil: row?.fire_deadline ?? null,
    serverNow: new Date().toISOString(),
    undoBatch: row?.batch ?? null,
  };
}

/**
 * Take back the batch THIS console's send fired, while it is still in the grace. The grace, the
 * batch, the not-comped rule and the open dine-in cart are all re-checked in `mms_undo_fire`'s one
 * statement; 0 rows means the kitchen already has it → `expired`, which the page answers with the
 * Void / Comp steer, never a silent success.
 */
export async function staffUndoFire(raw: unknown): Promise<StaffUndoResult> {
  const gate = await sendGate();
  if (!gate.ok) return gate;
  const parsed = staffUndoFireInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { sessionId, batch } = parsed.data;

  const table = await sendableTable(sessionId);
  if (!table.ok) return table;

  const { data: unfired, error } = await serviceClient().rpc("mms_undo_fire", {
    p_cart_id: table.cart.id,
    p_batch: batch,
  });
  if (error) {
    console.error("[staff-send] mms_undo_fire failed", { sessionId, message: error.message });
    return { ok: false, reason: "failed" };
  }
  if (!unfired) return { ok: false, reason: "expired" };

  await afterCommit(sessionId, table.cart.id, table.session.expires_at, "staffUndoFire");
  capture(gate.caller, "staff_undo_fire", { sessionId, lines: unfired });
  return { ok: true, unfired };
}
