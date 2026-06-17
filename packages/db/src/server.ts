import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — SERVER ONLY. Bypasses RLS by design: the server is the
 * authoritative writer of cart prices, tax, and orders. Never import this in a
 * client component; never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Member client — scoped to a diner's short-lived table-session JWT. RLS applies,
 * so this can only ever read the session/cart it belongs to. Use for SELECTs.
 */
export function sessionClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    },
  );
}
