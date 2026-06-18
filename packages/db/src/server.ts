import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Accept either the legacy anon key or the new publishable key env name.
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Service-role client — SERVER ONLY. Bypasses RLS by design: the server is the
 * authoritative writer of cart prices, tax, and orders. Never import this in a
 * client component; never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Public read client — anon/publishable key, no user session. For RSC reads of the
 * PUBLIC catalog (menu, grocery) gated by public-read RLS. Least privilege: never
 * hands the service-role key to a public render path.
 */
export function publicClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
}

/**
 * Member client — scoped to a diner's anonymous-auth access token. RLS applies,
 * so this can only ever read the session/cart it belongs to. Use for SELECTs.
 */
export function sessionClient(accessToken: string) {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}
