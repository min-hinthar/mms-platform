import { GUIDE_SEEN_MARK, guideSeenKey, type GuideStore } from "./guide-seen";

/**
 * PD11 (m11) — the diner guide's SEEN MARK: its key on PD12's one seen-key rule, and the copy the
 * server sets so it outlives iOS Safari's seven-day clear of script-written storage (the critic's
 * B11). Pure and import-light on purpose: `app/api/guide-seen/route.ts` reads only this, never the
 * guide's pages (which pull the dictionaries and the UI kit). `lib/diner-guide.ts` re-exports it.
 */

/** The guide's surface and its SHAPE's revision: a guide whose pages change is a new first visit
 *  (`lib/help.ts`'s precedent) — a word that changes at the C2 flip is not a new shape (m11). */
export const DINER_GUIDE_SURFACE = "dinein";
export const DINER_GUIDE_REVISION = 1;
/** Per DEVICE (no person in the key): a phone, not an account. */
export const DINER_GUIDE_KEY = guideSeenKey(DINER_GUIDE_SURFACE, DINER_GUIDE_REVISION);

// ── The mark that outlives Safari's script storage (the critic's B11) ────────────────────────────

/**
 * iOS Safari deletes SCRIPT-WRITTEN storage (localStorage, `document.cookie` cookies) after seven
 * days without a visit; a cookie set by an HTTP RESPONSE from the site itself is not capped. So the
 * guide also asks the server to set its mark (`POST /api/guide-seen`, at open), and the first run
 * reads it back from `document.cookie` when local storage holds nothing. The cookie name is the
 * seen key in cookie-token characters (a `:` is a separator in a cookie name).
 */
export function guideCookieName(key: string): string {
  return key.replace(/:/g, ".");
}
export const DINER_GUIDE_COOKIE = guideCookieName(DINER_GUIDE_KEY);

/** 400 days — the longest lifetime a browser keeps (Chrome caps there). */
export const DINER_GUIDE_COOKIE_MAX_AGE = 34_560_000;

/**
 * The cookie's attributes. NOT HttpOnly: the first run reads it in the browser (the menu render is
 * frozen this wave, so the server cannot hand it down). It carries no authority — a "seen" flag in
 * the caller's own jar — so a page reading it is harmless.
 */
export function dinerGuideCookieOptions(production: boolean) {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: production,
    path: "/",
    maxAge: DINER_GUIDE_COOKIE_MAX_AGE,
  };
}

/** Does a `Cookie` header (or `document.cookie`) carry the named mark? Whole names only. */
export function cookieMarked(cookie: string, name: string): boolean {
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name && part.slice(eq + 1).trim() !== "") return true;
  }
  return false;
}

/**
 * The diner guide's store: `localStorage` first, then — when it holds nothing for a key — the
 * server-set cookie for that key. A store that THROWS still throws (the shared helper reads that as
 * refused: never auto-open), and writes go to local storage only (the cookie is the server's).
 */
export function dinerGuideStore(local: () => GuideStore, cookie: () => string): () => GuideStore {
  return () => {
    const ls = local();
    return {
      getItem: (k) =>
        ls.getItem(k) ?? (cookieMarked(cookie(), guideCookieName(k)) ? GUIDE_SEEN_MARK : null),
      setItem: (k, v) => ls.setItem(k, v),
    };
  };
}
