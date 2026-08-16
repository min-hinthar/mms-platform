import "server-only";
import { serviceClient } from "@mms/db/server";
import type { TaxCategory, LineFulfillment } from "@mms/db";

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
 *  arbitrary (cheaper/foreign) option id into the price.
 *
 *  `enforceCardinality` (the diner add path opts in — see `addItem`) makes the server the authority on
 *  modifier REQUIREDNESS too, not just the client "Choose" gate: every group must have `min_select..max_select`
 *  options chosen, so a forged or stale client can't add a required-modifier item (e.g. a curry without its
 *  style) or an over-cap single-select. Throws on violation; the diner provider recovers + re-syncs. Default
 *  OFF so the trusted staff path (`staffAddItem`) is unchanged. The item's groups are embedded in the single
 *  item query (no extra round-trip on the common add). */
export async function priceItem(
  menuItemId: string,
  modifierIds: string[],
  { enforceCardinality = false }: { enforceCardinality?: boolean } = {},
) {
  const db = serviceClient();
  const { data: item, error } = await db
    .from("menu_items")
    .select(
      "id,name_en,base_price_cents,tax_category,item_modifier_groups(modifier_groups(id,min_select,max_select))",
    )
    .eq("id", menuItemId)
    .single();
  if (error || !item) throw new Error("Unknown menu item");

  const groups = (item.item_modifier_groups ?? [])
    .map((l) => l.modifier_groups)
    .filter((g): g is NonNullable<typeof g> => g != null);
  const allowedGroups = new Set(groups.map((g) => g.id));

  let addCents = 0;
  let optLabels: string[] = [];
  let chosen: { id: string; name: string; price_delta_cents: number; group_id: string }[] = [];
  if (modifierIds.length) {
    const { data: opts } = await db
      .from("modifier_options")
      .select("id,name,price_delta_cents,group_id")
      .eq("is_active", true)
      .in("id", modifierIds);
    chosen = (opts ?? []).filter((m) => allowedGroups.has(m.group_id));
    addCents = chosen.reduce((a, m) => a + m.price_delta_cents, 0);
    optLabels = chosen.map((m) => m.name);
  }

  if (enforceCardinality) {
    // Server-authoritative requiredness/cardinality — the backstop to the client "Choose" gate. `chosen`
    // already holds only valid (active, allowed-group) options, so the per-group count is the true count.
    for (const g of groups) {
      const n = chosen.filter((m) => m.group_id === g.id).length;
      if (n < g.min_select)
        throw new Error("This item needs a required choice — reopen it to choose your options.");
      if (n > g.max_select) throw new Error("Too many options chosen for this item.");
    }
  }

  return {
    name: item.name_en,
    // W17a — the charged unit is the POS price: `base_price_cents` (what the register rings) plus
    // the chosen modifiers' deltas. No mode factor. The Zettle exports settle it — the 15% that
    // used to separate dine-in from to-go at the register was the SERVICE CHARGE, not a higher
    // menu price: across Jan–Jul 2026, 66 of the 72 dishes sold BOTH ways priced identically
    // (docs/data/MENU_REFERENCE.md — regenerated from the exports, not transcribed).
    unitPriceCents: item.base_price_cents + addCents,
    // Single tax category per line (see lib/tax.ts): a modifier's price delta inherits the parent
    // item's category — the charge authority (getCartTotals) can't express a partial taxable base.
    category: item.tax_category as TaxCategory,
    opts: optLabels,
    // M3 — the STABLE ids behind the labels, in the same order. Callers thread these onto the line
    // (modifier_option_ids) so reorder can re-price by id instead of re-guessing by display text.
    optionIds: chosen.map((m) => m.id),
  };
}

export type PricedLine = {
  menuItemId: string;
  name: string;
  opts: string[];
  unitPriceCents: number;
  taxCents: number;
  /** S4 routing tag — set by the caller from context (food: dinein/togo; grocery: 'grocery'). */
  fulfillment: LineFulfillment;
  /** W3b: the kitchen note ("no peanuts — allergy"). Bounded upstream (Zod 160 + column CHECK);
   *  empty/whitespace is normalized to undefined by the caller. Notes never merge (see below). */
  notes?: string;
  /** M3 — stable modifier_options.id list matching `opts` (labels stay the receipt artifact).
   *  Optional: legacy/grocery/no-option callers omit it and the column defaults to '[]'. */
  optionIds?: string[];
};

