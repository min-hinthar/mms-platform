import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest";

/**
 * W22b — the manifest is a plain function, so it can be asserted like any other derivation.
 *
 * The load-bearing assertion is the MAGIC BYTES one. `apps/qr/public/logo.png` is WebP bytes behind a
 * .png name (`file(1)`: "RIFF (little-endian) data, Web/P image"), which is why `app/_og/logo.ts`
 * exists at all — Satori cannot decode WebP. Nothing else in this toolchain would notice a manifest
 * icon sourced from it: lint, typecheck and build all pass, and the failure only shows up as a blank
 * icon on a diner's home screen, in a launcher, after install.
 */
// `fileURLToPath(import.meta.url)` rather than `import.meta.dirname`: the latter landed in Node
// 20.11 and this repo's declared engine floor is `node >=20`.
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const m = manifest();

describe("the PWA manifest", () => {
  it("pins the app identity to start_url, so a later move cannot split an existing install", () => {
    expect(m.id).toBe("/");
    expect(m.id).toBe(m.start_url);
  });

  it("scopes to the whole origin — /staff, /kiosk and /board must stay inside the installed app", () => {
    expect(m.scope).toBe("/");
  });

  it("keeps the splash and address bar seamless against the light page ground", () => {
    // READ the token rather than transcribe it. A hardcoded "#faf9f5" here would let someone change
    // `--pg` in tokens.css, re-open the seam audit U-Q5 killed, and keep this suite green — the same
    // stale-fixture trap the delivery repo's contrast audit documented.
    const tokens = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "..",
        "packages",
        "ui",
        "src",
        "tokens.css",
      ),
      "utf8",
    );
    // The LIGHT ground: the first `--pg:` declaration, before the `.dark` block redefines it.
    const pg = /--pg:\s*([^;]+);/.exec(tokens)?.[1]?.trim();
    expect(pg, "could not read --pg from tokens.css").toBeTruthy();
    expect(m.background_color).toBe(pg);
    expect(m.theme_color).toBe(pg);
  });

  it("does NOT lock orientation — the wall board and staff tablets share this scope", () => {
    expect(m.orientation).toBeUndefined();
  });

  it("ships the raster baseline Chromium documents, not SVG alone", () => {
    const png = (m.icons ?? []).filter((i) => i.type === "image/png");
    expect(png.map((i) => i.sizes).sort()).toEqual(["192x192", "512x512", "512x512"]);
    // Android builds its launcher splash from the ≥512 icon, and needs a maskable variant so the
    // adaptive mask does not clip the mark.
    expect(png.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
    expect(png.some((i) => i.purpose === "any" && i.sizes === "512x512")).toBe(true);
  });

  it("points every icon at a file that EXISTS, and every PNG at REAL PNG bytes", () => {
    const icons = m.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const file = join(PUBLIC, icon.src!.replace(/^\//, ""));
      expect(existsSync(file), `${icon.src} is missing from public/`).toBe(true);
      if (icon.type !== "image/png") continue;
      const head = readFileSync(file).subarray(0, 4).toString("hex");
      // 89 50 4E 47 — the PNG signature. WebP would read "52494646" (RIFF).
      expect(head, `${icon.src} is not a PNG (WebP reads 52494646)`).toBe("89504e47");
    }
  });

  it("offers only the three doors as shortcuts, never a bare /track", () => {
    const urls = (m.shortcuts ?? []).map((s) => s.url);
    expect(urls).toEqual(["/dine-in", "/menu?mode=pickup&door=togo", "/grocery"]);
    // A bare /track renders a stub for anyone without a live order — a shortcut that usually leads
    // nowhere is the same broken promise as a fabricated status.
    expect(urls.some((u) => u.startsWith("/track"))).toBe(false);
  });

  it("declares the locale the document actually uses", () => {
    expect(m.lang).toBe("en");
    expect(m.dir).toBe("ltr");
  });
});
