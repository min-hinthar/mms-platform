"use server";
import { serviceClient, publicClient } from "@mms/db/server";
import type { TaxCategory } from "@mms/db";
import { scanInput, grocerySearchInput, cartViewInput } from "@mms/db/schemas";
import { lineTax } from "./tax";
import { assertCartMember } from "./authz";
import { whyCartUnavailable, type CartUnavailable } from "./cart-failure";
import { assertMutationRate } from "./rate";
import { insertOrIncLine, touchCart } from "./order-lines";

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
/** W9d — every way a scan can fail, named. The catalog reasons (this barcode) and the cart-
 *  availability reasons (this basket) share ONE union so the page has a single exhaustive switch and
 *  can never fall through to "check your connection" for a cart that is simply finished. */
export type ScanAddFailure = "unknown_barcode" | "unavailable" | "weighed_item" | CartUnavailable;

export type ScanAddResult =
  | {
      ok: true;
      name: string;
      unitPriceCents: number;
      ebt: boolean;
      /** null = the post-write read failed. NEVER [] — see the catch below. */
      lines: GroceryLine[] | null;
    }
  | { ok: false; reason: ScanAddFailure; barcode?: string };

export async function scanAdd(cartId: string, barcode: string): Promise<ScanAddResult> {
  const input = scanInput.parse({ cartId, barcode });
  // W9d — the authorization guard still runs FIRST and unchanged; only the SHAPE of its refusal
  // changes. Every throw used to surface on /grocery as "check your connection", so a shopper whose
  // basket had been paid for retried a dead cart forever. `whyCartUnavailable` re-derives the reason
  // behind its own membership gate (a non-member always gets `unreadable`), so nothing here answers
  // a question the caller wasn't already entitled to ask.
  let authz;
  try {
    authz = await assertCartMember(input.cartId);
  } catch {
    return { ok: false as const, reason: await whyCartUnavailable(input.cartId) };
  }
  const { uid, locked, settling } = authz;
  await assertMutationRate(uid); // per-device flood guard (P3.4)
  // Both freezes return BEFORE any write, exactly as the throws did — this is a shape change, not a
  // guard change. Naming them lets the page say "someone's checking out" instead of blaming the radio.
  if (locked) return { ok: false as const, reason: "locked" as const };
  // Parity with the restaurant mutations (cart.ts) — never edit while the table settles a split.
  // Unreachable in the solo grocery flow today (no split), but keep the guard so a future
  // multi-device grocery cart can't slip an edit mid-settlement (defense-in-depth, LEARNINGS #72).
  if (settling) return { ok: false as const, reason: "settling" as const };

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
  // Reuse the same merge-or-insert primitive as restaurant adds. The companion migration widens
  // mms_cart_item_insert_if_open(menu_item_id) to text, so a barcode can go through the same
  // status-atomic open-cart guard instead of the old plain insert path. This keeps the server view,
  // checkout totals, and the local Scan & Go list aligned: repeat scans increment qty.
  await insertOrIncLine(
    input.cartId,
    {
      menuItemId: item.barcode,
      name: item.name,
      opts: [],
      unitPriceCents,
      taxCents,
      fulfillment: "grocery",
    },
    uid,
  );
  await touchCart(input.cartId, "scanAdd");
  // K5: the fresh server-authoritative grocery view in the SAME round trip (the addItem pattern) —
  // the page renders CART truth, so a refresh can never hide items the cart will charge. The WRITE
  // has already committed here, so a failed read must not fail the scan — and it must not pose as
  // an empty basket either: `lines: null` says "couldn't read", and the client keeps its list.
  let lines: GroceryLine[] | null = null;
  try {
    lines = await readGroceryLines(input.cartId);
  } catch {
    /* deliberate: null = read failed (never [] = empty) — the client keeps its last-known view */
  }
  return {
    ok: true as const,
    name: item.name as string,
    unitPriceCents,
    ebt: item.ebt_eligible as boolean,
    lines,
  };
}

/** K5 — a product-grade grocery cart line: the CART line (id = the setQty handle) joined with the
 *  catalog's presentation fields. Every money figure is the cart's own server-derived snapshot. */
export type GroceryLine = {
  lineId: string;
  barcode: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  /** W4e: the catalog's current compare-at (market ref) for this barcode — drives the basket's
   *  "you save" line. Display only; the charged unitPriceCents is the cart's own snapshot. Null if
   *  the item isn't on sale (or its catalog row went away). */
  compareAtCents: number | null;
  ebt: boolean;
  imageUrl: string | null;
};

