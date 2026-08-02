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
 *
 * W10c (M30) — it THROWS on an unreadable cart, and that is load-bearing in both callers. Every one
 * of the three reads below used to destructure only `{ data }`, which is not a "missing check" in the
 * usual sense: postgrest-js RESOLVES fetch failures into `{ data: null, error }` rather than
 * rejecting, so a total platform outage produced a confident, perfectly-shaped answer of ZERO —
 * silently, on the money path.
 *
 * The two ways that cashes out:
 *   • In the Stripe webhook's `payment_intent.succeeded` branch, an outage made the derived total
 *     disagree with the (real) charge, so the event was triaged as TAMPERING — the wrong alarm, the
 *     wrong `refunds_needed` reason, and no retry. Throwing routes it to the branch that already
 *     exists there ("Totals lookup failed; will retry", 500) so Stripe redelivers for up to 72h.
 *   • In `create-intent` a PARTIAL failure is worse than a total one: if the items read succeeds but
 *     `mms_promo_discount` fails, the discount silently becomes 0 and the diner is charged MORE than
 *     the cart in front of them shows. Failing the mint is the only honest option.
 *
 * So: never return a total we are not certain of. A thrown error is recoverable (Stripe retries, the
 * client retries); a wrong number is not.
 */
export async function getCartTotals(cartId: string, tipRate = 0): Promise<CartTotals> {
  const db = serviceClient();
  const { data: rows, error: rowsError } = await db
    .from("qr_cart_items")
    .select("qty,unit_price_cents,tax_cents,state,comped,fulfillment")
    .eq("cart_id", cartId);
  if (rowsError) throw new Error(`getCartTotals: cart items unreadable — ${rowsError.message}`);
  // Promo discount is server-derived in ONE place — mms_promo_discount (active + window + min-subtotal;
  // pct→round(subtotal·value), flat→min(value,subtotal)). Caps are a redemption budget enforced at
  // apply + consumed at fulfillment, not a pricing gate. 0 when there's no code or it's no longer valid.
  const { data: discount, error: discountError } = await db.rpc("mms_promo_discount", {
    p_cart_id: cartId,
  });
  // A failed discount read must NEVER fall back to 0 — that silently overcharges by the discount.
  if (discountError)
    throw new Error(`getCartTotals: promo discount unreadable — ${discountError.message}`);
  // Reward coupon (M4 P4.2) — a server-derived flat discount on the applied reward (0 when none).
  //
  // These three reads stay SEQUENTIAL (they were before W8a). Parallelising them with Promise.all is
  // not behaviour-preserving in the failure case, and this path has no integration test.
  const { data: reward, error: rewardError } = await db.rpc("mms_reward_discount", {
    p_cart_id: cartId,
  });
  // Same rule as the promo: an unreadable reward is not a zero reward.
  if (rewardError)
    throw new Error(`getCartTotals: reward discount unreadable — ${rewardError.message}`);
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
