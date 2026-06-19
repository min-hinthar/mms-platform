"use server";
import { serviceClient } from "@mms/db/server";
import type { CartItem, CartTotals, TaxCategory } from "@mms/db";
import { addItemInput, applyPromoInput, cartViewInput, setQtyInput } from "@mms/db/schemas";
import { lineTax } from "./tax";
import { getCartTotals } from "./totals";
import { assertCartItemMember, assertCartMember } from "./authz";
import { getPostHogClient } from "./posthog-server";

// Normalize a modifier set (label array) to a comparable key — order-independent — so "merge
// identical lines" treats the same item with the same options as one line regardless of pick order.
const modKey = (m: unknown): string => JSON.stringify(Array.isArray(m) ? [...m].sort() : []);

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

export async function addItem(cartId: string, menuItemId: string, modifierIds: string[] = []) {
  const input = addItemInput.parse({ cartId, menuItemId, modifierIds });
  // AuthZ first: a verified member of this cart's active session, and the host hasn't locked it.
  const { uid, sessionId, locked } = await assertCartMember(input.cartId);
  if (locked) throw new Error("Order is locked by the host");

  const db = serviceClient();
  const { data: sess } = await db
    .from("table_sessions")
    .select("mode")
    .eq("id", sessionId)
    .single();
  const dineIn = sess?.mode === "dinein";
  const { name, unitPriceCents, category, opts } = await priceItem(
    input.menuItemId,
    input.modifierIds,
  );
  const taxCents = lineTax(unitPriceCents, category, dineIn);
  // Merge identical lines (same menu item + same chosen modifiers) → bump qty instead of a duplicate
  // row, so the cart stays bounded (QA §B perf). Match on the normalized modifier set.
  const { data: siblings } = await db
    .from("qr_cart_items")
    .select("id,modifiers")
    .eq("cart_id", input.cartId)
    .eq("menu_item_id", input.menuItemId);
  const dup = (siblings ?? []).find((s) => modKey(s.modifiers) === modKey(opts));
  if (dup) {
    // ATOMIC increment — a single in-DB `qty = qty + 1` that also JOINs the parent cart and
    // requires `status = 'open'` and `qty < 99` (migration 20260619000100). So it can't lose an
    // increment under concurrency (undercharge), can't bump a paid/fulfilled line (a webhook
    // status flip racing the app-layer guard), and can't be looped to inflate the Stripe amount.
    await db.rpc("mms_cart_item_inc_qty", { p_id: dup.id });
  } else {
    // Status-atomic insert — the new line is written only if the parent cart is still 'open', in one
    // statement (migration 20260619000200), so a webhook status flip can't slip a post-payment row
    // past the app-layer guard. A NULL id back ⇒ the cart is no longer open.
    const { data: insertedId } = await db.rpc("mms_cart_item_insert_if_open", {
      p_cart_id: input.cartId,
      p_menu_item_id: input.menuItemId,
      p_name: name,
      p_modifiers: opts,
      p_unit_price_cents: unitPriceCents,
      p_tax_cents: taxCents,
      p_by_seat: uid, // provenance from the VERIFIED uid, not a client-asserted seat
    });
    if (!insertedId) throw new Error("Cart is no longer open");
  }
  await db.from("qr_carts").update({ updated_at: new Date().toISOString() }).eq("id", input.cartId);

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: uid,
    event: "item_added_to_cart",
    properties: {
      cart_id: input.cartId,
      menu_item_id: input.menuItemId,
      item_name: name,
      unit_price_cents: unitPriceCents,
      modifiers: opts,
      dine_in: dineIn,
    },
  });
}

export async function setQty(cartItemId: string, qty: number) {
  const input = setQtyInput.parse({ cartItemId, qty });
  const { cartId, locked } = await assertCartItemMember(input.cartItemId);
  if (locked) throw new Error("Order is locked by the host");
  const db = serviceClient();
  // Status-atomic set/delete (qty<=0 removes) — applies only while the parent cart is 'open' in one
  // statement (migration 20260619000200), matching the addItem paths. 0 rows ⇒ paid/closed (or gone).
  const { data: affected } = await db.rpc("mms_cart_item_set_qty_if_open", {
    p_id: input.cartItemId,
    p_qty: input.qty,
  });
  if (!affected) throw new Error("Cart is no longer open");
  await db.from("qr_carts").update({ updated_at: new Date().toISOString() }).eq("id", cartId);
}

export async function applyPromo(cartId: string, code: string) {
  const input = applyPromoInput.parse({ cartId, code });
  const { uid, locked } = await assertCartMember(input.cartId);
  if (locked) throw new Error("Order is locked by the host");
  const db = serviceClient();
  const { data: promo } = await db
    .from("promo_codes")
    .select("code,kind,value,max_uses,used,active")
    .eq("code", input.code.toUpperCase())
    .maybeSingle();
  if (!promo || !promo.active || (promo.max_uses != null && promo.used >= promo.max_uses))
    throw new Error("Invalid code");
  // NOTE(M2·P2.1): this checks `used` but does NOT consume a redemption — full cap enforcement
  // (atomic, consumed on FULFILLMENT not on apply, + per-session rate-limit) is the M2 promo phase.
  // Not exploitable today: no promo codes are seeded, and applying only sets `qr_carts.promo_code`.
  await db.from("qr_carts").update({ promo_code: promo.code }).eq("id", input.cartId);

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: uid, // the verified diner uid (matches item_added_to_cart) — not the cart id
    event: "promo_applied",
    properties: {
      cart_id: input.cartId,
      promo_code: promo.code,
      promo_kind: promo.kind,
      promo_value: promo.value,
    },
  });
}

/**
 * Member-gated read of a cart's lines + server-authoritative totals — the single source the cart
 * UI renders and re-fetches after every mutation (never client math). Totals exclude tip (a
 * pay-step choice). Authorized like every other path (RED-TEAM #2), so it's not an IDOR read.
 */
export async function getCartView(
  cartId: string,
): Promise<{ items: CartItem[]; totals: CartTotals }> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  await assertCartMember(id);
  const db = serviceClient();
  const { data: rows } = await db
    .from("qr_cart_items")
    .select("id,menu_item_id,name,qty,modifiers,unit_price_cents,tax_cents,by_seat")
    .eq("cart_id", id)
    .order("created_at", { ascending: true });
  const items: CartItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    menuItemId: r.menu_item_id,
    name: r.name,
    qty: r.qty,
    modifiers: Array.isArray(r.modifiers) ? (r.modifiers as string[]) : [],
    unitPriceCents: r.unit_price_cents,
    taxCents: r.tax_cents,
    bySeat: r.by_seat ?? undefined,
  }));
  return { items, totals: await getCartTotals(id) };
}
