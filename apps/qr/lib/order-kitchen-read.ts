"use server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import type { LineState } from "@mms/db";
import { trackFallbackInput } from "@mms/db/schemas";
import { isTransportFailure } from "./authz";
import type { KitchenLine } from "./order-kitchen";

/**
 * Lifecycle audit (2026-10-13) — the post-order KITCHEN read: the paid cart's lines, for /track.
 *
 * ⚠️ THE AUTHORIZATION IS THE DINER'S OWN RLS, AND NOTHING ELSE. Both reads below run on the
 * caller's cookie session (`serverClient`), so `qr_order_read` (a member seated no later than the
 * order, M309) and `qr_citem_read` (a member of the cart's session) decide what comes back — what the
 * browser's live order read (`useOrderStatus`) and the cart's Realtime channel already see. No new
 * authority is minted here: a non-member, or a member whose session has closed or lapsed, gets no
 * order row and so `unreadable`, and an order id alone grants nothing. The service client is used
 * for ONE thing, the database clock (`mms_now()` is service-role only), which carries no data.
 *
 * Why not durable (uid-scoped, like `getMyOrderFallback`)? A kitchen read that outlived the session
 * would be a second authority over cart lines, decided in TS. The durable answer for the bag is
 * K30(A)'s order-level `kitchen_done_at` stamp (OPEN-ITEMS, a migration on the owner's go); until it
 * lands, the page says what the order row knows once this read lapses.
 *
 * THE DB CLOCK IS READ BEFORE THE LINES (getCartView's rule, D5): a clock read after them could land
 * past a bump's undo window while the lines predate an Undo Mom sent inside it, and the page would
 * read Served over a dish she took back.
 *
 * Answers: `ok` with the lines (possibly none), `unreadable` (not this caller's to read — or no longer),
 * or `error` (unknowable — a failed read is never an empty one, W10a).
 */
export type OrderKitchenRead =
  | { ok: true; cartId: string; dbNow: string; lines: KitchenLine[] }
  | { ok: false; reason: "unreadable" | "error" };

export async function getOrderKitchen(input: { orderId: string }): Promise<OrderKitchenRead> {
  const parsed = trackFallbackInput.safeParse({ orderId: input?.orderId });
  const orderId = parsed.success ? parsed.data.orderId : null;
  if (!orderId) return { ok: false, reason: "unreadable" };

  const supa = serverClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await supa.auth.getUser();
  if (authErr && isTransportFailure(authErr)) return { ok: false, reason: "error" };
  if (!user) return { ok: false, reason: "unreadable" };

  // The order's cart, under the caller's own RLS (`qr_order_read`). No row = not theirs to read now.
  const { data: order, error: orderErr } = await supa
    .from("qr_orders")
    .select("cart_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) {
    console.error("[order-kitchen] order read failed", { orderId, error: orderErr.message });
    return { ok: false, reason: "error" };
  }
  if (!order?.cart_id) return { ok: false, reason: "unreadable" };

  // The DB clock, BEFORE the lines (see the docblock). A failed clock read falls back to this
  // server's clock at the same point, logged — the stage words are advisory, never a gate.
  const clock = await serviceClient().rpc("mms_now");
  const dbNow =
    !clock.error && typeof clock.data === "string" && Number.isFinite(Date.parse(clock.data))
      ? clock.data
      : (() => {
          console.error("[order-kitchen] mms_now unreadable — stages read on the app clock", {
            orderId,
            error: clock.error?.message,
          });
          return new Date().toISOString();
        })();

  const { data: rows, error: rowsErr } = await supa
    .from("qr_cart_items")
    .select("id,name,qty,state,fire_at,bumped_at,fulfillment,created_at")
    .eq("cart_id", order.cart_id)
    .order("created_at", { ascending: true });
  if (rowsErr) {
    console.error("[order-kitchen] line read failed", { orderId, error: rowsErr.message });
    return { ok: false, reason: "error" };
  }

  return {
    ok: true,
    cartId: order.cart_id,
    dbNow,
    lines: (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      qty: r.qty,
      lineState: (r.state ?? "draft") as LineState,
      fireAt: r.fire_at ?? null,
      bumpedAt: r.bumped_at ?? null,
      fulfillment: (r.fulfillment ?? "dinein") as KitchenLine["fulfillment"],
    })),
  };
}
