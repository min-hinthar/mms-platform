import { describe, expect, it } from "vitest";
import { displayImageUrl, safeImageUrl } from "./media-url";

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

describe("displayImageUrl — the designed placeholder beats the stock stand-in", () => {
  it("nulls fallback.jpg rows (contained hosts included) so PhotoPlaceholder renders", () => {
    expect(
      displayImageUrl("https://ukuzkhuppqwtrdkjqrkv.supabase.co/x/menu-photos/a/fallback.jpg"),
    ).toBeNull();
  });
  it("passes real photos and still refuses uncontained hosts", () => {
    expect(displayImageUrl("https://ukuzkhuppqwtrdkjqrkv.supabase.co/x/a/photo.jpg")).toContain(
      "photo.jpg",
    );
    expect(displayImageUrl("https://evil.example/fallback.jpg")).toBeNull();
    expect(displayImageUrl(null)).toBeNull();
  });
});
