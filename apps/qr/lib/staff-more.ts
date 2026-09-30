import type { IconName } from "@mms/ui";
import type { StaffKey } from "@/lib/i18n/staff";
import { roleAtLeast, type StaffRole } from "@/lib/staff-roles";

/**
 * One row of the More list — a real link, named by a dictionary key, with a glyph. `both` (P2e):
 * the label renders in BOTH scripts on every device, whatever its mode — the language tile only.
 */
export type MoreTile = { href: string; k: StaffKey; icon: IconName; both?: true };

/**
 * P2e — where the doors' Language tile lands: the Profile's language card, focused on the pressed
 * mode. A QUERY PARAM, never a `#hash` (§26): `/staff/login` has a `loading.tsx`, and a fragment
 * landing behind a streamed boundary scrolls to nothing.
 */
export const STAFF_LANG_HREF = "/staff/login?show=lang";

/** The language tile — last in both views; its label is both scripts on every device. */
const LANGUAGE_TILE: MoreTile = {
  href: STAFF_LANG_HREF,
  k: "shell.lang.row",
  icon: "language",
  both: true,
};

/**
 * A4·5 — the More list, stated ONCE for both surfaces that render it (the doors and the counter's
 * one screen).
 *
 * Behind the doors sit Menu · Tips · Sign-in — the three of the five screens that are not a door
 * (Kitchen and Counter & tables ARE the doors above) — then, since P2e, Language LAST: the way back
 * to the device's language from every screen that has no Help door, labelled in both scripts on
 * every device (the tips, menu, glossary and table screens reach the doors in one tap, the wordless
 * Screens circle, or through a Back pill to the counter, which has Help). The count is measured by
 * the suite, not stated here. The counter's screen keeps a
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
 * are zones of those screens now, reached through them — the Tips and Sign-in tiles for the last
 * two, and for the first two the bar's approvals circle, which rides BOTH bars and behind the doors
 * carries `approvalsHref`'s `?floor=1#appr-h`. Never the Counter DOOR: it is the one way onto the
 * counter's screen — where both manager zones live — that does not re-door the tablet.
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
    ? [{ href: "/staff/kitchen", k: "floor.nav.kitchen", icon: "flame" }, ...three, LANGUAGE_TILE]
    : [...three, LANGUAGE_TILE];
}

/**
 * The approvals zone as a URL, for a surface that is NOT already showing it.
 *
 * `?floor=1` is the Counter door's own href and `resolveStaffHome` honours it WITHOUT writing the
 * door cookie (`lib/staff-door.ts` — "a person tapped Counter, so the floor — whatever the cookie
 * says"). That is the whole point of the constant: from the doors, a manager must be able to LOOK
 * at a pending void without the tablet remembering the trip. Walking through the Counter door to
 * reach it would re-door a kitchen tablet as a counter one — the same "a door remembers itself"
 * trap this module's `moreTiles` docblock refuses for the board, in the other direction.
 */
export const APPROVALS_ZONE = "/staff?floor=1#appr-h";

/**
 * Where the bar's approvals circle points, by the screen it is sitting on.
 *
 * On the counter's screen the zone is on THIS page, so the href is the bare fragment: a same-page
 * jump, which the zone's heading answers on `hashchange` (A4·3). Behind the doors the zone is not
 * rendered at all, so the circle has to travel — to the floor view, by the one URL that shows it
 * without committing the device.
 */
export function approvalsHref(view: "doors" | "floor"): string {
  return view === "floor" ? "#appr-h" : APPROVALS_ZONE;
}

// ── Phase 2f · P2v ──
/**
 * The takeaway lane — a zone of the counter's one screen (`ExpoBoard`'s `<h2 id="expo-h">`), not a
 * door of its own (`/staff/expo` is a redirect to `/staff?floor=1`). The HandoffCard's "Takeaway
 * bags" link after a pay-at-pickup settle lands there.
 */
export const LANE_ZONE = "/staff?floor=1#expo-h";

/**
 * Where the lane link goes: on the counter screen's split pane the lane is already on the page, so a
 * bare fragment scrolls to it without leaving; anywhere else the full zone URL. Render it as a NATIVE
 * `<a>` — never `next/link`, whose client navigation does not re-scroll a same-page hash (A4·3).
 */
export function laneHref(inPane: boolean): string {
  return inPane ? "#expo-h" : LANE_ZONE;
}
