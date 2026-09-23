import { serviceClient } from "@mms/db/server";
import { kitchenDraftUnitsFromRows } from "./checkout-stage";

/**
 * Phase 1b — the read behind the charge-boundary "everything sent" gate (`payBlockedByUnsent`).
 * Plumbing only: the rule lives in the pure `./checkout-stage`, where its test and mutants reach it.
 *
 * FAIL-OPEN on a transport failure, deliberately, and it is safe here in a way it would not be for
 * a money check: a payment that slips past this gate is exactly today's behaviour — the webhook's
 * `mms_fire_pending_food` fires the unsent dishes the moment it lands. Failing closed would instead
 * block every table at the Pay button on every read blip. The `console.error` makes the swallow a
 * decision, not a silence.
 */
export async function kitchenDraftUnits(cartId: string): Promise<number> {
  const { data, error } = await serviceClient()
    .from("qr_cart_items")
    .select("state,fulfillment,qty")
    .eq("cart_id", cartId);
  if (error || !data) {
    console.error("[unsent] cart read failed", error?.message);
    return 0;
  }
  return kitchenDraftUnitsFromRows(data);
}
