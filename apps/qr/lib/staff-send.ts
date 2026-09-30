"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { staffFireInput, staffUndoFireInput } from "@mms/db/schemas";
import { getStaffAuth, type StaffCaller } from "./staff";
import { openCartFor } from "./staff-open-cart";
import { paymentInFlightReason } from "./pay-guard";
import { touchCart } from "./order-lines";
import { maybeRenewSession } from "./authz";
import { getPostHogClient } from "./posthog-server";
import { surfaceOpen } from "./surfaces";
import {
  sendRoute,
  undoRoute,
  type SendRoute,
  type StaffFireResult,
  type StaffSendReason,
  type StaffUndoResult,
} from "./staff-send-view";

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
 *
 * Phase 2f · P2v — a COUNTER order (`reg-`, `isCounterOrder`) may cook before it is paid, on this
 * explicit staff Send (owner decisions 1 + 7). It goes through its OWN staff-only RPCs
 * (`mms_fire_counter_cart` / `mms_undo_counter_fire`, service_role only, the counter predicate and a
 * non-blank name IN the fire's statement — 20261001000000_p2f_counter_cook_before_paid.sql), never a
 * widened `mms_fire_cart`, which is also the DINER's send. `sendRoute` / `undoRoute` pick the RPC from
 * the session; `SURFACES.payAtPickup` parks new counter sends only. Every other non-table order
 * (a kiosk order, a diner's own pickup, scan-and-go) is still pay-first and refused as `counter`.
 */

type GateRefusal = { ok: false; reason: Extract<StaffSendReason, "signin" | "outage"> };

/** The staff gate, answering a REASON by where it failed (the auth read, the staff row) rather than
 *  `staffGate`'s sentence — a sentence the client would have to match by text. There is no role arm:
 *  `server` is the bottom rung of `RANK` (lib/staff-roles.ts), so every active staff member may send,
 *  and a `role` refusal no caller could ever receive was dead code with notice copy behind it. A rung
 *  BELOW server (a kitchen-only login, say) must bring the arm back with its own sentence. */
async function sendGate(): Promise<{ ok: true; caller: StaffCaller } | GateRefusal> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "signin" };
  return { ok: true, caller: auth.caller };
}

type TableRefusal = {
  ok: false;
  reason: Extract<StaffSendReason, "outage" | "closed" | "counter" | "paying">;
};

