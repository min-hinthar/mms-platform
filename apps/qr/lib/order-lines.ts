import "server-only";
import { serviceClient } from "@mms/db/server";
import type { TaxCategory } from "@mms/db";

/**
 * Server-authoritative line pricing + insert, shared by the diner cart (lib/cart.ts addItem) and the
 * staff order-for-a-guest path (lib/staff-cart.ts staffAddItem). The browser NEVER sends a price — it
 * sends a menu item id + chosen modifier OPTION ids; the server re-derives every amount here (RED-TEAM
 * C1/C2). Keeping this in ONE module is why a staff write can't drift from the diner pricing rule.
 * Money is integer CENTS end-to-end.
 */

// Normalize a modifier set (label array) to a comparable, order-independent key — so "merge identical
// lines" treats the same item + same options as one line regardless of pick order.
const modKey = (m: unknown): string => JSON.stringify(Array.isArray(m) ? [...m].sort() : []);

/** Re-derive price (cents), name, tax category, and chosen option labels for a menu item. Only modifier
 *  options that genuinely belong to one of THIS item's groups are honored, so a client can't smuggle an
 *  arbitrary (cheaper/foreign) option id into the price. */
export async function priceItem(menuItemId: string, modifierIds: string[]) {
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

  return {
    name: item.name_en,
    unitPriceCents: item.base_price_cents + addCents,
    category: item.tax_category as TaxCategory,
    opts: optLabels,
  };
}

export type PricedLine = {
  menuItemId: string;
  name: string;
  opts: string[];
  unitPriceCents: number;
  taxCents: number;
};

/**
 * Merge-or-insert a priced line into an OPEN cart, via the status-atomic RPCs (a webhook/settle status
 * flip can't slip a row past the app guard). Merges an identical line (same item + same modifier set)
 * by bumping qty rather than duplicating. Throws "Cart is no longer open" when the cart isn't open.
 * `bySeat` is provenance only: a VERIFIED diner uid, or null for a staff-added line ("added by server").
 */
export async function insertOrIncLine(
  cartId: string,
  line: PricedLine,
  bySeat: string | null,
): Promise<void> {
  const db = serviceClient();
  // Merge ONLY into a still-'draft' sibling (S2.1b): an add must never fold into a line that's already
  // gone to the kitchen ('fired'/'in_progress'/'served') — that would silently grow a quantity the cook
  // may have started, through the state-blind inc_qty path (the one ungated diner→fired mutation). Per
  // the ORDER-MODEL, an add post-fire is a FRESH draft that fires on the next send, so a non-draft
  // sibling falls through to the insert below.
  const { data: siblings } = await db
    .from("qr_cart_items")
    .select("id,modifiers")
    .eq("cart_id", cartId)
    .eq("menu_item_id", line.menuItemId)
    .eq("state", "draft");
  const dup = (siblings ?? []).find((s) => modKey(s.modifiers) === modKey(line.opts));
  if (dup) {
    // ATOMIC `qty = qty + 1` requiring status='open' and qty<99 (can't lose an increment, can't bump a
    // paid line, can't inflate the Stripe amount). RAISES on a closed cart; a 99-cap is a silent no-op.
    const { error: incErr } = await db.rpc("mms_cart_item_inc_qty", { p_id: dup.id });
    if (incErr) throw new Error("Cart is no longer open");
  } else {
    const { data: insertedId } = await db.rpc("mms_cart_item_insert_if_open", {
      p_cart_id: cartId,
      p_menu_item_id: line.menuItemId,
      p_name: line.name,
      p_modifiers: line.opts,
      p_unit_price_cents: line.unitPriceCents,
      p_tax_cents: line.taxCents,
      // The SQL param `p_by_seat uuid` is nullable (added-by-server lines pass null); Supabase's
      // type-gen marks it non-null, so cast. NULL is a valid provenance ("no seat").
      p_by_seat: bySeat as string,
    });
    if (!insertedId) throw new Error("Cart is no longer open");
  }
}

/** Bump a cart's updated_at so realtime peers re-sync. Non-fatal (the line mutation already committed) —
 *  a stale updated_at shouldn't surface as an error, but log it. */
export async function touchCart(cartId: string, ctx: string): Promise<void> {
  const db = serviceClient();
  const { error } = await db
    .from("qr_carts")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", cartId);
  if (error) console.error(`[cart] updated_at touch failed (${ctx})`, error.message);
}
