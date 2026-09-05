/**
 * P2 — the STAFF-DEVICE locale carrier. Pure: no `server-only`, no `cookies()`, no React, so the
 * Server Action, the server reader, the client provider and the tests all share ONE parser.
 *
 * WHY A DEVICE COOKIE AND NOT THE RETIRED W5 TOGGLE. W16b (owner directive) settled that the DINER
 * app is always bilingual with EN as the document language, and retired the app-wide locale cookie
 * (`proxy.ts`: stale `mms_locale` values "are inert; nothing reads them"). None of that is reopened
 * here. This cookie is a different thing with a different scope: the STAFF console's chrome — the
 * kitchen tablet, the counter tablet, the wall TV — where one person reads the same forty words a
 * hundred times a night and the app should speak their language without asking twice. It is read on
 * `/staff/*` and `/board` ONLY, proven by two guards in the CI fast lane (an import-graph walk and a
 * literal-uniqueness check), never by a diner route.
 *
 * PER DEVICE, NOT PER PERSON. `mms_profiles.locale` is a dead column (lib/rewards.ts) and stays dead:
 * a per-staff-row preference would flip the kitchen tablet's language every time someone else
 * unlocked it with their PIN. The tablet is set once and keeps its language.
 *
 * DEFAULT MY. The pilot's primary readers are Burmese-first, so an absent cookie is Burmese, not
 * English — nobody has to find the control to be understood, only to leave it.
 */

export type StaffLang = "en" | "my";

/** The cookie name. Cookies use `mms_` here; `mms.` is the STORAGE convention (`mms.kds.station`). */
export const STAFF_LANG_COOKIE = "mms_staff_lang";

export const STAFF_LANG_DEFAULT: StaffLang = "my";

/**
 * The ONE parser. EXACT equality against `"en"` — never a prefix, a case-fold or a trim.
 *
 * A cookie jar is not a trusted input: it carries whatever a previous build, a QA session or a
 * hand-edit left behind, including the retired `mms_locale` values. Anything that is not exactly
 * `"en"` is Burmese, which is also the safe direction — the failure mode of a lax parse is a staff
 * console that silently reverts to English for the people who need Burmese most.
 */
export function parseStaffLang(value: string | undefined): StaffLang {
  return value === "en" ? "en" : STAFF_LANG_DEFAULT;
}

/**
 * `/board`'s resolution: an explicit `?lang=` on the TV's bookmark wins, then the cookie, then MY.
 *
 * The wall TV is the device most likely to lose a cookie (a smart-TV browser cleared between shifts,
 * a kiosk profile that resets), and its bookmark already carries `?k=<device token>` — so the same
 * bookmark is where the language belongs. A garbage query value falls through to the cookie rather
 * than to the default, so a typo in the URL cannot silently override a device that was set up
 * correctly.
 */
export function resolveBoardLang(
  query: string | undefined,
  cookieValue: string | undefined,
): StaffLang {
  if (query === "en" || query === "my") return query;
  return parseStaffLang(cookieValue);
}

/**
 * `path: "/"` — NOT `/staff`. The neighbouring lock cookie is `path: "/staff"`
 * (`lib/staff-pin-actions.ts`) and copying that instinct would silently starve `/board`, which is not
 * under `/staff`: every staff page would keep working while the wall TV alone reverted to English,
 * and no `/staff` test would ever catch it. There is a mutant for exactly this.
 *
 * `httpOnly` because nothing client-side reads it — the language arrives as a server-rendered prop,
 * so there is no first-paint flash to avoid and no reason to expose it to page JS. 400 days is the
 * browser cap for a persistent cookie; a tablet set up once should not have to be set up again.
 */
export function staffLangCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 34_560_000,
  };
}
