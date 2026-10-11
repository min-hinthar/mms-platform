import { NextResponse } from "next/server";
import { GUIDE_SEEN_MARK } from "@/lib/guide-seen";
import { DINER_GUIDE_COOKIE, dinerGuideCookieOptions } from "@/lib/diner-guide";

/**
 * PD11 (m11, the critic's B11) — the diner guide's SERVER-SET seen mark.
 *
 * iOS Safari deletes script-written storage after seven days without a visit, so a regular who comes
 * back monthly would meet the first-visit guide every month from `localStorage` alone. A cookie set
 * by an HTTP RESPONSE from the site itself is not on that clock, so the guide calls this once, at
 * the moment it opens (and when it is opened from Account), and the first run reads the cookie back
 * from `document.cookie` when local storage holds nothing (`dinerGuideStore`).
 *
 * A Route Handler, not a Server Action: setting a cookie inside a Server Action re-renders the
 * current route on the server, and the guide must not re-render the menu behind it for a flag.
 *
 * ⚠️ DELIBERATELY UNAUTHENTICATED. It writes one constant into the CALLER'S OWN cookie jar — a
 * "this phone has seen the guide" flag that grants nothing, reads nothing and changes no data
 * (the staff-language cookie's reasoning, `staff-lang-actions.ts`). The worst a forged request can
 * do is hide a guide that Account reopens. No body, no input, nothing echoed.
 */
export async function POST() {
  const res = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  res.cookies.set(
    DINER_GUIDE_COOKIE,
    GUIDE_SEEN_MARK,
    dinerGuideCookieOptions(process.env.NODE_ENV === "production"),
  );
  return res;
}
