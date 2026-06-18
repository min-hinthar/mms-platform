"use server";
import { serviceClient } from "@mms/db/server";
import type { TaxCategory } from "@mms/db";
import { scanInput } from "@mms/db/schemas";
import { lineTax } from "./tax";
import { assertCartMember } from "./authz";

/**
 * Grocery Scan & Go. The client sends a scanned BARCODE (never a price); the server looks it
 * up, prices it (in cents), applies the category-aware tax, and writes the cart line. Grocery
 * items are always taxed as to-go retail (dineIn=false) — grocery_food is exempt, retail_nonfood
 * taxable. Reuses the same qr_carts/qr_cart_items as the restaurant flow.
 *
 * AuthZ goes through the same membership guard as the restaurant cart (RED-TEAM #2). The caller
 * must be a verified member of the cart's session — so the M2 "server-issued grocery session"
 * (ROADMAP P2.3) is a prerequisite for a working scan; the demo's client-minted cart id is
 * rejected by design (a client-asserted session id was the very thing P1.1 closes).
 */
export async function scanAdd(cartId: string, barcode: string) {
  const input = scanInput.parse({ cartId, barcode });
  const { uid, locked } = await assertCartMember(input.cartId);
  if (locked) throw new Error("Order is locked");

  const db = serviceClient();
  const { data: item } = await db
    .from("grocery_items")
    .select("barcode,name,price_cents,tax_category,ebt_eligible,weighed,available")
    .eq("barcode", input.barcode)
    .maybeSingle();
  if (!item) return { ok: false as const, reason: "unknown_barcode", barcode: input.barcode };
  if (!item.available) return { ok: false as const, reason: "unavailable", barcode: input.barcode };
  if (item.weighed) return { ok: false as const, reason: "weighed_item", barcode: input.barcode }; // needs a scale — deferred

  const unitPriceCents = Number(item.price_cents);
  const taxCents = lineTax(unitPriceCents, item.tax_category as TaxCategory, false);
  await db.from("qr_cart_items").insert({
    cart_id: input.cartId,
    menu_item_id: item.barcode,
    name: item.name,
    qty: 1,
    modifiers: [],
    unit_price_cents: unitPriceCents,
    tax_cents: taxCents,
    by_seat: uid,
  });
  return {
    ok: true as const,
    name: item.name as string,
    unitPriceCents,
    ebt: item.ebt_eligible as boolean,
  };
}
