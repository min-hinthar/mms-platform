import "server-only";
import { cookies } from "next/headers";
import { STAFF_DOOR_COOKIE, parseStaffDoor, type StaffDoor } from "./staff-door";

/**
 * P7 — the ONLY `cookies().get(STAFF_DOOR_COOKIE)` in the app. `server-only` so an accidental client
 * import is a BUILD error, and one reader so the parse rule cannot fork. `scripts/check-staff-lang.mjs`
 * holds this module to the same two guards as the language reader: unreachable from every non-staff
 * route root, and the cookie's name literal in exactly one file.
 */
export async function readStaffDoor(): Promise<StaffDoor | null> {
  return parseStaffDoor((await cookies()).get(STAFF_DOOR_COOKIE)?.value);
}
