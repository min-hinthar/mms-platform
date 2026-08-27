/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  StaleWhileRevalidate,
  ExpirationPlugin,
  CacheableResponsePlugin,
  NavigationRoute,
  Serwist,
} from "serwist";

/**
 * The QR service worker (W7b — S3). Ported from the delivery repo's production-hardened pattern,
 * then made STRICTER, because this app's honesty discipline forbids most caching:
 *
 *  - **Documents are NETWORK-ONLY.** The root layout is force-dynamic (per-request CSP nonce) — a
 *    cached document replays a stale nonce and dead content-hashed chunk references after a
 *    deploy, turning lib/error-recovery.ts's one-shot chunk reload into a no-op loop. When the
 *    network fails, the fallback is a SYNTHETIC response built right here (no cached headers, no
 *    stale CSP, versioned with this file).
 *  - **`/api/*`, `/ingest/*`, and every POST are never intercepted.** Money and session routes are
 *    strictly network; a cached /api/health `{db:'ok'}` would re-blame the diner during a real
 *    outage — the exact lie W10a exists to kill. (Serwist routes match GET only, so Server-Action
 *    POSTs are untouched by construction; the navigation denylist covers the GET surface.)
 *  - Runtime caches cover only content-hashed immutables (`/_next/static`) and the image
 *    optimizer (`/_next/image`, status-200 only — the delivery repo's opaque-response cache
 *    poisoning lesson, v1→v4 war history in its sw.ts).
 *
 * skipWaiting: false + clientsClaim: true — updates activate only through the SKIP_WAITING
 * message from the update strip (ResilienceShell), never mid-browse.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: WorkerGlobalScope & typeof globalThis;

/** Bump to invalidate every runtime cache (the activate sweep below deletes old versions). */
const CACHE_VERSION = "v1";

/** The synthetic offline shell — served when a navigation has no network. Inline styles are safe
 *  here: a SW-constructed Response carries no CSP header. Colors mirror the tokens (--pg #faf9f5 /
 *  ink, dark #1a111f) — the SW has no CSS pipeline to read tokens.css from. */
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Offline — Mandalay Morning Star</title>
<style>
  /* W22d - these four hex values are PINNED to tokens.css (--pg/--tx, both themes) by
     scripts/check-theme-parity.mjs. They cannot be CSS custom properties: this shell is a string
     baked into the service worker and ships before any stylesheet exists. Two had already drifted.
     (No backticks in here - the whole shell is a TS template literal.) */
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; text-align: center;
         background: #faf9f5; color: #1b1714; font-family: ui-sans-serif, system-ui, sans-serif; }
  @media (prefers-color-scheme: dark) { body { background: #1a111f; color: #f3ecdf; } }
  main { padding: 32px 24px; max-width: 420px; }
  .glyph { font-size: 44px; }
  h1 { font-size: 22px; margin: 12px 0 4px; }
  p { margin: 6px 0; line-height: 1.5; opacity: 0.85; }
  button { margin-top: 20px; min-height: 44px; padding: 0 24px; border-radius: 999px;
           border: 1px solid currentColor; background: transparent; color: inherit;
           font-size: 15px; font-weight: 700; cursor: pointer; }
</style>
</head>
<body>
<main>
  <div class="glyph" aria-hidden="true">🫖</div>
  <h1>You look offline</h1>
  <p>Reconnect and we&rsquo;ll pick right back up. Nothing you ordered is lost.</p>
  <p lang="my">အင်တာနက် ပြတ်နေပါသည် — ပြန်ချိတ်ပြီး ဆက်လုပ်နိုင်ပါသည်။</p>
  <button onclick="location.reload()">Try again</button>
</main>
</body>
</html>`;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // manual update control — the ResilienceShell strip drives activation
  clientsClaim: true,
  navigationPreload: false, // navigations are a plain fetch below — no preload consumer
  runtimeCaching: [
    // Content-hashed immutables — CacheFirst is exactly right for hashed names (a new deploy is a
    // new URL; the expiration only bounds storage).
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: `static-${CACHE_VERSION}`,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // The image optimizer (menu photos, grocery thumbs — the offline-menu payoff). Status-200
    // ONLY: caching an opaque/error response pins a broken image until expiry (the delivery
    // repo's v2→v4 cache-poisoning lesson). Capped + purgeOnQuotaError so ~400 grocery thumbs
    // can't evict the whole origin's storage (which would take the scan queue with it).
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/image"),
      handler: new StaleWhileRevalidate({
        cacheName: `images-${CACHE_VERSION}`,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 300,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
  ],
});

// Documents: network, or the synthetic shell. NEVER a cache — see the header comment. The denylist
// keeps the SW's hands off API-ish GET navigations entirely.
serwist.registerRoute(
  new NavigationRoute(
    async ({ request }) => {
      try {
        return await fetch(request);
      } catch {
        return new Response(OFFLINE_HTML, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    },
    { denylist: [/^\/api\//, /^\/ingest\//] },
  ),
);

// Serwist only cleans the precache — runtime caches from an old CACHE_VERSION linger until swept.
(self as unknown as ServiceWorkerGlobalScope).addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      const current = `-${CACHE_VERSION}`;
      const prefixes = ["static-", "images-"];
      return Promise.all(
        names
          .filter((n) => prefixes.some((p) => n.startsWith(p) && !n.endsWith(current)))
          .map((n) => caches.delete(n)),
      );
    }),
  );
});

// The update strip's activation signal (skipWaiting is false — this is the only path).
self.addEventListener("message", (event: MessageEvent) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
  }
});

serwist.addEventListeners();