// Internal (already-authorized) read — callers must have passed assertCartMember for this cart.
// THROWS on a failed query (searchGroceryItems' throw-not-empty discipline): a read failure must
// never resolve as [] — an "empty basket" the page would trust is exactly the money-display bug
// K5 exists to fix (the cart would still charge the invisible items).
async function readGroceryLines(cartId: string): Promise<GroceryLine[]> {
  const db = serviceClient();
  const { data: rows, error } = await db
    .from("qr_cart_items")
    .select("id,menu_item_id,name,qty,unit_price_cents,state")
    .eq("cart_id", cartId)
    .eq("fulfillment", "grocery")
    .neq("state", "voided")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[grocery] readGroceryLines cart read failed", error);
    throw new Error("grocery cart read failed");
  }
  const lines = rows ?? [];
  if (lines.length === 0) return [];
  const barcodes = [...new Set(lines.map((l) => l.menu_item_id))];
  const { data: items, error: catErr } = await db
    .from("grocery_items")
    .select("barcode,ebt_eligible,image_url,compare_at_cents")
    .in("barcode", barcodes);
  if (catErr) {
    console.error("[grocery] readGroceryLines catalog read failed", catErr);
    throw new Error("grocery cart read failed");
  }
  const byBarcode = new Map((items ?? []).map((i) => [i.barcode, i]));
  return lines.map((l) => {
    const cat = byBarcode.get(l.menu_item_id);
    const rawUrl = cat?.image_url ?? null;
    return {
      lineId: l.id,
      barcode: l.menu_item_id,
      name: l.name,
      qty: l.qty,
      unitPriceCents: l.unit_price_cents,
      // Only a genuine discount (compare-at strictly above the CHARGED unit price) counts — a stale
      // catalog compare-at at/below what the line actually charges shows no phantom saving.
      compareAtCents:
        cat?.compare_at_cents != null && cat.compare_at_cents > l.unit_price_cents
          ? cat.compare_at_cents
          : null,
      ebt: cat?.ebt_eligible ?? false,
      // Contain a bad catalog URL: next/image THROWS at render on a non-allowlisted host (only
      // relative paths + *.supabase.co pass next.config remotePatterns) — a broken thumb must
      // never take down the whole page, so anything else renders as "no photo".
      imageUrl:
        rawUrl && (rawUrl.startsWith("/") || /^https:\/\/[^/]+\.supabase\.co\//.test(rawUrl))
          ? rawUrl
          : null,
    };
  });
}

/** W9d — the hydrate read's result. `ok:false` carries WHY (behind cart-failure's membership gate)
 *  so the page can tell "this basket is finished" from "the radio dropped" — the page's blanket
 *  catches used to blame the connection for both. A THROWN error still means transport/unexpected. */
export type GroceryLinesResult =
  | { ok: true; lines: GroceryLine[] }
  | { ok: false; reason: CartUnavailable };

/**
 * K5 — the member-gated grocery cart read: the source of truth the /grocery page hydrates from (on
 * mount and on tab re-focus), fixing the live money-display bug where a refresh showed "Nothing
 * scanned yet" while the server cart still held (and would charge) the items. Read-only.
 *
 * ⚠️ Availability failures (paid/cancelled/expired/frozen) come back as `ok:false`, NOT as a throw —
 * and never as `{ ok:true, lines: [] }`: a refusal must not pose as an empty basket (the cart may
 * still charge lines this caller can't see). The `locked` freeze does NOT refuse this READ (a
 * tablemate in the pay window shouldn't blank the list) — assertCartMember only throws on it for
 * writes, so a locked cart lands in the ok arm here.
 */
export async function getGroceryLines(cartId: string): Promise<GroceryLinesResult> {
  const { cartId: id } = cartViewInput.parse({ cartId }); // every Server Action parses before the DB
  try {
    await assertCartMember(id); // membership is the gate; throws on non-members/unknown carts
  } catch {
    return { ok: false as const, reason: await whyCartUnavailable(id) };
  }
  return { ok: true as const, lines: await readGroceryLines(id) };
}

export type GroceryHit = {
  barcode: string;
  name: string;
  nameMy: string | null;
  brand: string | null;
  sizeQty: number | null;
  sizeUnit: string | null;
  unitPriceCents: number;
  /** W4e: the "Compare at" market reference (> unitPriceCents) — null = not on sale. Display only. */
  compareAtCents: number | null;
  ebt: boolean;
};

/**
 * Name-search fallback for Scan & Go (M2·P2.3, upgraded W4b): when a barcode won't scan or isn't in
 * the catalog, the shopper finds the item by name — English, Myanmar script, or a romanization
 * variant (laphet/lahpet/letphet live in `synonyms` as DATA; pg_trgm similarity catches the typos).
 * The lookup runs through `mms_grocery_search` (service-role-only fn; this Zod-bounded action is its
 * public surface — same posture as the old public-read query: no price/PII is asserted by the
 * client, and adding a hit still goes through the authorized `scanAdd`, which re-derives price +
 * tax server-side). Only available, non-weighed items return (a weighed item needs a scale — don't
 * surface a dead-end result).
 */
