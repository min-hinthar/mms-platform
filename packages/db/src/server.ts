import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
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
 * `.auth.getUser()` on this client VERIFIES the token with the auth server (network
 * round-trip), so it's the trustworthy way to turn a Bearer token into `auth.uid()`.
 */
export function sessionClient(accessToken: string) {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}

/**
 * Minimal cookie adapter — the shape Next's `cookies()` store satisfies. Kept here so
 * `@mms/db` stays framework-agnostic: the app passes `await cookies()`, we don't import
 * `next/headers`. `set` is optional because the RSC cookie store is read-only.
 */
export type CookieStore = {
  getAll: () => { name: string; value: string }[];
  set?: (name: string, value: string, options?: Record<string, unknown>) => void;
};

/**
 * SSR session client — reads the diner's anonymous-auth session from the request cookies
 * (persisted by the browser `createBrowserClient`). Use in Server Actions / route handlers to
 * `await serverClient(await cookies()).auth.getUser()` → the caller's `auth.uid()`, then authorize
 * a service-role mutation against `session_members`. RLS still applies to this client's own reads.
 */
export function serverClient(cookieStore: CookieStore) {
  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        // RSC cookie stores are read-only (no `set`) — token refresh is handled on a
        // mutable surface (Server Action / route / middleware), so swallow that case.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set?.(name, value, options as Record<string, unknown>);
          }
        } catch {
          /* read-only store — ignore */
        }
      },
    },
  });
}
