"use server";
import { serviceClient } from "@mms/db/server";
import type { CartTotals, TaxCategory } from "@mms/db";
import { lineTax, round, taxRate } from "./tax";
import { getPostHogClient } from "./posthog-server";

/**
 * SERVER-AUTHORITATIVE cart. The browser never sends a price — it sends an item id +
 * chosen modifier ids. The server re-derives every price from the menu row and writes
 * the snapshot. Fixes the v7.1 red-team C1/C2 (client-trusted prices/promos).
 */

// menu lookup — maps to the delivery app's menu table (id, price, tax_category, modifiers)
async function priceItem(menuItemId: string, modifierIds: string[]) {
  const db = serviceClient();
  const { data: item, error } = await db
    .from("menu_items")
    .select("id,name,price,tax_category,modifiers")
    .eq("id", menuItemId)
    .single();
  if (error || !item) throw new Error("Unknown menu item");
  const mods = (item.modifiers ?? []) as { id: string; label: string; price: number }[];
  const chosen = mods.filter((m) => modifierIds.includes(m.id));
  const unitPrice = round(Number(item.price) + chosen.reduce((a, m) => a + Number(m.price), 0));
  return {
    name: item.name as string,
    unitPrice,
    category: item.tax_category as TaxCategory,
    opts: chosen.map((m) => m.label),
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
    .from("carts")
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
  const { name, unitPrice, category, opts } = await priceItem(menuItemId, modifierIds);
  const tax = lineTax(unitPrice, category, dineIn);
  await db.from("cart_items").insert({
    cart_id: cartId,
    menu_item_id: menuItemId,
    qty: 1,
    modifiers: opts,
    unit_price: unitPrice,
    tax,
    by_seat: bySeat ?? null,
  });
  await db.from("carts").update({ updated_at: new Date().toISOString() }).eq("id", cartId);

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: bySeat ?? cartId,
    event: "item_added_to_cart",
    properties: {
      cart_id: cartId,
      menu_item_id: menuItemId,
      item_name: name,
      unit_price: unitPrice,
      modifiers: opts,
      dine_in: dineIn,
    },
  });
}

export async function setQty(cartItemId: string, qty: number) {
  const db = serviceClient();
  if (qty <= 0) await db.from("cart_items").delete().eq("id", cartItemId);
  else await db.from("cart_items").update({ qty }).eq("id", cartItemId);
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
  await db.from("carts").update({ promo_code: promo.code }).eq("id", cartId);

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
  const { data: cart } = await db.from("carts").select("promo_code").eq("id", cartId).single();
  const { data: items } = await db
    .from("cart_items")
    .select("qty,unit_price,tax")
    .eq("cart_id", cartId);
  const subtotal = round((items ?? []).reduce((a, i) => a + Number(i.unit_price) * i.qty, 0));
  let discount = 0;
  if (cart?.promo_code) {
    const { data: p } = await db
      .from("promo_codes")
      .select("kind,value")
      .eq("code", cart.promo_code)
      .single();
    if (p)
      discount = round(
        p.kind === "pct" ? subtotal * Number(p.value) : Math.min(Number(p.value), subtotal),
      );
  }
  const net = round(subtotal - discount);
  // Tax on the discounted TAXABLE base only (CDTFA) — not a pro-rata of the rounded aggregate,
  // so a flat promo across mixed taxable/exempt lines stays correct. Taxable lines have tax > 0.
  const taxableBase = round(
    (items ?? []).reduce((a, i) => a + (Number(i.tax) > 0 ? Number(i.unit_price) * i.qty : 0), 0),
  );
  const discOnTaxable = subtotal > 0 ? round(discount * (taxableBase / subtotal)) : 0;
  const tax = round((taxableBase - discOnTaxable) * taxRate());
  const serviceCharge = round(net * 0.05); // SB-1524, disclosed in UI
  const tip = round(net * tipRate);
  return {
    subtotal,
    discount,
    serviceCharge,
    tax,
    tip,
    total: round(net + serviceCharge + tax + tip),
  };
}
