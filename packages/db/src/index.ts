import { createBrowserClient } from "@supabase/ssr";

/** Browser client — anon/publishable key only. Reads via RLS; never writes prices. */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export type TaxCategory =
  | "hot_prepared"
  | "cold_food"
  | "beverage_hot"
  | "beverage_cold"
  | "retail_nonfood"
  | "grocery_food";

export type CartItem = {
  id: string;
  menuItemId: string;
  name: string;
  qty: number;
  modifiers: string[];
  unitPrice: number;
  tax: number;
  bySeat?: string;
};

export type CartTotals = {
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  tip: number;
  total: number;
};
