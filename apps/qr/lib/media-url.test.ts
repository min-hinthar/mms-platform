import { describe, expect, it } from "vitest";
import { safeImageUrl } from "./media-url";

/**
 * W13 — the image-URL containment guard, pinned. next/image THROWS at render on a host outside
 * next.config.ts's allowlist, so one bad DB row must degrade to the placeholder (null), never
 * crash a surface. The boundary: site-relative, or https on a *.supabase.co host — nothing else.
 */
describe("safeImageUrl — the containment boundary", () => {
  it("passes site-relative paths and supabase.co hosts (either project)", () => {
    expect(safeImageUrl("/images/mohinga.jpg")).toBe("/images/mohinga.jpg");
    expect(safeImageUrl("https://fasnpdhtvqtzjlvruqcu.supabase.co/storage/v1/x.jpg")).toContain(
      "supabase.co",
    );
    expect(safeImageUrl("https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/x.jpg")).toContain(
      "supabase.co",
    );
  });
  it("refuses everything else — http, data:, protocol-relative, foreign + lookalike hosts", () => {
    expect(safeImageUrl("http://fasnpdhtvqtzjlvruqcu.supabase.co/x.jpg")).toBeNull(); // no TLS
    expect(safeImageUrl("data:image/svg+xml,<svg/>")).toBeNull();
    expect(safeImageUrl("//evil.example/x.jpg")).toBeNull();
    expect(safeImageUrl("https://evil.example/x.jpg")).toBeNull();
    expect(safeImageUrl("https://supabase.co.evil.example/x.jpg")).toBeNull(); // lookalike
    expect(safeImageUrl("https://xsupabase.com/x.jpg")).toBeNull();
  });
  it("null/undefined/empty degrade to the placeholder, never a crash", () => {
    expect(safeImageUrl(null)).toBeNull();
    expect(safeImageUrl(undefined)).toBeNull();
    expect(safeImageUrl("")).toBeNull();
  });
});

/**
 * W16d — the filename is NOT a verdict on the photo. W13 added a `fallback.jpg → null` filter on
 * the assumption those rows shared one generic stock image; probing the live bucket disproved it
 * (every `menu-photos/<id>/fallback.jpg` is a distinct real photo of that dish, and the `photo.jpg`
 * some rows were assumed to have 404s). These cases are the inversion of the tests that pinned the
 * old rule: a contained fallback.jpg must PASS THROUGH, or ~28 dishes lose their photography again
 * on every diner surface at once.
 */
describe("safeImageUrl — a fallback.jpg row is a real photo, not a stand-in (W16d)", () => {
  it("passes a contained fallback.jpg through — the filename means nothing", () => {
    const url = "https://ukuzkhuppqwtrdkjqrkv.supabase.co/x/menu-photos/a/fallback.jpg";
    expect(safeImageUrl(url)).toBe(url);
  });

  it("still refuses an UNCONTAINED fallback.jpg — containment outranks the filename either way", () => {
    expect(safeImageUrl("https://evil.example/fallback.jpg")).toBeNull();
  });

  it("a row with no photo at all still degrades to the designed placeholder", () => {
    // This is the honest signal the filter was impersonating: NULL means "no photography yet".
    expect(safeImageUrl(null)).toBeNull();
  });
});
