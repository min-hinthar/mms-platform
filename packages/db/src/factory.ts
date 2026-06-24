import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient, createServerClient } from "@supabase/ssr";

/**
 * Generic, project-parameterized Supabase client factory (M5 · P5.0).
 *
 * This is the construction logic — extracted from the QR-bound wrappers in `./server.ts` + `./index.ts` —
 * made GENERIC over the project's `Database` type and INJECTED with `url`/`key` (NO `process.env` read
 * here). It is the shared `@mms/db` contract M5's `apps/delivery` imports: each app binds its OWN generated
 * `Database` type + its OWN project env (QR → `fasnpdhtvqtzjlvruqcu`, delivery → `ukuzkhuppqwtrdkjqrkv`),
 * so the two apps share ONE client idiom WITHOUT sharing a database (the locked M5 topology — see
 * `docs/M5_DESIGN.md`). The per-app env binding lives in each app's wrapper (QR's server clients in
 * `./server.ts`, its browser client in `./index.ts`); the `server-only` boundary for the service-role key is
 * enforced in `./server.ts` specifically (where the key is read) — `./index.ts` is the browser entry by design.
 *
 * No `server-only` in this module: the browser factory must be importable client-side. The service-role
 * factory lives here too (it's a pure constructor — the DANGER is the KEY, not the function), so its
 * doc-comment is explicit and its only QR entry point (`serviceClient()` in `./server.ts`) keeps the
 * `server-only` import that prevents the service key from ever being read into a browser bundle.
 */

/**
 * Browser client — anon/publishable key only (reads via RLS; never writes prices). Persists the session to
 * cookies so the SSR client (`createSsrClient`) can read it back. Importable in client components.
 */
export function createBrowserSupabaseClient<DB>(url: string, key: string) {
  return createBrowserClient<DB>(url, key);
}

/**
 * Service-role client — bypasses RLS by design (the server is the authoritative writer of prices/tax/orders).
 * SERVER ONLY: the caller MUST guarantee `serviceRoleKey` is never bundled to the browser (read it from a
 * non-`NEXT_PUBLIC_` env, behind a `server-only` module — see `serviceClient()` in `./server.ts`).
 */
export function createServiceRoleClient<DB>(
  url: string,
  serviceRoleKey: string,
): SupabaseClient<DB> {
  return createClient<DB>(url, serviceRoleKey, { auth: { persistSession: false } });
}

/**
 * Public read client — anon/publishable key, no user session. For RSC reads of PUBLIC, public-read-RLS data
 * (e.g. the menu/grocery catalog). Least privilege: never hands a service-role key to a public render path.
 */
export function createPublicClient<DB>(url: string, key: string): SupabaseClient<DB> {
  return createClient<DB>(url, key, { auth: { persistSession: false } });
}

/**
 * Session-scoped client — bound to a user's access token. RLS applies, so it can only read what the token
 * authorizes. `.auth.getUser()` on it VERIFIES the token with the auth server (the trustworthy Bearer→uid).
 */
export function createSessionClient<DB>(
  url: string,
  key: string,
  accessToken: string,
): SupabaseClient<DB> {
  return createClient<DB>(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}

/**
 * Minimal cookie adapter — the shape Next's `cookies()` store satisfies. Kept here so `@mms/db` stays
 * framework-agnostic: the app passes `await cookies()`; this package never imports `next/headers`. `set` is
 * optional because the RSC cookie store is read-only.
 */
export type CookieStore = {
  getAll: () => { name: string; value: string }[];
  set?: (name: string, value: string, options?: Record<string, unknown>) => void;
};

/**
 * SSR session client — reads a user's auth session from the request cookies (persisted by the browser
 * client). Use in Server Actions / route handlers to resolve the caller's `auth.uid()`. RLS applies to its
 * own reads. The read-only-RSC-store case (no `set`) is swallowed — token refresh happens on a mutable surface.
 */
export function createSsrClient<DB>(url: string, key: string, cookieStore: CookieStore) {
  return createServerClient<DB>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
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
