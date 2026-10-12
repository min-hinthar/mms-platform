import "server-only";
import { serviceClient } from "@mms/db/server";
import type { CartTotals } from "@mms/db";
import { computeTotals } from "./totals-math";

/**
 * M123 (b) — WHICH promo figure a reader is handed. Two bases, told apart by who reads the number.
 *
 * `charge` (the default) — what a door CHARGES or a webhook RECONCILES: `mms_promo_discount`, the
 *   pin while one is set (m70: "a granted pin wins outright"), the live derivation otherwise.
 *   create-intent mints from it, the webhook reconciles a captured amount against it, and the
 *   counter's doors read it only AFTER releasing a pin no intent names (M268, lib/supersede.ts —
 *   the split's door too, since M123). Nothing on this basis reads the link, and nothing may: in
 *   create-intent the pin is taken BEFORE the intent exists to be linked, so a charge that followed
 *   the link would mint from the live figure and reconcile against the pin.
 *
 * `quote` — the figure a SCREEN shows before anyone pays: the review step (`getCartView`) and the
 *   floor's settle quote (`getTableDetail`), one call at both so the guest's pass and Dad's pane
 *   cannot disagree (PD2). It quotes the pin ONLY while `live_payment_intent_id` is set:
 *     · LINKED — the pin is what the live intent was minted at, and a declined card is retried
 *       inline against that same intent at that same amount (`releasePromoGrantFor`, point 1), so
 *       the screen beside the card prompt says the same discount;
 *     · UNLINKED — the pin belongs to nobody (M151: every pin-clearer requires the link null; M268:
 *       "a pin no intent names belongs to nobody"), and every door that would collect next re-derives
 *       without it — create-intent releases a predecessor's pin before it pins, the counter's settles
 *       release it under their freeze. Quoting it showed a discount no door would charge, which is
 *       the row's original defect, and it made the cash sheet's compare-and-swap refuse `moved` on
 *       a figure staff were just shown.
 *   #245 tried a live display basis and was reverted because the counter then charged the PIN —
 *   there was no basis right for both doors. M268 removed that: both doors now re-derive.
 *
 *   ⚠️ What this does not make exact, said rather than hidden: a LINKED intent whose diner walked
 *   away is quoted at its pin, and the counter supersedes it and charges live. The cash sheet's
 *   compare-and-swap (`settleCash`'s `quotedCents`) refuses that as `moved` and names the server's
 *   figure — a second tap, never a wrong charge — and the next quote, with the link gone, is live.
 *   The link and the discount are two statements, so a quote can be one poll behind a link write;
 *   a quote is never an amount, and every charge re-derives on `charge`.
 */
export type PromoBasis = "charge" | "quote";

/** The ONE place the basis picks a reader (M123 b — the docblock above says why). */
function promoDiscountRpc(
  basis: PromoBasis,
  liveIntentId: string | null,
): "mms_promo_discount" | "mms_promo_discount_live" {
  return basis === "quote" && !liveIntentId ? "mms_promo_discount_live" : "mms_promo_discount";
}

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
export async function getCartTotals(
  cartId: string,
  tipRate = 0,
  basis: PromoBasis = "charge",
): Promise<CartTotals> {
  const db = serviceClient();
  // M123 (b) — the quote's link read rides BESIDE the items read (both are one indexed read; the view
  // runs in every mutation response, so a serial round trip is a tax on the add path). The charge
  // basis issues no link read at all. Errors are checked in a fixed order below, so which read is
  // named when both fail does not depend on which one answered first.
  const [{ data: rows, error: rowsError }, linkRes] = await Promise.all([
    db
      .from("qr_cart_items")
      .select("qty,unit_price_cents,tax_cents,state,comped,fulfillment")
      .eq("cart_id", cartId),
    basis === "quote"
      ? db.from("qr_carts").select("live_payment_intent_id").eq("id", cartId).maybeSingle()
      : null,
  ]);
  if (rowsError) throw new Error(`getCartTotals: cart items unreadable — ${rowsError.message}`);
  // An unreadable link is not an unlinked cart: read as one, the quote would show the live figure
  // beside a live intent that charges the pin. Same rule as every read here — throw, never guess.
  if (linkRes?.error)
    throw new Error(`getCartTotals: payment link unreadable — ${linkRes.error.message}`);
  // Promo discount is server-derived in ONE place — mms_promo_discount (active + window + min-subtotal;
  // pct→round(subtotal·value), flat→min(value,subtotal)). Caps are a redemption budget enforced at
  // apply + consumed at fulfillment, not a pricing gate. 0 when there's no code or it's no longer valid.
  // `mms_promo_discount_live` is that same derivation without the pin (m70 §1) — the quote's figure
  // for an unlinked cart.
  const promoRpc = promoDiscountRpc(basis, linkRes?.data?.live_payment_intent_id ?? null);
  const { data: discount, error: discountError } = await db.rpc(promoRpc, {
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
