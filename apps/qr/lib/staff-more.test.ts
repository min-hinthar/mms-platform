import { describe, expect, it } from "vitest";
import { moreTiles } from "./staff-more";

/**
 * A4·5 — the More list is three tiles behind the doors and four on the counter's screen, in a
 * fixed order, and role only ever changes a label. Pinned as VALUES (the whole list, not a count)
 * so a tile that quietly returns — a manager-only approvals row, a feedback row — is a failing
 * assertion and not a "nice extra".
 */
const hrefs = (tiles: ReturnType<typeof moreTiles>) => tiles.map((t) => t.href);

describe("moreTiles", () => {
  it("behind the doors: exactly Menu · Tips · Sign-in, in that order, for every role", () => {
    for (const role of ["server", "manager", "owner"] as const) {
      expect(hrefs(moreTiles({ view: "doors", role, hasPin: true }))).toEqual([
        "/staff/menu",
        "/staff/tips",
        "/staff/login",
      ]);
    }
  });

  it("on the counter's screen: the kitchen board FIRST, as a plain link, then the same three", () => {
    expect(hrefs(moreTiles({ view: "floor", role: "manager", hasPin: false }))).toEqual([
      "/staff/kitchen",
      "/staff/menu",
      "/staff/tips",
      "/staff/login",
    ]);
    expect(moreTiles({ view: "floor", role: "server", hasPin: false })[0]).toEqual({
      href: "/staff/kitchen",
      k: "floor.nav.kitchen",
      icon: "flame",
    });
  });

  it("role changes the Menu tile's LABEL, never the tile: prices for a manager, availability for a server", () => {
    const label = (role: "server" | "manager" | "owner") =>
      moreTiles({ view: "doors", role, hasPin: true }).find((t) => t.href === "/staff/menu")!.k;
    expect(label("server")).toBe("floor.nav.menuAvailability");
    expect(label("manager")).toBe("floor.nav.menuPrices");
    expect(label("owner")).toBe("floor.nav.menuPrices");
  });

  it("the Sign-in tile says what the tap does: set a PIN when there is none, your PIN when there is", () => {
    const label = (hasPin: boolean) =>
      moreTiles({ view: "doors", role: "server", hasPin }).find((t) => t.href === "/staff/login")!
        .k;
    expect(label(false)).toBe("floor.nav.pinSet");
    expect(label(true)).toBe("floor.nav.pin");
  });

  it("every tile is a real in-app link with a glyph — nothing external, nothing bare", () => {
    for (const view of ["doors", "floor"] as const) {
      for (const t of moreTiles({ view, role: "owner", hasPin: true })) {
        expect(t.href.startsWith("/staff")).toBe(true);
        expect(t.icon.length).toBeGreaterThan(0);
      }
    }
  });
});
