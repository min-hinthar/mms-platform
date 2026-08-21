import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@mms/db/server";

/**
 * Staff session refresh, called from `proxy.ts` — the reason a staff sign-in now survives on a device
 * until someone signs out (owner, 2026-08-21).
 *
 * ── What was actually broken ────────────────────────────────────────────────────────────────────
 * `@supabase/ssr`'s browser client persists the session to cookies and the SSR client reads them
 * back, but the access token is a JWT with a short TTL (an hour by default) and something has to
 * exchange the refresh token for a new one. The browser client does that WHILE A TAB IS OPEN AND
 * AWAKE. It does not happen for the request that arrives after the tab was closed, or after a
 * wall-mounted display slept, or on the first cold navigation the next morning: the SERVER reads an
 * expired access token, `getUser()` fails, `getStaffAuth()` answers `anon`, and the shell redirects
 * to `/staff/login`. That reads as "it logged me out overnight", because it is.
 *
 * A Server Component cannot fix this itself — RSC render is READ-ONLY for cookies, so even when the
 * SSR client refreshes the token it has nowhere to persist the result, and the next request repeats
 * the same expired read. `proxy.ts` is the one place in Next that can read the request's cookies and
 * write them onto the response.
 *
 * ── Why this is a separate module, and scoped ───────────────────────────────────────────────────
 * `proxy.ts`'s CSP matcher covers EVERY document route, and a `getUser()` there would put an auth
 * round-trip in front of every QR scan — the hot path, on anonymous sessions that need none of this.
 * So the refresh is called only for the staff-shaped prefixes, and the decision lives in `needsStaffSession`
 * where it can be tested rather than buried in a conditional.
 *
 * ── The rule: refresh, never judge ──────────────────────────────────────────────────────────────
 * This establishes a session and forwards cookies. It does NOT decide who is staff and it does NOT
 * redirect. Authorization stays in `getStaffAuth()` / `requireStaffPage()`, which read the staff row
 * and can tell `not_staff` from `unavailable` (W10b). A proxy that redirected on "no session" would
 * collapse that distinction and bounce a whole kitchen to the login screen during a database blip —
 * the M32 failure, re-introduced one layer earlier.
 */

/**
 * The four surfaces the owner signs into: both staff portals (`/staff` covers the console, including
 * `/staff/kitchen` and `/staff/expo`) and the two device surfaces.
 *
 * `/api/board` is absent for a reason stronger than choice: `proxy.ts`'s matcher is
 * `/((?!api|_next/static|_next/image|ingest|favicon.ico).*)`, so NOTHING under `/api` reaches this
 * file at all (verified against the compiled middleware chunk, not inferred from the source). That
 * suits the board anyway — it polls that route every 5s from a page that never navigates, so a
 * per-poll auth round-trip would become the app's most frequent server call while buying nothing:
 * the browser client refreshes the session on its own while the tab is open, and the cold-start case
 * is the `/board` DOCUMENT request, which is covered here.
 */
const STAFF_PREFIXES = ["/staff", "/kiosk", "/board"] as const;

/** Does this path carry a staff session worth refreshing? Exact segment match — `/boardroom` is not `/board`. */
export function needsStaffSession(pathname: string): boolean {
  return STAFF_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refresh the session and return a response carrying any rotated cookies.
 *
 * `rebuild` is how the caller re-creates its response after a cookie write — the caller owns the CSP
 * headers, so it must be the one to re-apply them; this module must not know the CSP exists. On any
 * failure the ORIGINAL response is returned unchanged: a refresh that cannot happen is not a reason
 * to fail the request, and the page's own auth read will produce the honest verdict a moment later.
 */
export async function withRefreshedStaffSession(
  request: NextRequest,
  response: NextResponse,
  rebuild: () => NextResponse,
): Promise<NextResponse> {
  // Every cookie the refresh emits, accumulated — NOT applied one at a time.
  //
  // ⚠️ A real session is CHUNKED: `@supabase/ssr` splits `sb-<ref>-auth-token` into `.0`/`.1` once
  // the JWT outgrows 4KB, and a refresh can also DELETE stale chunks. So `setAll` routinely emits
  // several cookies in one call. Rebuilding the response inside that loop threw away the
  // `Set-Cookie` headers of every prior iteration and shipped only the last chunk — half a session,
  // which reads to the browser as no session at all. The bug would have been invisible on a short
  // token and permanent on a real one, in exactly the overnight path this module exists for
  // (Codex round 1, P1).
  const pending: { name: string; value: string; options?: unknown }[] = [];
  try {
    // The package's own SSR client, via a CookieStore adapter over the middleware request/response
    // pair — `@mms/db` owns Supabase construction and the env binding (apps import from package
    // roots, never a deep path or a second copy of `@supabase/ssr`).
    const supabase = serverClient({
      getAll: () => request.cookies.getAll(),
      set: (name, value, options) => {
        // Write onto the REQUEST as we go, so the rebuilt response's request headers carry the NEW
        // token rather than the expired one the request arrived with.
        request.cookies.set(name, value);
        pending.push({ name, value, options });
      },
    });
    // The call that performs the refresh. Its RESULT is deliberately unused — see the header: this
    // establishes the session, it does not judge it.
    await supabase.auth.getUser();
  } catch {
    // Missing env, transport failure, an unparseable cookie — none of them are a reason to fail the
    // request. These surfaces already have honest not-configured/outage states, and the page's own
    // auth read produces the verdict a moment later.
    return response;
  }
  if (pending.length === 0) return response; // nothing rotated — the arriving response is correct

  // ONE rebuild, after every mutation, then every cookie onto it.
  const refreshed = rebuild();
  for (const { name, value, options } of pending) {
    refreshed.cookies.set(name, value, options as Parameters<typeof refreshed.cookies.set>[2]);
  }
  return refreshed;
}
