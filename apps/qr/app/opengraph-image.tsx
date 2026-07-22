import { ImageResponse } from "next/og";
import { fraunces600, fraunces900 } from "./_og/fonts";
import { logoPng } from "./_og/logo";

// W7 shell — the social share card (Open Graph; twitter-image.tsx re-exports this for the Twitter card).
// A wordmark lockup on paper cream: the ✦ mark over "Mandalay Morning Star" in the brand serif (Fraunces,
// bundled as a subset woff), a gold hairline, and the honest tagline. `force-static` (below) renders the
// PNG ONCE at build, so the font is never fetched at request time.
export const alt = "Mandalay Morning Star — order at the teahouse";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Explicitly static — the woff is read + Satori renders the PNG ONCE at build; the baked bytes are
// CDN-served, never re-rendered per crawler hit (and never inherit the root layout's force-dynamic).
export const dynamic = "force-static";


export default function OpengraphImage() {
  // Palette mirrors tokens.css (Satori can't resolve CSS vars, so these are literal): #faf9f5=--pg ·
  // #1b1714=--tx (ink) · #e8a83c=--gold · #a65f10=--ac · #6e6358=--t2. Keep in sync if the tokens change.
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#faf9f5",
        color: "#1b1714",
        position: "relative",
      }}
    >
      {/* Soft gold bloom, top-right — a whisper of the brand texture, never a hard shape. */}
      <div
        style={{
          position: "absolute",
          top: -240,
          right: -180,
          width: 680,
          height: 680,
          borderRadius: 999,
          background: "radial-gradient(circle, rgba(232,168,60,0.20), rgba(232,168,60,0))",
        }}
      />
      {/* W5c·r3: the official Morning Star badge leads the card (was the ✦ mark). */}
      <img width={288} height={180} src={logoPng} alt="" style={{ marginBottom: 18 }} />
      <div
        style={{
          fontFamily: "Fraunces",
          fontWeight: 900,
          fontSize: 84,
          letterSpacing: -1.5,
          lineHeight: 1.02,
          textAlign: "center",
          padding: "0 48px",
        }}
      >
        Mandalay Morning Star
      </div>
      <div
        style={{
          width: 88,
          height: 4,
          borderRadius: 2,
          background: "#a65f10",
          margin: "30px 0 24px",
        }}
      />
      <div
        style={{
          fontFamily: "Fraunces",
          fontWeight: 600,
          fontSize: 34,
          color: "#6e6358",
          textAlign: "center",
        }}
      >
        Order at the teahouse: dine-in, to-go, or grocery.
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Fraunces", data: fraunces600, weight: 600, style: "normal" },
        { name: "Fraunces", data: fraunces900, weight: 900, style: "normal" },
      ],
    },
  );
}