/**
 * Merge-or-insert a priced line into an OPEN cart, via the status-atomic RPCs (a webhook/settle status
 * flip can't slip a row past the app guard). Merges an identical line (same item + same modifier set +
 * **same `by_seat`**) by bumping qty rather than duplicating. Throws "Cart is no longer open" when the
 * cart isn't open.
 *
 * **Per-seat merge (R5c group-cart model):** `by_seat` is part of the merge key, not just provenance — an
 * add merges only into the SAME diner's own draft sibling, so two diners ordering the same item get
 * SEPARATE lines, each owning + managing their own qty (the menu quick-stepper and the by-person split
 * both read `by_seat`). A solo cart has one seat, so this is unchanged there. A staff-added line
 * (`by_seat = null`, "added by server") merges only with other null lines and stays assignable to a guest
 * later via `assignLine` — it no longer silently folds into whichever diner happened to add the item first.
 */
export async function insertOrIncLine(
  cartId: string,
  line: PricedLine,
  bySeat: string | null,
  // W5c: the item sheet's pre-add quantity (bounded 1–9 by Zod upstream, 1–99 again in the SQL).
  // Every other caller (quick-add, grocery scan, staff, reorder) stays at the default single unit.
  qty: number = 1,
  // W7b: the scan-EVENT id — deduped ATOMICALLY inside the RPCs (the ledger is per cart+scan, so
  // the dedupe survives this function's inc-vs-insert branch flipping between a replay's attempts).
  // The grocery page sends it on LIVE scans too (one id per physical scan, reused by the offline
  // queue's retry — review HIGH). Undefined for every other caller — byte-identical to today.
  scanId?: string,
): Promise<void> {
  const db = serviceClient();
  // Merge ONLY into a still-'draft' sibling (S2.1b): an add must never fold into a line that's already
  // gone to the kitchen ('fired'/'in_progress'/'served') — that would silently grow a quantity the cook
  // may have started, through the state-blind inc_qty path (the one ungated diner→fired mutation). Per
  // the ORDER-MODEL, an add post-fire is a FRESH draft that fires on the next send, so a non-draft
  // sibling falls through to the insert below.
  let siblingQuery = db
    .from("qr_cart_items")
    .select("id,modifiers")
    .eq("cart_id", cartId)
    .eq("menu_item_id", line.menuItemId)
    .eq("fulfillment", line.fulfillment) // S4: a for-here add must NOT merge into a to-go line (different routing/tax)
    .eq("state", "draft")
    // W3b: a NOTED line never merges, in either direction — folding "no peanuts" into a plain sibling
    // (or a plain add into a noted line) would silently apply/erase an allergy instruction on units the
    // diner didn't annotate. Notes are per-line by construction: noted adds always insert fresh, and
    // plain adds only merge into note-less siblings.
    .is("notes", null);
  // Per-seat scope (R5c): merge only into the SAME seat's own draft line — different diners keep separate
  // lines. NULL (staff "added by server") needs PostgREST `.is`, not `.eq`, so it merges only other null lines.
  siblingQuery =
    bySeat === null ? siblingQuery.is("by_seat", null) : siblingQuery.eq("by_seat", bySeat);
  const { data: siblings } = await siblingQuery;
  const dup = line.notes
    ? undefined
    : (siblings ?? []).find((s) => modKey(s.modifiers) === modKey(line.opts));
  if (dup) {
    // ATOMIC `qty = least(qty + p_by, 99)` requiring status='open' and qty<99 (can't lose an increment,
    // can't bump a paid line, can't inflate the Stripe amount). RAISES on a closed cart or an out-of-range
    // bump; hitting the 99-cap is a silent (partial) fill — same semantics the single-unit path always had.
    // `p_by` is spread ONLY for qty>1 (the W3 p_notes pattern): a DB that hasn't taken 20260721000000 yet
    // still resolves every default-qty caller (quick-add, grocery, staff, reorder) — deploy-order safety.
    const { error: incErr } = await db.rpc("mms_cart_item_inc_qty", {
      p_id: dup.id,
      ...(qty !== 1 ? { p_by: qty } : {}),
      // Spread-only-when-set (the p_notes deploy-order pattern): a DB without 20260813210000 still
      // resolves every live caller. A duplicate scan_id makes the RPC a silent no-op (not an error).
      ...(scanId ? { p_scan_id: scanId } : {}),
    });
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
      p_fulfillment: line.fulfillment,
      // p_qty/p_notes/p_scan_id default in SQL — omitted for a plain single add, so a pre-migration
      // DB still resolves the call (deploy-order safety; see the migration header).
      ...(qty !== 1 ? { p_qty: qty } : {}),
      ...(line.notes ? { p_notes: line.notes } : {}),
      ...(scanId ? { p_scan_id: scanId } : {}),
      // M3 — spread ONLY when the line actually carries option ids (same deploy-order pattern):
      // a DB without 20260815100000 still resolves every option-less caller.
      ...(line.optionIds && line.optionIds.length ? { p_option_ids: line.optionIds } : {}),
    });
    // A duplicate scan_id returns the NIL-uuid sentinel — truthy, so it passes this closed-cart
    // check as the idempotent success it is (the write already landed on a prior attempt).
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
