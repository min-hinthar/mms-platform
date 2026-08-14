import { describe, expect, it } from "vitest";
import { avatarGlyph, memberSinceLabel, pickFavoriteRail } from "./profile-view";

describe("memberSinceLabel", () => {
  it("formats at the restaurant's clock, not UTC", () => {
    // 2026-07-01T02:00Z is still June 30 in Los Angeles — the label must say Jun, not Jul.
    expect(memberSinceLabel("2026-07-01T02:00:00Z")).toBe("Jun 2026");
    expect(memberSinceLabel("2026-08-14T19:00:00Z")).toBe("Aug 2026");
  });

  it("returns null for absent or garbage input (no fabricated tenure)", () => {
    expect(memberSinceLabel(null)).toBeNull();
    expect(memberSinceLabel("not-a-date")).toBeNull();
  });
});

describe("avatarGlyph", () => {
  it("takes the first grapheme of the name, uppercased for latin", () => {
    expect(avatarGlyph("min kkhant", null)).toBe("M");
  });

  it("is deterministic across engines: one CODE POINT, surrogate-pair-safe (review LOW-2)", () => {
    // Burmese: the base consonant, byte-identical on server and client (no Segmenter drift).
    expect(avatarGlyph("မောင်လေး", null)).toBe("မ");
    // Emoji: Array.from keeps the surrogate pair whole — never a lone half.
    expect(avatarGlyph("🌟 Star", null)).toBe("🌟");
  });

  it("falls back to the email local part, then the brand star", () => {
    expect(avatarGlyph(null, "hla@example.com")).toBe("H");
    expect(avatarGlyph(null, null)).toBe("✦");
    expect(avatarGlyph("   ", "")).toBe("✦");
  });
});

describe("pickFavoriteRail", () => {
  const dish = (id: string, soldOut = false) => ({ id, soldOut });

  it("drops 86'd dishes, keeps the hearts' order, caps at 8", () => {
    const items = [
      dish("a"),
      dish("b", true),
      ...Array.from({ length: 9 }, (_, i) => dish(`c${i}`)),
    ];
    const rail = pickFavoriteRail(items);
    expect(rail).toHaveLength(8);
    expect(rail[0]?.id).toBe("a");
    expect(rail.some((i) => i.id === "b")).toBe(false);
    expect(rail[1]?.id).toBe("c0"); // order preserved after the filter
  });
});
