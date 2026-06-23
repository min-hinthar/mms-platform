import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export type { Database } from "./database.types";
export type { Tables, TablesInsert, TablesUpdate } from "./database.types";

/** Browser client — anon/publishable key only. Reads via RLS; never writes prices. */
export function browserClient() {
  return createBrowserClient<Database>(
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
};

export type CartTotals = {
  subtotalCents: number;
  discountCents: number;
  /** The reward-coupon portion of discountCents (M4 P4.2) — surfaced so the UI can show it as a distinct
   *  line; discountCents already includes it. 0 when no reward is applied. */
  rewardCents: number;
  serviceChargeCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
};
