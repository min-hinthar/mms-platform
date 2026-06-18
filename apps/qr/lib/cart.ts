"use server";
import { serviceClient } from "@mms/db/server";
import type { CartTotals, TaxCategory } from "@mms/db";
import { lineTax, taxRate } from "./tax";
import { getPostHogClient } from "./posthog-server";

/**
 * SERVER-AUTHORITATIVE cart. The browser never sends a price — it sends a menu item id +
 * chosen modifier OPTION ids. The server re-derives every amount from the live (delivery-owned)
 * menu and writes the snapshot. Fixes the v7.1 red-team C1/C2 (client-trusted prices/promos).
 *
 * Money is integer CENTS end-to-end (parity with the delivery schema). The menu lives in the
 * delivery app: `menu_items` (uuid id, base_price_cents, name_en/name_my) with normalized
 * modifiers (item_modifier_groups → modifier_groups → modifier_options.price_delta_cents).
 * Tax category is resolved QR-side via mms_menu_tax_category (delivery menu is untouched).
 */

// Re-derive the price (in cents), name, tax category, and chosen option labels for a menu item.
// Only modifier options that genuinely belong to one of THIS item's groups are honored, so a
// client can't smuggle an arbitrary (cheaper/foreign) option id into the price.
async function priceItem(menuItemId: string, modifierIds: string[]) {
  const db = serviceClient();
  const { data: item, error } = await db
    .from("menu_items")
    .select("id,name_en,base_price_cents,tax_category")
    .eq("id", menuItemId)
    .single();
  if (error || !item) throw new Error("Unknown menu item");

  let addCents = 0;
  let optLabels: string[] = [];
  if (modifierIds.length) {
    // Which modifier groups are actually attached to this item — so a client can't smuggle in a
    // foreign/cheaper option id. (modifier_options and item_modifier_groups are siblings joined
    // through modifier_groups, so we intersect explicitly rather than rely on a nested embed.)
    const { data: links } = await db
      .from("item_modifier_groups")
      .select("group_id")
      .eq("item_id", menuItemId);
    const allowedGroups = new Set((links ?? []).map((l) => l.group_id));
    const { data: opts } = await db
      .from("modifier_options")
      .select("id,name,price_delta_cents,group_id")
      .eq("is_active", true)
      .in("id", modifierIds);
    const chosen = (opts ?? []).filter((m) => allowedGroups.has(m.group_id));
    addCents = chosen.reduce((a, m) => a + m.price_delta_cents, 0);
    optLabels = chosen.map((m) => m.name);
  }

  // tax_category is a first-class column on menu_items (set per item/category in the seed).
  return {
    name: item.name_en,
    unitPriceCents: item.base_price_cents + addCents,
    category: item.tax_category as TaxCategory,
    opts: optLabels,
  };
}

export async function addItem(
  cartId: string,
  menuItemId: string,
  modifierIds: string[],
  bySeat?: string,
) {
  const db = serviceClient();
  const { data: cart } = await db
    .from("qr_carts")
    .select("id,locked,session_id")
    .eq("id", cartId)
    .single();
  if (!cart) throw new Error("No cart");
  if (cart.locked) throw new Error("Order is locked by the host");
  const { data: sess } = await db
    .from("table_sessions")
    .select("mode")
    .eq("id", cart.session_id)
    .single();
  const dineIn = sess?.mode === "dinein";
  const { name, unitPriceCents, category, opts } = await priceItem(menuItemId, modifierIds);
  const taxCents = lineTax(unitPriceCents, category, dineIn);
  await db.from("qr_cart_items").insert({
    cart_id: cartId,
    menu_item_id: menuItemId,
    name,
    qty: 1,
    modifiers: opts,
    unit_price_cents: unitPriceCents,
    tax_cents: taxCents,
    by_seat: bySeat ?? null,
  });
  await db.from("qr_carts").update({ updated_at: new Date().toISOString() }).eq("id", cartId);

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: bySeat ?? cartId,
    event: "item_added_to_cart",
    properties: {
      cart_id: cartId,
      menu_item_id: menuItemId,
      item_name: name,
      unit_price_cents: unitPriceCents,
      modifiers: opts,
      dine_in: dineIn,
    },
  });
}

export async function setQty(cartItemId: string, qty: number) {
  const db = serviceClient();
  if (qty <= 0) await db.from("qr_cart_items").delete().eq("id", cartItemId);
  else await db.from("qr_cart_items").update({ qty }).eq("id", cartItemId);
}

export async function applyPromo(cartId: string, code: string) {
  const db = serviceClient();
  const { data: promo } = await db
    .from("promo_codes")
    .select("code,kind,value,max_uses,used,active")
    .eq("code", code.toUpperCase())
    .single();
  if (!promo || !promo.active || (promo.max_uses != null && promo.used >= promo.max_uses))
    throw new Error("Invalid code");
  await db.from("qr_carts").update({ promo_code: promo.code }).eq("id", cartId);

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: cartId,
    event: "promo_applied",
    properties: {
      cart_id: cartId,
      promo_code: promo.code,
      promo_kind: promo.kind,
      promo_value: promo.value,
    },
  });
}

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
