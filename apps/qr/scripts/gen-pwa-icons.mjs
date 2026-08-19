#!/usr/bin/env node
/**
 * W22b — generates the RASTER PWA icons committed under `apps/qr/public/`.
 *
 * Why rasters at all, when the manifest already ships two SVGs at `sizes: "any"`: SVG covers
 * *installability*, not install *quality*. Chromium documents 192 + 512 PNG as the safe baseline, and
 * Android builds the launcher splash from the >=512 icon. This closes the icon half of OPEN-ITEMS S4.
 *
 * Why generated rather than hand-exported: there is no image toolchain in this repo (no sharp, no
 * ImageMagick, no PIL) — but `next/og` is already a dependency and `app/apple-icon.tsx` already uses it
 * to emit a real PNG through the very same badge source. This script is that pattern in a shell, so
 * every icon in the app descends from ONE piece of art with one set of colours.
 *
 * ⚠️ The source is `app/_og/logo.ts` (`logoPng`), NOT `public/logo.png`. `logo.png` is WebP bytes
 * behind a .png name (`file(1)`: "RIFF (little-endian) data, Web/P image") — Satori cannot decode it,
 * and a WebP-in-.png manifest icon is rejected by Android launchers and every iOS touch-icon path
 * while passing lint, typecheck and build in silence. `app/manifest.test.ts` asserts the magic bytes
 * of what this script produced, so that trap cannot be re-set by hand.
 *
 * Regenerate:  node apps/qr/scripts/gen-pwa-icons.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { ImageResponse } = await import(require.resolve("next/og"));

// The badge, as a base64 PNG data URI — the single art source shared with the OG card + apple icon.
const { logoPng } = await import(join(appRoot, "app/_og/logo.ts"));

// The dark field the badge is drawn on. Deliberately the SAME espresso as `apple-icon.tsx` so the
// installed icon matches across platforms; it is NOT the app's page ground (a launcher icon sits on
// the user's wallpaper, not on our canvas, so it needs its own solid field).
const FIELD = "#1b1714";
// The badge is 400x250 (a 1.6:1 letterbox), so the drawn width sets the height.
const RATIO = 250 / 400;

/**
 * @param size    output square, in px
 * @param inset   fraction of the square the badge's WIDTH may occupy
 */
function icon(size, inset) {
  const w = Math.round(size * inset);
  return {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: FIELD,
      },
      children: {
        type: "img",
        props: { width: w, height: Math.round(w * RATIO), src: logoPng, alt: "" },
      },
    },
  };
}

const OUT = [
  // `purpose: "any"` — drawn as-is. A modest inset keeps the mark off the very edge on launchers
  // that do not mask.
  { file: "icon-192.png", size: 192, inset: 0.78 },
  { file: "icon-512.png", size: 512, inset: 0.78 },
  // `purpose: "maskable"` — the OS crops to its own shape (a circle on many Android launchers), so
  // the mark must sit inside the 80% SAFE ZONE. 0.56 of the width leaves the badge comfortably inside
  // a circle inscribed in the square; the field bleeds to the edge so no transparent corner shows.
  { file: "icon-maskable-512.png", size: 512, inset: 0.56 },
];

for (const { file, size, inset } of OUT) {
  const res = new ImageResponse(icon(size, inset), { width: size, height: size });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString("hex") !== "89504e47")
    throw new Error(`${file}: not a PNG — the badge source is probably WebP again`);
  writeFileSync(join(appRoot, "public", file), buf);
  console.log(`  ${file}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)}KB`);
}
console.log("pwa icons — written");
