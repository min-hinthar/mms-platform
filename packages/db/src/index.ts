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
};

export type CartTotals = {
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
};
