import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request nonce CSP (M1·P1.6). A fresh nonce on every response lets us drop `script-src
 * 'unsafe-inline'` — the one directive that made the old static CSP toothless against an injected
 * <script>. `'strict-dynamic'` then trusts only the nonced framework bootstrap and whatever IT
 * loads (Stripe.js via `loadStripe`, PostHog via the same-origin `/ingest` proxy), so the
 * `https://js.stripe.com` host source is just a fallback for pre-CSP3 browsers. Next.js reads the
 * nonce off the request CSP header and stamps it onto every framework <script> automatically.
 *
 * CSP lives here (not in next.config's static `headers()`) precisely because the nonce must change
 * per request; the static, nonce-free headers (Referrer-Policy / nosniff / Permissions-Policy /
 * HSTS) stay in next.config so they also cover API + static responses this matcher skips.
 *
 * `proxy` is Next 16's rename of the `middleware` convention (same Edge runtime + matcher API).
 */
// W1·Q11: pin the Supabase directives to OUR project host instead of any `*.supabase.co` tenant —
// a wildcard lets injected markup/fetches talk to an attacker-controlled Supabase project. Derived
// from the build-inlined env; falls back to the wildcard if unset/malformed (never break the app on
// a config gap — the wildcard is the pre-Q11 status quo, not a regression).
function supabaseOrigins(): { https: string; wss: string } {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return { https: u.origin, wss: `wss://${u.host}` };
  } catch {
    return { https: "https://*.supabase.co", wss: "wss://*.supabase.co" };
  }
}

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  // `next dev` (React's dev runtime + Turbopack HMR) evaluates code via eval(), which 'strict-dynamic'
  // + a nonce can't authorize — only 'unsafe-eval' does. Add it in development ONLY; production never
  // ships it. (NODE_ENV is inlined on the Edge runtime.)
  const isDev = process.env.NODE_ENV === "development";
  const supa = supabaseOrigins();

  const csp = [
    "default-src 'self'",
    // 'self' + the js.stripe.com hosts are the CSP2 fallback; CSP3 browsers honor 'strict-dynamic' and
    // ignore them, trusting the nonce + scripts the nonced bundle loads (Stripe.js, the /ingest SDK).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://*.js.stripe.com${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    // Inline styles stay allowed: React style props, next/font, and NumberFlow emit them, and CSS
    // injection is a marginal risk next to script. Tighten to a nonce/hash if that calculus changes.
    "style-src 'self' 'unsafe-inline'",
    // Dish photos still hotlink the DELIVERY project's storage (ukuzkhuppqwtrdkjqrkv) until the W2a
    // bucket migration — keep that ONE extra host until then, then drop it (PRODUCTION_PLAN W2a).
    `img-src 'self' data: blob: ${supa.https} https://ukuzkhuppqwtrdkjqrkv.supabase.co`,
    "font-src 'self'",
    // Supabase REST + Realtime websocket (OUR project only); the Stripe API. PostHog stays first-party
    // via the next.config `/ingest` rewrite (covered by 'self') — if api_host ever leaves /ingest, its
    // host must be added here or analytics silently breaks under CSP.
    `connect-src 'self' ${supa.https} ${supa.wss} https://api.stripe.com`,
    // Stripe's Payment Element mounts iframes on per-origin *.js.stripe.com shards (frame-src is a
    // plain host allow-list — 'strict-dynamic' does NOT cover it), plus hooks.stripe.com for redirects.
    "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  // Next reads the nonce from the CSP on the *request* to stamp its own <script> tags; the browser
  // enforces the CSP on the *response*. `x-nonce` is exposed for any app-authored <Script nonce=…>.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  // (W16b: the W5 Accept-Language locale-cookie seed is retired with the toggle — the app is
  // always bilingual. Stale mms_locale cookies on devices are inert; nothing reads them.)
  return response;
}

export const config = {
  // Document routes only — skip API, the Next static/image pipelines, the PostHog /ingest proxy, and
  // prefetches (an RSC-payload prefetch carries no inline bootstrap to nonce; the real navigation
  // that follows hits this middleware).
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|ingest|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
