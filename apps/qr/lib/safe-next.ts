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
 * So the check is layered, cheapest first, and the resolve step is the belt that catches the next
 * normalization quirk nobody has thought of yet: require an actual string, reject the strippable
 * characters outright, require a single leading slash, then RESOLVE the candidate against a
 * throwaway origin and demand that exact origin back.
 */

/** Where a staff sign-in lands when `next` is absent, unusable, or not a permitted surface. */
export const DEFAULT_NEXT = "/staff";

/**
 * The destination rides in a COOKIE, not in `redirectTo` — and that is a Supabase constraint, not a
 * style choice.
 *
 * Supabase matches `redirectTo` against the project's Redirect URL allow list as a GLOB over the
 * whole URL, where the separators are `.` and `/` (docs: "Use wildcards in redirect URLs"). So an
 * allow-list entry of `https://qr.mandalaymorningstar.com/staff/auth/callback` matches that string
 * and nothing else: appending `?next=%2Fkiosk` makes it MISS, and a miss silently falls back to the
 * Site URL. The magic link would land on the site root and the sign-in would look broken, with
 * nothing in the app able to say why.
 *
 * Covering it would need a `…/callback**` entry added in the dashboard — a config dependency for a
 * code feature, on the one path that is hardest to debug remotely. A cookie needs no dashboard
 * change and keeps the already-allow-listed callback URL exactly as it is.
 *
 * Not httpOnly (the browser sets it before leaving for the mail provider) and not a secret: its value
 * is re-validated by `safeNext` on read, so the worst a hostile page can do is send a staff member to
 * one of the three surfaces they were already going to. `SameSite=Lax` is deliberate — a magic link
 * is a top-level GET navigation from a mail client, which Lax permits and Strict would drop.
 */
export const NEXT_COOKIE = "mms_staff_next";

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
export function safeNext(raw: unknown): string {
  // 0. It must actually BE a string. `unknown` rather than `string | null` because TypeScript's
  //    claim about a search param is not load-bearing: Next hands a REPEATED parameter
  //    (`?next=/board&next=/kiosk`) through as a `string[]`, and an array sails past a `!raw` check,
  //    past `STRIPPABLE.test` (which stringifies), and then throws `TypeError: raw.startsWith is not
  //    a function` — a crafted sign-in URL returning a 500 instead of falling back. Rejecting the
  //    type here rather than at each caller is the point of this being the ONE place that decides
  //    (Codex round 2, P2).
  if (typeof raw !== "string" || raw === "") return DEFAULT_NEXT;
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
