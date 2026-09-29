import "server-only";
import { cookies } from "next/headers";
import {
  STAFF_LANG_COOKIE,
  parseStaffLang,
  parseStaffLangMode,
  resolveBoardLang,
  type StaffLang,
  type StaffLangMode,
} from "./staff-lang";

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

/**
 * `/board`'s language: the TV's bookmark (`?lang=`) first, then this device's cookie, then Burmese.
 *
 * It lives HERE, beside `readStaffLang`, so the claim in this module's docblock stays literally
 * true — one `cookies().get` of this name in the whole app. Putting the read inline in
 * `app/board/page.tsx` would have worked and would have quietly made that sentence false, which is
 * how a one-reader invariant stops being one.
 */
export async function readBoardLang(query: string | undefined): Promise<StaffLang> {
  return resolveBoardLang(query, (await cookies()).get(STAFF_LANG_COOKIE)?.value);
}

/**
 * P2e — the device's MODE (Burmese only · Both · English), for `app/staff/layout.tsx`, which hands
 * the provider its script and whether the chrome draws English echoes. Same one read of the same
 * cookie as `readStaffLang` (Next memoizes `cookies()`); the parse is `parseStaffLangMode`'s exact
 * three literals, so `scriptOf(readStaffLangMode())` always equals `readStaffLang()`.
 */
export async function readStaffLangMode(): Promise<StaffLangMode> {
  return parseStaffLangMode((await cookies()).get(STAFF_LANG_COOKIE)?.value);
}
