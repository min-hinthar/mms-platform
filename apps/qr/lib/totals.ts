import "server-only";
import { serviceClient } from "@mms/db/server";
import type { CartTotals } from "@mms/db";
import { computeTotals } from "./totals-math";

/**
 * The single authoritative totals engine (cents). NOT a Server Action — it's an internal server
 * function so it can't be POSTed directly by a client (avoids an IDOR cart-totals read). It is
 * called by:
 *   • the member-gated `create-intent` route (which authorizes the caller first), and
 *   • the signature-verified Stripe `webhook` (server-to-server, no diner session) to reconcile
 *     the breakdown against the actual charge before fulfilling.
 * So this function deliberately does NOT authorize — its callers own that decision.
 */
export async function getCartTotals(cartId: string, tipRate = 0): Promise<CartTotals> {
  const db = serviceClient();
  const { data: rows } = await db
    .from("qr_cart_items")
    .select("qty,unit_price_cents,tax_cents,state,comped,fulfillment")
    .eq("cart_id", cartId);
  // Promo discount is server-derived in ONE place — mms_promo_discount (active + window + min-subtotal;
  // pct→round(subtotal·value), flat→min(value,subtotal)). Caps are a redemption budget enforced at
  // apply + consumed at fulfillment, not a pricing gate. 0 when there's no code or it's no longer valid.
  const { data: discount } = await db.rpc("mms_promo_discount", { p_cart_id: cartId });
  // Reward coupon (M4 P4.2) — a server-derived flat discount on the applied reward (0 when none).
  //
  // These three reads stay SEQUENTIAL (they were before W8a). Parallelising them with Promise.all is
  // not behaviour-preserving in the failure case, and this path has no integration test.
  const { data: reward } = await db.rpc("mms_reward_discount", { p_cart_id: cartId });
  // W8a — the arithmetic lives in `computeTotals` (pure, tested with hand-computed literals in
  // `totals-math.test.ts`). This function's only job is the three reads above plus the field mapping
  // below; the money rules — voided/comped exclusion, clamp order, the two independent pro-ratas,
  // the grocery-excluded service base, the tip force-zero — are unchanged and live there.
  return computeTotals(
    (rows ?? []).map((i) => ({
      qty: i.qty,
      unitPriceCents: Number(i.unit_price_cents),
      taxCents: Number(i.tax_cents),
      state: i.state,
      comped: i.comped,
      fulfillment: i.fulfillment as "dinein" | "togo" | "grocery",
    })),
    discount ?? 0,
    reward ?? 0,
    tipRate,
  );
}
