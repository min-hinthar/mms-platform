"use server";
import { serviceClient } from "@mms/db/server";
import type { TaxCategory } from "@mms/db";
import { lineTax, round } from "./tax";

/**
 * Grocery Scan & Go. The client sends a scanned BARCODE (never a price); the server looks it
 * up, prices it, applies the category-aware tax, and writes the cart line. Grocery items are
 * always taxed as to-go retail (dineIn=false) — grocery_food is exempt, retail_nonfood taxable.
 * Reuses the same carts/cart_items as the restaurant flow.
 */
export async function scanAdd(cartId: string, barcode: string, bySeat?: string) {
  const db = serviceClient();
  const { data: cart } = await db.from("carts").select("id,locked").eq("id", cartId).single();
  if (!cart) throw new Error("No cart");
  if (cart.locked) throw new Error("Order is locked");

  const { data: item, error } = await db
    .from("grocery_items")
    .select("barcode,name,price,tax_category,ebt_eligible,weighed,available")
    .eq("barcode", barcode)
    .single();
  if (error || !item) return { ok: false as const, reason: "unknown_barcode", barcode };
  if (!item.available) return { ok: false as const, reason: "unavailable", barcode };
  if (item.weighed) return { ok: false as const, reason: "weighed_item", barcode }; // needs a scale — deferred

  const unitPrice = round(Number(item.price));
  const tax = lineTax(unitPrice, item.tax_category as TaxCategory, false);
  await db.from("cart_items").insert({
    cart_id: cartId,
    menu_item_id: item.barcode,
    qty: 1,
    modifiers: [],
    unit_price: unitPrice,
    tax,
    by_seat: bySeat ?? null,
  });
  return {
    ok: true as const,
    name: item.name as string,
    unitPrice,
    ebt: item.ebt_eligible as boolean,
  };
}
