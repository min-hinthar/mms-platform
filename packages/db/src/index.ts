import type { Database } from "./database.types";
import { createBrowserSupabaseClient } from "./factory";

export type { Database } from "./database.types";
export type { Tables, TablesInsert, TablesUpdate } from "./database.types";

/** Browser client — anon/publishable key only. Reads via RLS; never writes prices. QR's env binding of the
 *  generic `createBrowserSupabaseClient` factory (M5 · P5.0); delivery binds its own in P5.2. */
export function browserClient() {
  return createBrowserSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
  );
}

export type TaxCategory =
  | "hot_prepared"
  | "cold_food"
  | "beverage_hot"
  | "beverage_cold"
  | "retail_nonfood"
  | "grocery_food";

// The pre-settlement line lifecycle (S2.1a `qr_cart_items.state`, mirrors the SQL CHECK). Canonical
// here so both the cart view (CartItem below) and the isomorphic gate (apps/qr/lib/permissions.ts)
// import ONE definition — the gate's diner-vs-staff rule keys on this exact union.
export type LineState = "draft" | "fired" | "in_progress" | "served" | "voided";

// Money is integer CENTS everywhere (parity with the delivery schema). Convert to dollars at the
// UI edge only (cents / 100). The server is the sole authority for every amount below.
export type CartItem = {
  id: string;
  menuItemId: string;
  name: string;
  qty: number;
  modifiers: string[];
  unitPriceCents: number;
  taxCents: number;
  bySeat?: string;
  /** The item has since been 86'd (menu_items.is_sold_out) — the cart can't increment it (QA §D
   *  sold-out trap), only decrement/remove. Server-derived in getCartView; grocery lines stay false. */
  soldOut?: boolean;
  /** Where the line is in its kitchen life (S2.2). 'draft' = still editable by the diner; once
   *  'fired'/'in_progress'/'served' the diner can't edit it (the UI shows its state + "Ask a server",
   *  the server enforces via canMutateLine). Defaults 'draft' for any line that predates S2. */
  lineState: LineState;
  /** When this line's grace expires / it became visible to the kitchen (ISO), null while 'draft'.
   *  S2.2 fires at now()+grace; a line is undoable only while `fireAt` is still in the future. */
  fireAt?: string | null;
  /** Comped (S2.3): a manager gave this line away — the kitchen still makes it (state unchanged) but it's
   *  charged at $0 (excluded from getCartTotals). The cart shows a "Comped" chip. Defaults false. */
  comped?: boolean;
  /** Where the line goes (S4 unified basket): `dinein` (kitchen now, to the table) · `togo` (kitchen at
   *  checkout) · `grocery` (no kitchen, bagged). Drives routing + per-line tax (cold food is taxable only
   *  dine-in). The diner groups the cart by this; a food line can toggle dinein↔togo. */
  fulfillment: LineFulfillment;
  /** W3b: the kitchen note ("no peanuts — allergy") the diner attached at add time. Read-only in the
   *  cart (remove/re-add to change it) but VISIBLE — a safety-adjacent channel must be verifiable, and
   *  it's what tells a noted line apart from an identical-looking plain sibling (notes never merge). */
  notes?: string | null;
  /** W13 — the line's catalog photo (menu image_url for uuid refs, grocery image_url for barcode
   *  refs), server-joined in getCartView and CONTAINED by lib/media-url (next/image throws on
   *  non-allowlisted hosts). null → the designed PhotoPlaceholder. Display-only. */
  imageUrl?: string | null;
  /** W13 — the line's Burmese name (menu/grocery name_my), joined alongside imageUrl. The post-add
   *  path speaks both tongues; render with lang="my" + the --font-my stack. Display-only. */
  nameMy?: string | null;
};

/** A cart line's destination/routing tag (S4). Grocery is auto-tagged; food toggles dinein↔togo. */
export type LineFulfillment = "dinein" | "togo" | "grocery";

export type CartTotals = {
  subtotalCents: number;
  discountCents: number;
  /** The reward-coupon portion of discountCents (M4 P4.2) — surfaced so the UI can show it as a distinct
   *  line; discountCents already includes it. 0 when no reward is applied. */
  rewardCents: number;
  /** M22 — the applied coupon's FACE value, before the clamp to the chargeable base. Equal to
   *  `rewardCents` except when the basket is smaller than the coupon, which is the one case a surface
   *  must disclose: the coupon is consumed in FULL at fulfillment (`mms_redeem_cart_reward` flips
   *  `redeemed_at` unconditionally), so the difference is value the diner permanently loses. 0 when no
   *  reward is applied. Never quote a coupon's face from a separate read — this is the one derived
   *  beside the clamp that discarded it. */
  rewardFaceCents: number;
  /** M22 — the PROMO's own contribution, after the reward has taken its share of the base.
   *  `discountCents` folds promo + reward together, and that combined value is not a fact about
   *  either one: fulfillment used it as the promo's consumption predicate and so spent a redemption
   *  for a promo that delivered nothing. Surfaced here so the amount is derived ONCE, beside the
   *  clamp that produced it, and read by the fulfillment callers and the UI's promo row alike. */
  promoCents: number;
  serviceChargeCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
};
