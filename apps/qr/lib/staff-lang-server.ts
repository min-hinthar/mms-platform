import "server-only";
import { cookies } from "next/headers";
import { STAFF_LANG_COOKIE, parseStaffLang, type StaffLang } from "./staff-lang";

/**
 * P2 — the ONLY `cookies().get(STAFF_LANG_COOKIE)` in the app.
 *
 * `server-only` so an accidental import from a client component is a BUILD error rather than a
 * runtime surprise, and one reader so the parse rule cannot fork. `scripts/check-staff-lang.mjs`
 * proves two things in the CI fast lane: this module is unreachable from every non-staff route root
 * (transitively, through any number of hops), and the cookie's name literal appears in exactly one
 * file — the second guard catches the evasion the first cannot, an inline
 * `cookies().get("mms_staff_lang")` written in a diner server component with no import to walk.
 *
 * Next request-memoizes `cookies()`, so calling this in a layout and again in a nested server
 * component costs one read.
 */
export async function readStaffLang(): Promise<StaffLang> {
  return parseStaffLang((await cookies()).get(STAFF_LANG_COOKIE)?.value);
}
