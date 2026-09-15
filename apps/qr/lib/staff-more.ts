import type { IconName } from "@mms/ui";
import type { StaffKey } from "@/lib/i18n/staff";
import { roleAtLeast, type StaffRole } from "@/lib/staff-roles";

/** One row of the More list — a real link, named by a dictionary key, with a glyph. */
export type MoreTile = { href: string; k: StaffKey; icon: IconName };

/**
 * A4·5 — the More list, stated ONCE for both surfaces that render it (the doors and the counter's
 * one screen).
 *
 * Behind the doors sit THREE tiles — Menu · Tips · Sign-in — the three of the five screens that
 * are not a door (Kitchen and Counter & tables ARE the doors above). The counter's screen keeps a
 * fourth, first: the kitchen board as a plain LINK, because a manager on the counter tablet peeking
 * at the board must not walk through the Kitchen DOOR — a door remembers itself and would re-door
 * the counter tablet as a kitchen one (the P7 blind pass's CRITICAL 3). A tile is a look; a door is
 * a decision. The doors' own list has no kitchen tile: the door is right above it.
 *
 * Role changes a LABEL, never a tile: every tile leads to a screen the whole team can open. Menu
 * shows a server availability and a manager prices (the page renders its editor per control);
 * Tips shows a server their own line and a manager everyone's, with the guest feedback zone
 * beneath; Sign-in shows every signed-in person their own card, and a manager the roster beneath
 * it. What used to be the manager-only tiles (approvals · settled today · feedback · the roster)
 * are zones of those screens now, reached through them — the bar's approvals circle and the
 * Counter door for the first two, the Tips and Sign-in tiles for the last two.
 */
export function moreTiles(input: {
  view: "doors" | "floor";
  role: StaffRole;
  hasPin: boolean;
}): MoreTile[] {
  const three: MoreTile[] = [
    {
      href: "/staff/menu",
      k: roleAtLeast(input.role, "manager") ? "floor.nav.menuPrices" : "floor.nav.menuAvailability",
      icon: "cat-dish",
    },
    { href: "/staff/tips", k: "floor.nav.tips", icon: "gift" },
    { href: "/staff/login", k: input.hasPin ? "floor.nav.pin" : "floor.nav.pinSet", icon: "lock" },
  ];
  return input.view === "floor"
    ? [{ href: "/staff/kitchen", k: "floor.nav.kitchen", icon: "flame" }, ...three]
    : three;
}
