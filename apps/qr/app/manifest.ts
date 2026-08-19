import type { MetadataRoute } from "next";

// W7 shell → W22b — the PWA manifest (installable "add to home screen"). Explicitly static (same JSON
// every request → baked + CDN-cached); metadata routes don't inherit the root force-dynamic, this makes
// it belt-and-suspenders. `theme_color`/`background_color` MUST match the light page background `--pg`
// (#faf9f5, tokens.css) — the same value the `viewport` themeColor uses — so the splash + address bar
// never seam against the app on launch (audit U-Q5).
//
// ⚠️ KNOWN, ACCEPTED LIMITATION: `background_color` is a SINGLE value, and Android builds its launcher
// splash from it, so a diner who installed in Night mode gets a cream flash before the app paints. The
// address/status bar is already handled correctly by `viewport.themeColor`'s media pair (layout.tsx).
// Do NOT "fix" this by hardcoding the dark ground — that just moves the seam onto every light install,
// which is the larger population. Documented in docs/DESIGN-LANGUAGE.md.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // The app's IDENTITY, pinned. Without it a PWA's identity is derived from `start_url`, so any later
    // start_url change would mint a SECOND home-screen icon for everyone already installed, with no way
    // to merge them back. Cheapest permanently-safe field in the file.
    id: "/",
    name: "Mandalay Morning Star",
    short_name: "Morning Star",
    description: "Order at the teahouse: dine-in, to-go, or grocery.",
    start_url: "/",
    // Explicit rather than implicit, so a future start_url move cannot silently narrow what opens in
    // the app. Deliberately the whole origin: narrowing it would kick /staff, /kiosk and /board out to
    // the browser, which is a behaviour change, not a tidy-up.
    scope: "/",
    display: "standalone",
    // The document is lang="en" and every Burmese accent carries its own per-span lang="my" (W16b), so
    // "en" is the honest value for the OS install dialog's locale/direction rules.
    lang: "en",
    dir: "ltr",
    categories: ["food", "lifestyle", "shopping"],
    // W22b — re-scanning a table QR while the installed app is already open NAVIGATES that window
    // instead of opening a second one. Two windows would mean two live-order chips claiming the same
    // order and two realtime subscriptions on one topic. `navigate-existing`, not `focus-existing`,
    // because the QR carries a fresh `?t=<token>` the app must actually consume.
    launch_handler: { client_mode: "navigate-existing" },
    // NOTE: `orientation: "portrait"` was REMOVED in W22b. With scope "/" the lock applied to the whole
    // origin, so an installed instance opened on /board (the landscape order-number wall display) or on
    // a staff tablet was pinned to portrait. The diner surfaces are a 440px centred column, so landscape
    // costs them nothing.
    background_color: "#faf9f5",
    theme_color: "#faf9f5",
    // The ✦ mark scales crisply as SVG, but SVG only covers INSTALLABILITY — Chromium documents 192 +
    // 512 PNG as the quality baseline and Android builds its launcher splash from the ≥512 icon. The
    // rasters are generated from the one badge source by `scripts/gen-pwa-icons.mjs` (see its header:
    // public/logo.png is WebP behind a .png name and must never be the source). `maskable` is a
    // dedicated full-bleed variant with the mark inside the 80% safe zone, so Android's adaptive icon
    // doesn't clip it or double-round it.
    icons: [
      { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/icon-maskable-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/icon-maskable.svg", type: "image/svg+xml", sizes: "any", purpose: "maskable" },
    ],
    // Android's long-press jump list. The THREE DOORS only — each is a complete route with no required
    // params, matching app/page.tsx verbatim. Deliberately NO "track my order" entry: a bare /track
    // renders a stub for anyone without a live order, and a shortcut that usually leads nowhere is the
    // same broken promise as a fabricated status. iOS ignores shortcuts entirely.
    shortcuts: [
      { name: "Dine-in", short_name: "Dine-in", url: "/dine-in" },
      { name: "To-go", short_name: "To-go", url: "/menu?mode=pickup&door=togo" },
      { name: "Grocery", short_name: "Grocery", url: "/grocery" },
    ],
  };
}
