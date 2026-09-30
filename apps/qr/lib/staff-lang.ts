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

// ── Phase 2e · lang ──
/**
 * P2e — the device's language is one of THREE MODES, not two scripts (owner decision 2,
 * 2026-09-24). The cookie stores the mode; every staff component still receives a SCRIPT.
 *
 *   mode       cookie      the layout passes                  <Chrome>'s English echoes
 *   Burmese    "my-only"   lang="my" echoes={false}           dropped — except the K15-HIGH band
 *   Both       "both"      lang="my" (echoes default true)    exactly what "my" rendered before P2e
 *   English    "en"        lang="en"                          none (a bare English text node)
 *
 * THE LITERALS NEVER OVERLAP. `"my"` is a script and never a mode; `"my-only"` is a mode and never a
 * script — so passing one where the other is expected is a compile error, not a silent mistake. They
 * meet only here (the parse, `scriptOf`, `modeOf`) and in the provider's two hooks.
 *
 * THE DEFAULT IS BOTH, whose script is `"my"`. So an absent cookie and a legacy `"my"` cookie
 * render exactly what they rendered before P2e: no device changes under anyone on deploy. No cookie
 * is rewritten on read — only the action writes, and it always writes a mode literal.
 *
 * ROLLBACK-SAFE: the previous build's `parseStaffLang` reads `"my-only"` and `"both"` as `"my"`
 * (anything but exactly `"en"` is Burmese), which IS Both. A rollback can never turn a device English.
 *
 * STATED LIMIT: "this device" is really this BROWSER's cookie jar. An iPad Home-Screen web app and
 * Safari keep separate jars, and clearing site data resets the device to Both. Both directions fall
 * back to the default, which drops nothing — the scope line says "device" because staff think in
 * devices, and a mid-rush reader cannot use "this screen on this device".
 */
export type StaffLangMode = "my-only" | "both" | "en";

/** The three modes, in the order the rows show them (Burmese · Both · English). */
export const STAFF_LANG_MODES = [
  "my-only",
  "both",
  "en",
] as const satisfies readonly StaffLangMode[];

export const STAFF_LANG_MODE_DEFAULT: StaffLangMode = "both";

/**
 * The ONE mode parser — EXACT equality on all three literals, never a trim, a case-fold or a prefix
 * (a cookie jar is untrusted input: `parseStaffLang`'s rule). `"both"` is named explicitly rather
 * than left to the fallback, so a device that CHOSE Both keeps it if the default ever moves; the
 * fallback is a defaulted parameter so that line stays falsifiable (the `tipPresets` pattern).
 */
export function parseStaffLangMode(
  value: string | undefined,
  fallback: StaffLangMode = STAFF_LANG_MODE_DEFAULT,
): StaffLangMode {
  if (value === "en") return "en";
  if (value === "my-only") return "my-only";
  if (value === "both") return "both";
  return fallback;
}

/** The script a mode renders in: English is English, both Burmese modes are Burmese. */
export function scriptOf(mode: StaffLangMode): StaffLang {
  return mode === "en" ? "en" : "my";
}

/**
 * Whether the chrome draws its English echoes. `null` is "no provider" (the wall TV's `ReadyBoard`
 * renders `<Chrome>` with none) and draws them: a guest never loses English.
 */
export function echoesShown(mode: StaffLangMode | null): boolean {
  return mode !== "my-only";
}

/** The inverse of `scriptOf` + `echoesShown` — what the provider holds for a (script, echoes) pair. */
export function modeOf(script: StaffLang, echoes: boolean): StaffLangMode {
  if (script === "en") return "en";
  return echoes ? "both" : "my-only";
}

/**
 * The front doors' two-script pill writes a MODE. Tapping the script the device already reads keeps
 * its mode (a Burmese-only device stays Burmese-only when မြန်မာ is tapped); tapping the other one
 * goes to English, or back to the default Both — never to an earlier Burmese-only, which the pill
 * cannot know about. The Profile and the Help sheet restore Burmese-only in one tap.
 */
export function modeForScript(script: StaffLang, current: StaffLangMode): StaffLangMode {
  if (script === scriptOf(current)) return current;
  return script === "en" ? "en" : STAFF_LANG_MODE_DEFAULT;
}

/**
 * The language write CHAIN's two decisions (§4.2 latest-pick-wins, §4.4 revert-to-confirmed,
 * applied to a device preference). A tap while a write is in flight only replaces the INTENT; after
 * each write the chain asks `nextLangWrite(intent, confirmed)` whether another is needed — so a
 * brushed "English" corrected at once writes twice and refreshes ONCE, and a correction back to the
 * value the server already holds writes nothing more.
 */
export function nextLangWrite<T extends string>(intent: T | null, confirmed: T): T | null {
  return intent !== null && intent !== confirmed ? intent : null;
}

/**
 * When the chain stops: `refresh` only if the cookie actually changed (an offline refresh is a
 * request the tablet cannot make); the cap snaps to the last value the server is KNOWN to hold, or
 * `null` (= follow the provider); and the failure line shows only when the person's final wish is
 * not what the server holds — a failed "English" they had already corrected back says nothing.
 */
export function langChainOutcome<T extends string>({
  wanted,
  confirmed,
  wrote,
  failed,
}: {
  wanted: T;
  confirmed: T;
  wrote: boolean;
  failed: boolean;
}): { cap: T | null; alert: boolean; refresh: boolean } {
  return {
    cap: wrote ? confirmed : null,
    alert: failed && wanted !== confirmed,
    refresh: wrote,
  };
}
