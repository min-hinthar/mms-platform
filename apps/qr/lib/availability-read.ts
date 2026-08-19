import { serviceClient } from "@mms/db/server";
import { foodMenuIds, pickUnavailable, type UnavailableLine } from "./availability";

/**
 * W23a — the two reads behind the charge-boundary availability gate. Thin on purpose: every rule
 * lives in the pure `./availability`, which is where the test and the `verify:slice` mutants can
 * reach it. This file is plumbing.
 *
 * Deliberately FAIL-OPEN on a transport failure: an unreadable cart or catalog returns "nothing is
 * unavailable" and the charge proceeds. Same direction the pickup soft-cap chose, for the same
 * reason — an outage in a SECONDARY check must never block a diner paying for an order that is very
 * probably fine. Being wrong costs one refund; failing closed costs every diner at the Pay button on
 * every catalog blip. The `console.error` is what makes the swallow deliberate rather than silent.
 */
export async function unavailableLineNames(cartId: string): Promise<string[]> {
  return (await unavailableLines(cartId)).map((u) => u.name);
}

/**
 * W23c — the same read, keeping the ids. The charge-boundary gate only needs names (it refuses and
 * says which dish); the manual-capture path needs to void the lines, so it needs what to void.
 */
export async function unavailableLines(cartId: string): Promise<UnavailableLine[]> {
  const db = serviceClient();
  const { data: lines, error: linesErr } = await db
    .from("qr_cart_items")
    .select("menu_item_id,name,state,fulfillment")
    .eq("cart_id", cartId);
  if (linesErr || !lines) {
    console.error("[availability] cart read failed", linesErr?.message);
    return [];
  }
  const ids = foodMenuIds(lines);
  if (ids.length === 0) return [];

  const { data: items, error: itemsErr } = await db
    .from("menu_items")
    .select("id,name_en,is_sold_out,is_active")
    .in("id", ids);
  if (itemsErr || !items) {
    console.error("[availability] catalog read failed", itemsErr?.message);
    return [];
  }
  return pickUnavailable(lines, items);
}
