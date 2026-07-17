import type { MetadataRoute } from "next";

// W7 shell — the PWA manifest (installable "add to home screen"). Static: it's the same for every
// request, so opt out of the layout's force-dynamic and let it cache. `theme_color`/`background_color`
// MUST match the light page background `--pg` (#faf9f5, tokens.css) — the same value the `viewport`
// themeColor uses — so the splash + address bar never seam against the app on launch (audit U-Q5).
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mandalay Morning Star",
    short_name: "Morning Star",
    description: "Order at the teahouse: dine-in, to-go, or grocery.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf9f5",
    theme_color: "#faf9f5",
    // The ✦ mark scales crisply as SVG (installability accepts `sizes:"any"`). A dedicated full-bleed
    // `maskable` variant (no rounded corners — the OS mask supplies them; mark in the safe zone) so
    // Android's adaptive icon doesn't clip or double-round it.
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/icon-maskable.svg", type: "image/svg+xml", sizes: "any", purpose: "maskable" },
    ],
  };
}
