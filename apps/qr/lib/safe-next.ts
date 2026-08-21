/**
 * `?next=` validation for the staff magic-link callback — the ONE place a post-sign-in destination is
 * decided.
 *
 * A magic link is a URL someone receives in email and clicks. If the callback forwards to whatever
 * `next` says, the sign-in flow becomes an open redirect: an attacker sends a staff member a link
 * that authenticates them and then bounces them to a look-alike host, carrying the trust of a real
 * `qr.mandalaymorningstar.com` sign-in.
 *
 * ⚠️ The obvious predicate is NOT enough, and this is borrowed from the delivery repo, which shipped
 * it wrong first and wrote the lesson down. `startsWith("/") && !startsWith("//") && !includes("://")`
 * lets BOTH of these through, and the WHATWG URL parser resolves both to `https://evil.com`:
 *
 *   ·  `/\evil.com`      — a backslash aliases to `/` for http/https schemes
 *   ·  `/⇥/evil.com`     — TAB, LF and CR are STRIPPED before parsing, so `/<TAB>/evil.com` is `//evil.com`
 *
 * So the check is three layers, cheapest first, and the last one is the belt that catches the next
 * normalization quirk nobody has thought of yet: reject the strippable characters outright, require a
 * single leading slash, then RESOLVE the candidate against a throwaway origin and demand that exact
 * origin back.
 */

/** Where a staff sign-in lands when `next` is absent, unusable, or not a permitted surface. */
export const DEFAULT_NEXT = "/staff";

/**
 * The surfaces a magic link may land on. An allowlist rather than "any same-origin path" on purpose:
 * `next` rides in a URL that reaches a mailbox, so the blast radius of a mistake here is every future
 * route. These four are the ones a staff member is asked to sign in FOR — the two portals and the two
 * device surfaces (W-staff-auth). `/staff` covers the whole console including `/staff/kitchen`.
 */
const ALLOWED_PREFIXES = ["/staff", "/kiosk", "/board"] as const;

/** Characters the URL parser STRIPS or re-reads before resolving — never let them reach it. */
const STRIPPABLE = /[\\\t\n\r]/;

/**
 * Normalize a `?next=` value to a safe, same-origin, allowlisted path — or `DEFAULT_NEXT`.
 *
 * Returns a path, never an absolute URL, so the caller cannot accidentally forward an origin. Query
 * and hash on the candidate are preserved (`/board?k=…` must survive — the device token rides there).
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  // 1. The strippable characters, before anything parses them.
  if (STRIPPABLE.test(raw)) return DEFAULT_NEXT;
  // 2. Exactly one leading slash. `//evil.com` is protocol-relative — an absolute URL in disguise.
  if (!raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_NEXT;
  // 3. Resolve it and demand the throwaway origin back. A candidate that reaches any other origin —
  //    by a quirk this file does not know about — fails here rather than in a staff member's browser.
  let resolved: URL;
  try {
    resolved = new URL(raw, "https://mms.invalid");
  } catch {
    return DEFAULT_NEXT;
  }
  if (resolved.origin !== "https://mms.invalid") return DEFAULT_NEXT;

  // 4. The allowlist, checked on the RESOLVED pathname (so `/staff/../kiosk` is judged as `/kiosk`,
  //    which is what the browser would actually request — never on the raw string).
  const path = resolved.pathname;
  const permitted = ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`),
  );
  if (!permitted) return DEFAULT_NEXT;

  return `${path}${resolved.search}${resolved.hash}`;
}
