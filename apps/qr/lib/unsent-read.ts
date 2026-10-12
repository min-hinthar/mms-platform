import { serviceClient } from "@mms/db/server";
import { kitchenDraftUnitsFromRows } from "./checkout-stage";
import type { TrackLine } from "./kitchen-track";

/**
 * Phase 1b — the read behind the charge-boundary "everything sent" gate (`payBlockedByUnsent`).
 * Plumbing only: the rule lives in the pure `./checkout-stage`, where its test and mutants reach it.
 *
 * `kitchenDraftUnits` is FAIL-OPEN on a transport failure, deliberately (the DINER doors — the staff
 * doors read `readKitchenDraftUnits` and fail closed, P2dc), and it is safe here in a way it would not be for
 * a money check: a payment that slips past this gate is exactly today's behaviour — the webhook's
 * `mms_fire_pending_food` fires the unsent dishes the moment it lands. Failing closed would instead
 * block every table at the Pay button on every read blip. The `console.error` makes the swallow a
 * decision, not a silence.
 */
export async function kitchenDraftUnits(cartId: string): Promise<number> {
  return (await readKitchenDraftUnits(cartId)) ?? 0;
}

/**
 * P2dc — the same read, ERROR-AWARE: `null` when the rows could not be read, never a guessed 0. The
 * three staff payment doors read this and refuse on `null` (`staffSettleUnsentVerdict`); the diner
 * doors keep the fail-open wrapper above.
 */
export async function readKitchenDraftUnits(cartId: string): Promise<number | null> {
  const { data, error } = await serviceClient()
    .from("qr_cart_items")
    .select("state,fulfillment,qty")
    .eq("cart_id", cartId);
  if (error || !data) {
    console.error("[unsent] cart read failed", error?.message);
    return null;
  }
  return kitchenDraftUnitsFromRows(data);
}

/**
 * PD10 · D5 — the ONE read behind the SERVED GATE at the charge boundary (`create-intent`'s
 * `servedGateDecision`). Plumbing only: the rule lives in the pure `./checkout-stage`, where its
 * test and mutants reach it. `null` when either half could not be read — and the decision turns that
 * into `unreadable`, a refusal: this gate FAILS CLOSED (a payment slipping past it charges a card for
 * food that is not cooked), unlike the unsent read above.
 *
 * ⚠️ THE CLOCK FIRST, AWAITED, IN ITS OWN STATEMENT — then the lines (D5, Codex round 4). A line
 * counts as served only once its `bumped_at` is `KDS_UNDO_MS` old on the DB clock, and that is true
 * of the lines only if the clock was read NO LATER than they were: read after them, `now` can pass a
 * bump's six seconds while the rows predate an Undo Mom sent inside them, and the gate admits a dish
 * she took back. Reading the clock first only ever makes the gate STRICTER (an earlier `now`), never
 * looser. A `Promise.all` of the two is first in the source and concurrent — it is NOT this order.
 *
 * The rows are every line of the cart (`state`, `fulfillment`, `fire_at`, `bumped_at` — the track's
 * raw columns): comped dishes still cook, so nothing is filtered here; the hold set is the rule's.
 */
export async function readServedGateInput(
  cartId: string,
): Promise<{ lines: TrackLine[]; nowIso: string } | null> {
  const db = serviceClient();
  const clock = await db.rpc("mms_now");
  if (clock.error || typeof clock.data !== "string" || !Number.isFinite(Date.parse(clock.data))) {
    console.error("[served-gate] clock read failed", clock.error?.message);
    return null;
  }
  const rows = await db
    .from("qr_cart_items")
    .select("state,fulfillment,fire_at,bumped_at")
    .eq("cart_id", cartId);
  if (rows.error || !rows.data) {
    console.error("[served-gate] cart read failed", rows.error?.message);
    return null;
  }
  return { lines: rows.data, nowIso: clock.data };
}
