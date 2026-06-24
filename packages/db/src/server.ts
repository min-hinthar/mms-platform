import "server-only";
import type { Database } from "./database.types";
import {
  createPublicClient,
  createServiceRoleClient,
  createSessionClient,
  createSsrClient,
  type CookieStore,
} from "./factory";

/**
 * QR's server-side Supabase clients — the QR-env + QR-`Database` BINDING of the generic factory
 * (`./factory.ts`, M5 · P5.0). The construction logic lives in the factory so `apps/delivery` can reuse it
 * with its OWN type + project env; this module binds it to QR (`fasnpdhtvqtzjlvruqcu`) and keeps the
 * `server-only` boundary that prevents the service-role key from ever reaching a browser bundle.
 */

/**
 * Fail-fast env read (P1.6). A missing secret is a deploy/config error — surfacing it here, named,
 * beats a silent `undefined` that the old `process.env.X!` handed to `createClient`, where it
 * resurfaced as a cryptic auth/network failure several layers down (and once, in this sandbox,
 * masked the delivery-vs-QR project mix-up). Read at call time, so a misconfig fails the request,
 * not the build.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Accept either the legacy anon key or the new publishable key env name; require one. */
function publishableKey(): string {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!value)
    throw new Error(
      "Missing required env var: NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
    );
  return value;
}

/** Re-exported so existing `@mms/db/server` consumers keep their import; the type now lives in the factory. */
export type { CookieStore };

/**
 * Service-role client — SERVER ONLY. Bypasses RLS by design: the server is the
 * authoritative writer of cart prices, tax, and orders. Never import this in a
 * client component; never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function serviceClient() {
  return createServiceRoleClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

/**
 * Public read client — anon/publishable key, no user session. For RSC reads of the
 * PUBLIC catalog (menu, grocery) gated by public-read RLS. Least privilege: never
 * hands the service-role key to a public render path.
 */
export function publicClient() {
  return createPublicClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), publishableKey());
}

/**
 * Member client — scoped to a diner's anonymous-auth access token. RLS applies,
 * so this can only ever read the session/cart it belongs to. Use for SELECTs.
 * `.auth.getUser()` on this client VERIFIES the token with the auth server (network
 * round-trip), so it's the trustworthy way to turn a Bearer token into `auth.uid()`.
 */
export function sessionClient(accessToken: string) {
  return createSessionClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey(),
    accessToken,
  );
}

/**
 * SSR session client — reads the diner's anonymous-auth session from the request cookies (persisted by the
 * browser `createBrowserClient`). Use in Server Actions / route handlers to
 * `await serverClient(await cookies()).auth.getUser()` → the caller's `auth.uid()`, then authorize
 * a service-role mutation against `session_members`. RLS still applies to this client's own reads.
 */
export function serverClient(cookieStore: CookieStore) {
  return createSsrClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey(),
    cookieStore,
  );
}
