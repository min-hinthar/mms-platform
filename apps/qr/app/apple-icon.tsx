import { ImageResponse } from "next/og";

// W7 shell — the iOS/iPadOS home-screen icon (apple-touch-icon). Without it, "Add to Home Screen"
// grabs a screenshot; with it, the ✦ mark. iOS ignores SVG for touch icons, so this is generated as a
// real PNG (the SVG favicon/manifest still cover every other surface). iOS rounds the corners itself, so
// the field is full-bleed with the mark centered inside a safe margin.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
// Explicitly static — baked once at build, CDN-served (never per-request).
export const dynamic = "force-static";

// The ✦ mark, gold on the brand-dark field (matches public/icon.svg). Inlined as a data-URI so Satori
// rasterizes it — the center "hole" is the dark field so the star reads as a cut four-point star.
const STAR = `<svg xmlns="http://www.w3.org/2000/svg" width="132" height="132" viewBox="0 0 64 64"><path d="M32 8 C34 21, 43 30, 56 32 C43 34, 34 43, 32 56 C30 43, 21 34, 8 32 C21 30, 30 21, 32 8 Z" fill="#e8a83c"/><circle cx="32" cy="32" r="3.4" fill="#1b1714"/></svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1b1714",
      }}
    >
      <img
        width={132}
        height={132}
        src={`data:image/svg+xml;utf8,${encodeURIComponent(STAR)}`}
        alt=""
      />
    </div>,
    size,
  );
}
