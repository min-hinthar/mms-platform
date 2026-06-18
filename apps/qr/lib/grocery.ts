"use server";
import { serviceClient } from "@mms/db/server";
import type { TaxCategory } from "@mms/db";
import { lineTax } from "./tax";

/**
 * Grocery Scan & Go. The client sends a scanned BARCODE (never a price); the server looks it
 * up, prices it (in cents), applies the category-aware tax, and writes the cart line. Grocery
 * items are always taxed as to-go retail (dineIn=false) — grocery_food is exempt, retail_nonfood
 * taxable. Reuses the same qr_carts/qr_cart_items as the restaurant flow.
 */
export async function scanAdd(cartId: string, barcode: string, bySeat?: string) {
  const db = serviceClient();
  const { data: cart } = await db.from("qr_carts").select("id,locked").eq("id", cartId).single();
  if (!cart) throw new Error("No cart");
  if (cart.locked) throw new Error("Order is locked");

  const { data: item, error } = await db
    .from("grocery_items")
    .select("barcode,name,price_cents,tax_category,ebt_eligible,weighed,available")
    .eq("barcode", barcode)
    .single();
  if (error || !item) return { ok: false as const, reason: "unknown_barcode", barcode };
  if (!item.available) return { ok: false as const, reason: "unavailable", barcode };
  if (item.weighed) return { ok: false as const, reason: "weighed_item", barcode }; // needs a scale — deferred

  const unitPriceCents = Number(item.price_cents);
  const taxCents = lineTax(unitPriceCents, item.tax_category as TaxCategory, false);
  await db.from("qr_cart_items").insert({
    cart_id: cartId,
    menu_item_id: item.barcode,
    name: item.name,
    qty: 1,
    modifiers: [],
    unit_price_cents: unitPriceCents,
    tax_cents: taxCents,
    by_seat: bySeat ?? null,
  });
  return {
    ok: true as const,
    name: item.name as string,
    unitPriceCents,
    ebt: item.ebt_eligible as boolean,
  };
}
