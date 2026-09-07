import { staffLangCookieOptions } from "./staff-lang";

/**
 * P7 — the STAFF-DEVICE door carrier. Pure: no `server-only`, no `cookies()`, no React, so the
 * Server Action, the server reader, the doors component and the tests all share ONE parser and ONE
 * resolver.
 *
 * WHAT A DOOR IS. The pilot has two tablets and two jobs: Mom on the kitchen board, Dad at the
 * counter. `/staff` used to open on a wrapping row of thirteen 13px text pills for everyone; now it
 * opens on TWO doors, and the tablet REMEMBERS which one it walked through, so day 2 opens straight
 * on the board with nothing to tap. The same per-device / not-per-person reasoning as the language
 * cookie (`staff-lang.ts`): a per-staff-row preference would flip the kitchen tablet's door every
 * time someone else unlocked it with their PIN.
 *
 * THE DOOR CARRIES NO AUTHORITY. It decides which of two staff pages a tablet lands on; every page
 * behind it still runs `requireStaffPage`. So the writer is ungated like `setStaffLang`, the parser
 * refuses anything but the two exact values, and an absent or garbage cookie is the DOORS screen —
 * the safe direction, because it asks rather than assumes.
 */

export type StaffDoor = "kitchen" | "counter";

/** The cookie name. `mms_` is the cookie convention; `mms.` the storage one (`mms.kds.station`). */
export const STAFF_DOOR_COOKIE = "mms_staff_door";

/**
 * Where each door leads. The counter door is the floor, asked for BY NAME: `resolveStaffHome`
 * honours `?floor=1` whatever the cookie says, so the door opens the floor with JavaScript off and
 * on a device whose cookie write was refused. A bare `/staff` here rendered the floor only once the
 * cookie existed, and a refused Counter tap landed back on the doors (blind pass CRITICAL 2).
 */
export const STAFF_DOOR_TARGET: Record<StaffDoor, "/staff/kitchen" | "/staff?floor=1"> = {
  kitchen: "/staff/kitchen",
  counter: "/staff?floor=1",
};

/**
 * The ONE parser. EXACT equality — never a prefix, a case-fold or a trim. A cookie jar carries
 * whatever a previous build or a hand-edit left behind; anything that is not exactly one of the two
 * doors is NO door, which renders the doors screen.
 */
export function parseStaffDoor(value: string | undefined): StaffDoor | null {
  return value === "kitchen" || value === "counter" ? value : null;
}

/** Same options as the language cookie, deliberately: `path: "/"`, httpOnly, 400 days. */
export function staffDoorCookieOptions() {
  return staffLangCookieOptions();
}

export type StaffHome = { view: "doors" } | { view: "floor" } | { redirect: "/staff/kitchen" };

/**
 * What `/staff` shows, decided from four facts, in this order of authority:
 *
 *   `doorsParam` — the request carried `?doors=1`, the explicit "show me the map" the Screens chip
 *                  sends. It wins over everything, so a remembered door can never trap a tablet.
 *   `floorParam` — the request carried `?floor=1`, the Counter door's own href: a person tapped
 *                  Counter, so the floor — whatever the cookie says, and whether or not it could be
 *                  written. Beats the cold-start redirect for the same reason.
 *   `door`       — this device's remembered door (null = never chosen, or garbage).
 *   `coldStart`  — the request is a START (see `isColdStart`): the app icon, a bookmark, a typed
 *                  URL, or the lock / login handing the tablet back. That is the ONLY time a kitchen
 *                  device is redirected onto its board. An in-app tap that lands on `/staff` (an
 *                  "← Floor" link from the expo page) is a navigation the person made on purpose,
 *                  and on a kitchen device it shows the doors — a tablet with no floor has nowhere
 *                  else honest to send them.
 *
 * A counter device's `/staff` is the floor either way: that IS its door. No cookie is the doors.
 */
export function resolveStaffHome(input: {
  door: StaffDoor | null;
  doorsParam: boolean;
  floorParam: boolean;
  coldStart: boolean;
}): StaffHome {
  if (input.doorsParam) return { view: "doors" };
  if (input.floorParam) return { view: "floor" };
  if (input.door === "kitchen")
    return input.coldStart ? { redirect: "/staff/kitchen" } : { view: "doors" };
  if (input.door === "counter") return { view: "floor" };
  return { view: "doors" };
}

/**
 * The console's FRONT DOORS: pages a tablet passes through on its way IN, not pages it browses
 * between. `PinUnlock` does `router.replace("/staff")` after the PIN; the login lands on `/staff`
 * by default (`safe-next.ts` `DEFAULT_NEXT`); the auth callback redirects there. All three are
 * same-origin client navigations, and a locked or signed-out kitchen tablet begins every day with
 * one of them — so reading them as warm sent Mom to the doors on exactly the mornings the redirect
 * exists for (blind pass CRITICAL 4). The two pages match EXACTLY; the auth callback is a prefix
 * (its route carries a code and may grow siblings).
 */
export const STAFF_FRONT_DOORS = ["/staff/lock", "/staff/login", "/staff/auth/"] as const;

function isFrontDoor(pathname: string): boolean {
  return STAFF_FRONT_DOORS.some((d) => (d.endsWith("/") ? pathname.startsWith(d) : pathname === d));
}

/**
 * Cold start = no same-origin referer, OR a same-origin referer from a front door. A referer is
 * absent on an app-icon launch, a bookmark and a typed URL; it is present (and same-origin) on
 * every in-app link. A referer from another host — or one that does not parse — counts as cold,
 * because the person did not get here from inside the console. `host` is the request's own host
 * header (`Host` or `x-forwarded-host`), compared case-insensitively; a missing host cannot be
 * matched, so it is cold too.
 *
 * `x-forwarded-host` is a LIST behind more than one proxy (`a, b`), and `new URL("https://a, b")`
 * throws — which would read as cold and redirect every in-app arrival on a kitchen tablet. The
 * header is read by its first value, the client-facing host.
 */
export function isColdStart(referer: string | null, host: string | null): boolean {
  if (!referer || !host) return true;
  const first = host.split(",")[0]?.trim() ?? "";
  let from: URL;
  let own: URL;
  try {
    from = new URL(referer);
    // The Host header is compared through the SAME parser, so a default port on either side
    // (`mms.example:443`) normalizes away identically instead of failing an equality it should pass.
    own = new URL(`https://${first}`);
  } catch {
    return true;
  }
  if (from.host.toLowerCase() !== own.host.toLowerCase()) return true;
  return isFrontDoor(from.pathname);
}
