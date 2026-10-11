import { describe, expect, it } from "vitest";
import { GUIDE_SEEN_MARK } from "@/lib/guide-seen";
import {
  DINER_GUIDE_COOKIE,
  DINER_GUIDE_COOKIE_MAX_AGE,
  DINER_GUIDE_KEY,
  cookieMarked,
} from "@/lib/diner-guide-mark";
import { POST } from "./route";

/**
 * PD11 (the critic's B11) — the server-set seen mark. What a browser stores is the `Set-Cookie`
 * header, so the suite reads THAT: a lifetime (a session cookie would die with the tab — the whole
 * point is outliving Safari's seven-day script storage), readable by the page (an HttpOnly mark the
 * first run cannot see would be no mark), site-wide, and the value the first run reads back.
 */
describe("POST /api/guide-seen", () => {
  it("answers 204 with the guide's mark as a long-lived, page-readable, site-wide cookie", async () => {
    const res = await POST();
    expect(res.status).toBe(204);
    const set = res.headers.get("set-cookie") ?? "";
    // MUTATION (pd11/route/session-cookie): no Max-Age — the mark dies with the tab; red.
    expect(set).toMatch(new RegExp(`(^|;\\s*)Max-Age=${DINER_GUIDE_COOKIE_MAX_AGE}(;|$)`, "i"));
    // MUTATION (pd11/route/http-only): HttpOnly — `document.cookie` never sees it; red.
    expect(set).not.toMatch(/HttpOnly/i);
    expect(set).toMatch(/(^|;\s*)Path=\/(;|$)/i);
    expect(set).toMatch(/SameSite=lax/i);
    // The value the first run reads back, under the seen key's cookie-safe name.
    const pair = set.split(";")[0]!;
    expect(pair).toBe(`${DINER_GUIDE_COOKIE}=${GUIDE_SEEN_MARK}`);
    expect(cookieMarked(pair, DINER_GUIDE_COOKIE)).toBe(true);
    expect(DINER_GUIDE_COOKIE).toBe(DINER_GUIDE_KEY.replace(/:/g, "."));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
