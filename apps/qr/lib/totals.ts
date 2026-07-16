import "server-only";
import { serviceClient } from "@mms/db/server";
import type { CartTotals } from "@mms/db";
import { taxRate } from "./tax";

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
  // A voided OR comped line is charged at $0 (S2.3) — exclude it from the chargeable base everywhere
  // (mms_promo_discount + the settle reconciles apply the SAME predicate, so they all agree). A line that
  // predates S2 has state 'draft' / comped false, so this is a no-op for an un-voided cart.
  const items = (rows ?? []).filter((i) => i.state !== "voided" && !i.comped);
  // All integer cents — no float rounding on the base sums.
  const subtotalCents = items.reduce((a, i) => a + Number(i.unit_price_cents) * i.qty, 0);
  // Promo discount is server-derived in ONE place — mms_promo_discount (active + window + min-subtotal;
  // pct→round(subtotal·value), flat→min(value,subtotal)). Caps are a redemption budget enforced at
  // apply + consumed at fulfillment, not a pricing gate. 0 when there's no code or it's no longer valid.
  const { data: discount } = await db.rpc("mms_promo_discount", { p_cart_id: cartId });
  // Clamp to the (voided/comped-excluded) subtotal as belt-and-suspenders: mms_promo_discount already
  // excludes the same lines, so this only bites if the two ever drift — never letting a discount exceed
  // the chargeable base (which would drive a negative total).
  const promoCents = Math.min(discount ?? 0, subtotalCents);
  // Reward coupon (M4 P4.2) — a server-derived flat discount on the applied reward (mms_reward_discount;
  // 0 when none). Clamped to the subtotal REMAINING after the promo so the combined discount never exceeds
  // the chargeable base (no negative total). discountCents folds both → tax base, total, the order
  // snapshot, and the loyalty net-spend all treat the reward as a discount uniformly.
  const { data: reward } = await db.rpc("mms_reward_discount", { p_cart_id: cartId });
  const rewardCents = Math.min(reward ?? 0, Math.max(subtotalCents - promoCents, 0));
  const discountCents = promoCents + rewardCents;
  const netCents = subtotalCents - discountCents;
  // Tax on the discounted TAXABLE base only (CDTFA) — not a pro-rata of the rounded aggregate,
  // so a flat promo across mixed taxable/exempt lines stays correct. Taxable lines have tax > 0.
  const taxableBaseCents = (items ?? []).reduce(
    (a, i) => a + (Number(i.tax_cents) > 0 ? Number(i.unit_price_cents) * i.qty : 0),
    0,
  );
  const discOnTaxableCents =
    subtotalCents > 0 ? Math.round(discountCents * (taxableBaseCents / subtotalCents)) : 0;
  const taxCents = Math.round((taxableBaseCents - discOnTaxableCents) * taxRate());
  // SB-1524 service charge applies to RESTAURANT service only (W1) — grocery retail lines are
  // excluded from the base: a self-scanned bag of rice is not table service, and the disclosed
  // "supports fair kitchen wages" copy would be false on it. Discount is pro-rated onto the
  // service base the same way tax pro-rates onto the taxable base (never a pro-rata of the
  // rounded aggregate). Downstream consumers need no change: the cash-settle RPC reconciles
  // SUBTOTAL only (service stays TS-derived), and split shares allocate this figure pro-rata.
  const serviceBaseCents = items.reduce(
    (a, i) => a + (i.fulfillment === "grocery" ? 0 : Number(i.unit_price_cents) * i.qty),
    0,
  );
  const discOnServiceCents =
    subtotalCents > 0 ? Math.round(discountCents * (serviceBaseCents / subtotalCents)) : 0;
  const serviceChargeCents = Math.round((serviceBaseCents - discOnServiceCents) * 0.05);
  // No tip ask on a pure-grocery basket (no grocery self-checkout prompts one) — forcing it to 0
  // HERE covers every caller identically: create-intent mints the amount and the webhook
  // recomputes the same breakdown from metadata.tipRate, so the reconcile can never mismatch.
  const tipCents = serviceBaseCents === 0 ? 0 : Math.round(netCents * tipRate);
  return {
    subtotalCents,
    discountCents,
    rewardCents,
    serviceChargeCents,
    taxCents,
    tipCents,
    totalCents: netCents + serviceChargeCents + taxCents + tipCents,
  };
}
