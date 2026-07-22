import { ImageResponse } from "next/og";
import { logoPng } from "./_og/logo";

// W7 shell → W5c·r3 — the iOS/iPadOS home-screen icon (apple-touch-icon). Without it, "Add to Home
// Screen" grabs a screenshot; with it, the official Morning Star badge. iOS ignores SVG for touch icons,
// so this is generated as a real PNG (the SVG favicon/manifest still cover every other surface). iOS
// rounds the corners itself, so the field is full-bleed with the badge centered inside a safe margin.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
// Explicitly static — baked once at build, CDN-served (never per-request).
export const dynamic = "force-static";

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
      {/* 400×250 badge PNG at 150×94 — inside the corner-rounding safe margin on the dark field. */}
      <img width={150} height={94} src={logoPng} alt="" />
    </div>,
    size,
  );
}
