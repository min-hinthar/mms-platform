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
  const { data: cart } = await db.from("qr_carts").select("promo_code").eq("id", cartId).single();
  const { data: items } = await db
    .from("qr_cart_items")
    .select("qty,unit_price_cents,tax_cents")
    .eq("cart_id", cartId);
  // All integer cents — no float rounding on the base sums.
  const subtotalCents = (items ?? []).reduce((a, i) => a + Number(i.unit_price_cents) * i.qty, 0);
  // promo: kind='pct' → fraction; kind='flat' → cents off (see migration 0001 comment).
  let discountCents = 0;
  if (cart?.promo_code) {
    const { data: p } = await db
      .from("promo_codes")
      .select("kind,value")
      .eq("code", cart.promo_code)
      .single();
    if (p)
      discountCents =
        p.kind === "pct"
          ? Math.round(subtotalCents * Number(p.value))
          : Math.min(Math.round(Number(p.value)), subtotalCents);
  }
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
  const serviceChargeCents = Math.round(netCents * 0.05); // SB-1524, disclosed in UI
  const tipCents = Math.round(netCents * tipRate);
  return {
    subtotalCents,
    discountCents,
    serviceChargeCents,
    taxCents,
    tipCents,
    totalCents: netCents + serviceChargeCents + taxCents + tipCents,
  };
}