/** The shared prefix: the session's open cart, a ROUTE for its RPC, and no money moving on it. */
async function sendableTable(
  sessionId: string,
  pick: (s: { mode: string; qrCode: string }) => SendRoute,
) {
  const { session, cart, unavailable } = await openCartFor(sessionId);
  // W10b — an unread table is not a closed one; name the outage.
  if (unavailable) return { ok: false, reason: "outage" } satisfies TableRefusal;
  if (!session || !cart) return { ok: false, reason: "closed" } satisfies TableRefusal;
  // A pay-first order (a kiosk order, a diner's pickup, scan-and-go — or a counter order while
  // `payAtPickup` is parked) cooks when it is PAID: without this the answer would be "nothing to
  // send" over a cart full of unsent food.
  const route = pick({ mode: session.mode, qrCode: session.qr_code });
  if ("refuse" in route) return { ok: false, reason: "counter" } satisfies TableRefusal;
  // Parity with the diner's sendToKitchen (locked / settling): never move lines under a payment.
  if (await paymentInFlightReason(cart))
    return { ok: false, reason: "paying" } satisfies TableRefusal;
  return { ok: true as const, session, cart, route };
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
 * The UNITS a committed batch holds (Σ qty of the lines carrying it). `mms_fire_cart` reports ROWS
 * (`get diagnostics row_count`), but the Send's label counts units (`kitchenDraftUnitsFromRows`), so
 * one Mohinga ×3 would announce "Sent 1 item" under a "Send · 3 items" button.
 *
 * A failed or empty read falls back to the ROW count, never to a guess upward: every fired line has
 * qty ≥ 1, so rows ≤ units — the notice may then under-state what went, but it can never claim a dish
 * the kitchen did not get. The fire itself already committed, so this read never fails the send.
 */
async function firedUnits(cartId: string, batch: string, firedRows: number): Promise<number> {
  const { data, error } = await serviceClient()
    .from("qr_cart_items")
    .select("qty")
    .eq("cart_id", cartId)
    .eq("fire_batch", batch);
  if (error || !data?.length) {
    if (error) console.error("[staff-send] fired-units read failed", { message: error.message });
    return firedRows; // deliberate: the lower bound (see above)
  }
  return data.reduce((a, r) => a + r.qty, 0);
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

  const table = await sendableTable(sessionId, (s) => sendRoute(s, surfaceOpen("payAtPickup")));
  if (!table.ok) return table;

  // Two explicit calls (not a computed name) so each keeps its generated row type.
  const db = serviceClient();
  const res =
    table.route.rpc === "counter"
      ? await db.rpc("mms_fire_counter_cart", { p_cart_id: table.cart.id })
      : await db.rpc("mms_fire_cart", { p_cart_id: table.cart.id });
  if (res.error) {
    console.error("[staff-send] fire failed", {
      sessionId,
      route: table.route.rpc,
      message: res.error.message,
    });
    return { ok: false, reason: "failed" };
  }
  // Both return (fired, batch, fire_deadline) — the batch and deadline they stamped, read from the
  // write itself (a read-back could be won by a concurrent make-it-now). The counter fire adds
  // `named`: INFORMATIONAL (the name guard is the UPDATE's own conjunct), read only to name WHY it
  // moved nothing.
  const row = res.data?.[0];
  const firedRows = row?.fired ?? 0;
  const named =
    table.route.rpc === "counter"
      ? (res.data?.[0] as { named?: boolean } | undefined)?.named
      : undefined;
  if (!firedRows && named === false) return { ok: false, reason: "noName" };
  // Nothing still draft and dine-in: a colleague (or the host's phone) sent it first, or only to-go
  // lines remain. The refreshed slot then says which.
  if (!firedRows) return { ok: false, reason: "nothing" };
  const batch = row?.batch ?? null;
  const fired = batch ? await firedUnits(table.cart.id, batch, firedRows) : firedRows;

  await afterCommit(sessionId, table.cart.id, table.session.expires_at, "staffFireCart");
  capture(gate.caller, "staff_fire_cart", {
    sessionId,
    lines: firedRows,
    units: fired,
    route: table.route.rpc,
  });
  return {
    ok: true,
    fired,
    undoUntil: row?.fire_deadline ?? null,
    serverNow: new Date().toISOString(),
    undoBatch: row?.batch ?? null,
  };
}

/**
 * WHY an undo took back nothing. `mms_undo_fire` answers 0 for two different facts, and the console
 * must not tell them apart by guessing:
 *
 *  - `expired` — lines carrying this batch still exist: the grace ran out and the kitchen has them
 *    (the page steers to Void / Comp).
 *  - `gone` — NO line on the cart carries the batch any more. Undo clears `fire_batch`, so this is an
 *    earlier undo whose response was lost (the retry of the same tap), or a void that removed the
 *    lines. "Too late — the kitchen has it" there would send staff to Void a dish nobody is cooking.
 *
 * An unread check answers `expired`: of the two sentences it is the one that sends staff to LOOK at
 * the dishes, and "nothing is with the kitchen" must never be said on no evidence.
 */
async function undoMissReason(cartId: string, batch: string): Promise<"expired" | "gone"> {
  const { data, error } = await serviceClient()
    .from("qr_cart_items")
    .select("id")
    .eq("cart_id", cartId)
    .eq("fire_batch", batch)
    .limit(1);
  if (error) {
    console.error("[staff-send] undo batch check failed", { message: error.message });
    return "expired"; // deliberate: the conservative steer (see above)
  }
  return data?.length ? "expired" : "gone";
}

/**
 * Take back the batch THIS console's send fired, while it is still in the grace. The grace, the
 * batch, the not-comped rule and the open dine-in cart are all re-checked in `mms_undo_fire`'s one
 * statement; 0 rows is never a silent success — `expired` (the kitchen has it → Void / Comp) or
 * `gone` (nothing from that send is still fired: an earlier undo landed), per `undoMissReason`.
 */
export async function staffUndoFire(raw: unknown): Promise<StaffUndoResult> {
  const gate = await sendGate();
  if (!gate.ok) return gate;
  const parsed = staffUndoFireInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { sessionId, batch } = parsed.data;

  // The session decides the undo's RPC, never the switch: a send inside its grace always comes back.
  const table = await sendableTable(sessionId, undoRoute);
  if (!table.ok) return table;

  const db = serviceClient();
  const { data: unfired, error } =
    table.route.rpc === "counter"
      ? await db.rpc("mms_undo_counter_fire", { p_cart_id: table.cart.id, p_batch: batch })
      : await db.rpc("mms_undo_fire", {
          p_cart_id: table.cart.id,
          p_batch: batch,
        });
  if (error) {
    console.error("[staff-send] undo failed", {
      sessionId,
      route: table.route.rpc,
      message: error.message,
    });
    return { ok: false, reason: "failed" };
  }
  if (!unfired) return { ok: false, reason: await undoMissReason(table.cart.id, batch) };

  await afterCommit(sessionId, table.cart.id, table.session.expires_at, "staffUndoFire");
  capture(gate.caller, "staff_undo_fire", { sessionId, lines: unfired });
  return { ok: true, unfired };
}