export async function searchGroceryItems(query: string): Promise<GroceryHit[]> {
  const { query: q } = grocerySearchInput.parse({ query });
  // The query goes to the RPC RAW (parameterized — no injection surface): the fn feeds it to both
  // ILIKE and trigram `similarity()`, and escaping LIKE metacharacters would leave literal
  // backslashes in the similarity input, distorting the ranking. A stray % simply widens the ILIKE
  // arm (bounded: limit 20, 40-char Zod cap); no catalog name contains LIKE metacharacters.
  const { data, error } = await serviceClient().rpc("mms_grocery_search", { p_q: q });
  if (error) {
    // Throw (not return []) so the caller can tell a lookup FAILURE from a genuine zero-result search
    // and say so honestly. Log the real cause server-side; Next redacts the thrown message in prod.
    console.error("[grocery] searchGroceryItems failed", error);
    throw new Error("grocery search failed");
  }
  return (data ?? []).map((i) => ({
    barcode: i.barcode,
    name: i.name,
    nameMy: i.name_my,
    brand: i.brand,
    sizeQty: i.size_qty === null ? null : Number(i.size_qty),
    sizeUnit: i.size_unit,
    unitPriceCents: Number(i.price_cents),
    // NOTE: the generated RPC type declares compare_at_cents non-nullable (Supabase types every
    // RETURNS-TABLE column non-null), but the fn CAN return null — keep this guard even though the
    // type says it's always-false; it's the real runtime protection. Loose `== null` (not `===`) so
    // an `undefined` from an un-migrated RPC collapses to null too (never `Number(undefined)` = NaN).
    compareAtCents: i.compare_at_cents == null ? null : Number(i.compare_at_cents),
    ebt: i.ebt_eligible,
  }));
}

/** W4b Browse — one catalog item as the browse grid renders it (no cart state; that joins client-side). */
export type GroceryCatalogItem = {
  barcode: string;
  name: string;
  nameMy: string | null;
  brand: string | null;
  category: string | null;
  sizeQty: number | null;
  sizeUnit: string | null;
  priceCents: number;
  /** W4e: the "Compare at" market reference (> priceCents) — null = not on sale. Display only. */
  compareAtCents: number | null;
  /** W9d: show the LOUD "Save N%" pill. A stored merchandising DECISION, never a percentage rule —
   *  306 of 396 SKUs cleared the old `pct >= 15` gate (77% of the market), so a computed threshold
   *  made the badge wallpaper. The quiet "Compare at" strike is independent and still shows on every
   *  genuine discount. */
  featuredDeal: boolean;
  ebt: boolean;
  imageUrl: string | null;
};

/**
 * W4b Browse — the full sellable catalog for the aisle grid. A PUBLIC catalog read (public-read RLS,
 * no price/PII asserted by the client, no membership needed — the add still rides the authorized
 * `scanAdd`). Weighed/unavailable items are excluded for the same no-dead-end reason as search.
 * ~400 rows of presentation fields: one round trip, ordered for stable aisle grouping.
 */
export async function getGroceryCatalog(): Promise<GroceryCatalogItem[]> {
  const { data, error } = await publicClient()
    .from("grocery_items")
    .select(
      "barcode,name,name_my,brand,category,size_qty,size_unit,price_cents,compare_at_cents,ebt_eligible,image_url,is_featured_deal",
    )
    .eq("available", true)
    .eq("weighed", false)
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) {
    // Throw (not []) — the Browse tab must render an honest "couldn't load" + Retry, never an
    // empty market that reads as "we sell nothing".
    console.error("[grocery] getGroceryCatalog failed", error);
    throw new Error("grocery catalog read failed");
  }
  return (data ?? []).map((i) => ({
    barcode: i.barcode,
    name: i.name,
    nameMy: i.name_my,
    brand: i.brand,
    category: i.category,
    sizeQty: i.size_qty === null ? null : Number(i.size_qty),
    sizeUnit: i.size_unit,
    priceCents: Number(i.price_cents),
    compareAtCents: i.compare_at_cents == null ? null : Number(i.compare_at_cents),
    featuredDeal: i.is_featured_deal === true,
    ebt: i.ebt_eligible,
    // Same containment as readGroceryLines: only relative or *.supabase.co URLs reach next/image.
    imageUrl:
      i.image_url &&
      (i.image_url.startsWith("/") || /^https:\/\/[^/]+\.supabase\.co\//.test(i.image_url))
        ? i.image_url
        : null,
  }));
}
