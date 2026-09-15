import { describe, expect, it } from "vitest";
import { approvalsHref, APPROVALS_ZONE, moreTiles } from "./staff-more";
import { resolveStaffHome } from "./staff-door";
import { STAFF } from "./i18n/staff";

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

/**
 * A4·5, after the blind pass — the approvals circle is the ONLY pending-void signal a manager gets
 * now that the tile is gone, so where it points is a rule, not a prop. Behind the doors the zone is
 * on another screen and the trip must not re-door the tablet; the first pushed A4·5 head dropped
 * the signal from that branch entirely, which is what these cases exist to keep out.
 */
describe("approvalsHref", () => {
  it("on the counter's screen it is the bare same-page fragment", () => {
    expect(approvalsHref("floor")).toBe("#appr-h");
  });

  it("behind the doors it travels to the zone, and carries the fragment the heading answers", () => {
    const url = new URL(approvalsHref("doors"), "https://x.test");
    expect(url.pathname).toBe("/staff");
    expect(url.searchParams.get("floor")).toBe("1");
    expect(url.hash).toBe("#appr-h");
    expect(approvalsHref("doors")).toBe(APPROVALS_ZONE);
  });

  it("the doors href shows the floor to a KITCHEN-doored tablet — a look, not a door", () => {
    // The URL alone decides, through the one resolver: `?floor=1` wins over the remembered door,
    // and nothing on this path writes the cookie (the door write lives in `StaffDoors`' click
    // handler, never in a plain link). So a manager on Mom's kitchen tablet can read a pending
    // void and still cold-start onto the board tomorrow.
    const floorParam = new URL(approvalsHref("doors"), "https://x.test").searchParams.get("floor");
    expect(
      resolveStaffHome({
        door: "kitchen",
        doorsParam: false,
        floorParam: floorParam === "1",
        coldStart: false,
      }),
    ).toEqual({ view: "floor" });
  });
});

/**
 * `MoreGrid` renders a tile as `<Chrome k={t.k} />` with NO `vars` (the one slot-bearing label,
 * `floor.nav.approvalsCount`, left the grid with A4·5). `MoreTile.k` is still the whole `StaffKey`
 * union, so a future tile carrying a slot would print a literal `{n}` at a staff member. Nothing
 * else can catch that: the type admits it and the renderer has no slot to fill.
 */
describe("every More tile label is slot-free, because MoreGrid fills no slots", () => {
  it("no key moreTiles can return carries a {slot} in either language", () => {
    for (const view of ["doors", "floor"] as const)
      for (const role of ["server", "manager", "owner"] as const)
        for (const hasPin of [true, false]) {
          for (const t of moreTiles({ view, role, hasPin })) {
            const entry = STAFF[t.k];
            expect(entry.en).not.toMatch(/\{/);
            expect(entry.my).not.toMatch(/\{/);
          }
        }
  });
});
