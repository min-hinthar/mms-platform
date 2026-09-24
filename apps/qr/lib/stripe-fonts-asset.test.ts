import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STRIPE_FONT_FILE } from "./stripe-appearance";

/**
 * Phase 1c (F17) — the first-party font Stripe's iframe loads. The file is a COPY of the latin
 * variable subset next/font already ships (the build's `@font-face` whose unicode-range starts
 * `U+??`, 34,664 B), so the page and the iframe draw the same Hanken. The digest below was computed
 * in the shell (`sha256sum`) and pasted, never transcribed: any change to OUR copy — a Google
 * revision, a latin-ext face swapped in, a re-encode — is then a deliberate, reviewed edit.
 *
 * The headers are pinned by EXECUTING next.config's `headers()`, not by reading its text: a comment
 * naming the rule would satisfy a scan.
 */
const PUBLIC = join(__dirname, "..", "public");
const FONT_SHA256 = "1f21c6eaa0000f3329cfcfac966b43d5bebf5aa610303e33294ac31bc6f4bb59";

describe("Phase 1c — the Stripe iframe's font asset", () => {
  it("is the pinned latin woff2, with its OFL licence alongside", () => {
    // MUTATION: swap in the latin-ext woff2 — sha red. MUTATION: rename the file — red.
    const path = join(PUBLIC, STRIPE_FONT_FILE);
    expect(existsSync(path)).toBe(true);
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(FONT_SHA256);
    // Redistribution under OFL-1.1 requires the licence to travel with the font.
    const ofl = readFileSync(join(PUBLIC, "fonts", "OFL.txt"), "utf8");
    expect(ofl).toContain("SIL Open Font License, Version 1.1");
    expect(ofl).toContain("Hanken Grotesk");
  });

  it("is served with CORS * and an immutable cache (next.config headers(), executed)", async () => {
    // MUTATION: delete the header rule — red.
    const { default: config } = await import("../next.config");
    const rules = (await config.headers?.()) ?? [];
    const fonts = rules.filter((r) => r.source === "/fonts/:path*");
    expect(fonts).toHaveLength(1);
    const headers = Object.fromEntries(fonts[0]!.headers.map((x) => [x.key, x.value]));
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Cache-Control"]).toMatch(/\bimmutable\b/);
    expect(headers["Cache-Control"]).toMatch(/\bmax-age=31536000\b/);
    // Unconditional: a `has` on this rule would drop the header for Stripe's credential-less fetch.
    expect(fonts[0]!.has).toBeUndefined();
    // The file the iframe asks for sits under the rule's prefix.
    expect(STRIPE_FONT_FILE.startsWith("/fonts/")).toBe(true);
  });
});
