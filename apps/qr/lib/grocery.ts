"use server";
import { serviceClient, publicClient } from "@mms/db/server";
import type { TaxCategory } from "@mms/db";
import { scanInput, grocerySearchInput } from "@mms/db/schemas";
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
  if (locked) throw new Error("Order is locked while someone checks out");

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
  // Status-atomic insert (the same RPC the restaurant addItem uses, migration 20260619000200): the
  // line is written only if the cart is still 'open', in one statement — so a webhook status flip to
  // 'paid' can't slip a post-payment row past the app-layer guard. NULL id ⇒ cart no longer open
  // (the grocery UI catches the throw and shows a generic "couldn't add").
  const { data: insertedId } = await db.rpc("mms_cart_item_insert_if_open", {
    p_cart_id: input.cartId,
    p_menu_item_id: item.barcode,
    p_name: item.name,
    p_modifiers: [],
    p_unit_price_cents: unitPriceCents,
    p_tax_cents: taxCents,
    p_by_seat: uid,
  });
  if (!insertedId) throw new Error("Cart is no longer open");
  return {
    ok: true as const,
    name: item.name as string,
    unitPriceCents,
    ebt: item.ebt_eligible as boolean,
  };
}

export type GroceryHit = { barcode: string; name: string; unitPriceCents: number; ebt: boolean };

/**
 * Name-search fallback for Scan & Go (M2·P2.3): when a barcode won't scan or isn't in the catalog,
 * the diner finds the item by name. This is a PUBLIC catalog read — `grocery_items` has public-read
 * RLS and no price/PII is asserted by the client — so it needs no membership (adding a hit still
 * goes through the authorized `scanAdd`, which re-derives the price + tax server-side). Only
 * available, non-weighed items are returned: a weighed item needs a scale, so it can't be added
 * anyway (don't surface a dead-end result). Read-only failure → empty list (the UI says "no matches").
 */
export async function searchGroceryItems(query: string): Promise<GroceryHit[]> {
  const { query: q } = grocerySearchInput.parse({ query });
  // Escape LIKE metacharacters so a stray % / _ searches literally, not as a wildcard.
  const safe = q.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await publicClient()
    .from("grocery_items")
    .select("barcode,name,price_cents,ebt_eligible")
    .eq("available", true)
    .eq("weighed", false)
    .ilike("name", `%${safe}%`)
    .order("name")
    .limit(12);
  if (error) {
    // Throw (not return []) so the caller can tell a lookup FAILURE from a genuine zero-result search
    // and say so honestly. Log the real cause server-side; Next redacts the thrown message in prod.
    console.error("[grocery] searchGroceryItems failed", error);
    throw new Error("grocery search failed");
  }
  return (data ?? []).map((i) => ({
    barcode: i.barcode as string,
    name: i.name as string,
    unitPriceCents: Number(i.price_cents),
    ebt: i.ebt_eligible as boolean,
  }));
}
