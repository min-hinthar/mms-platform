import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

// `proxy-session` reaches `@mms/db/server` for the SSR client, which carries `server-only` — the
// repo idiom for testing such a module (see `cart-toggle.test.ts`).
vi.mock("server-only", () => ({}));

/**
 * The Supabase client is replaced wholesale so a test can DRIVE the cookie adapter: `hoisted.adapter`
 * captures the `{ getAll, set }` pair the module hands `serverClient`, and `hoisted.getUser` is the
 * refresh — free to emit as many cookies as a real chunked rotation would, or to throw.
 *
 * `vi.hoisted` because `vi.mock` factories are lifted above every declaration in the file.
 */
const hoisted = vi.hoisted(() => ({
  adapter: null as unknown as {
    getAll: () => { name: string; value: string }[];
    set: (name: string, value: string, options?: unknown) => void;
  },
  getUser: async (): Promise<unknown> => ({ data: { user: null }, error: null }),
}));

vi.mock("@mms/db/server", () => ({
  serverClient: (cookies: typeof hoisted.adapter) => {
    hoisted.adapter = cookies;
    return { auth: { getUser: () => hoisted.getUser() } };
  },
}));

const { needsStaffSession, withRefreshedStaffSession } = await import("./proxy-session");

/**
 * `proxy.ts` runs on EVERY document route (its matcher exists for the per-request CSP nonce). This
 * predicate is the only thing keeping a Supabase `getUser()` round-trip off the diner hot path — a
 * QR scan must not pay for an auth call it has no session for — while still covering the four
 * surfaces an owner signs into. Both directions are load-bearing, so both are tested.
 */
describe("needsStaffSession — which routes get a session refresh", () => {
  it.each([
    ["the console root", "/staff"],
    ["the kitchen portal", "/staff/kitchen"],
    ["the expo board", "/staff/expo"],
    ["front-of-house orders", "/staff/orders"],
    ["a table detail", "/staff/table/12"],
    ["the login itself", "/staff/login"],
    ["the kiosk", "/kiosk"],
    ["the ready board", "/board"],
  ])("refreshes on %s", (_why, path) => {
    expect(needsStaffSession(path)).toBe(true);
  });

  it.each([
    ["the menu — the QR-scan hot path", "/menu"],
    ["the cart", "/cart"],
    ["a diner's tracking page", "/track/abc123"],
    ["the root", "/"],
    ["the account page", "/account"],
    ["grocery scan-and-go", "/grocery"],
  ])("does NOT refresh on %s", (_why, path) => {
    expect(needsStaffSession(path)).toBe(false);
  });

  it("matches on SEGMENTS, not string prefixes", () => {
    // The bug this forbids: `/boardroom` picking up a refresh because it starts with `/board`, and
    // — the direction that would actually matter — a future `/staffing` marketing page silently
    // joining the authenticated set.
    expect(needsStaffSession("/boardroom")).toBe(false);
    expect(needsStaffSession("/staffing")).toBe(false);
    expect(needsStaffSession("/kiosk-demo")).toBe(false);
  });
});

/**
 * The refresh itself — the half of this module that Codex round 1 found broken and that had no test
 * at all when the fix shipped. Written red-first against the old shape (rebuild-per-cookie, closing
 * over a pre-write header clone); every case below was confirmed RED before this file was added.
 *
 * Why it needs pinning: the defect was invisible on a short token. `@supabase/ssr` only chunks
 * `sb-<ref>-auth-token` into `.0`/`.1` once the JWT outgrows 4KB, so a small fixture emits ONE
 * cookie and a per-cookie rebuild looks perfectly correct. The failure appears only on a real
 * session, only on the cold overnight request — the exact path this module exists for.
 */
describe("withRefreshedStaffSession — shipping the rotated session", () => {
  const REQ_URL = "https://qr.mandalaymorningstar.com/staff/kitchen";

  /** Model `proxy.ts`'s caller faithfully: a `build()` that re-clones the request headers each call. */
  function harness(cookieHeader = "sb-ref-auth-token.0=stale") {
    const request = new NextRequest(REQ_URL, { headers: { cookie: cookieHeader } });
    /** What `request.cookies` held at the moment each `rebuild()` ran — the second half of the P1. */
    const seenByRebuild: Record<string, string>[] = [];
    const rebuild = vi.fn(() => {
      seenByRebuild.push(
        Object.fromEntries(request.cookies.getAll().map((c) => [c.name, c.value])),
      );
      const headers = new Headers(request.headers);
      headers.set("x-nonce", "test-nonce");
      return NextResponse.next({ request: { headers } });
    });
    return { request, rebuild, seenByRebuild };
  }

  it("ships EVERY cookie the refresh emits, not just the last one", async () => {
    // A rotation on a chunked session: two new chunks plus the deletion of a stale third.
    hoisted.getUser = async () => {
      hoisted.adapter.set("sb-ref-auth-token.0", "fresh-0", { path: "/" });
      hoisted.adapter.set("sb-ref-auth-token.1", "fresh-1", { path: "/" });
      hoisted.adapter.set("sb-ref-auth-token.2", "", { path: "/", maxAge: 0 });
      return { data: { user: { id: "u1" } }, error: null };
    };
    const { request, rebuild } = harness();
    const out = await withRefreshedStaffSession(request, NextResponse.next(), rebuild);

    const shipped = Object.fromEntries(out.cookies.getAll().map((c) => [c.name, c.value]));
    // The assertion that was RED: only `.2` survived, so the browser received half a session —
    // which it reads as none.
    expect(shipped["sb-ref-auth-token.0"]).toBe("fresh-0");
    expect(shipped["sb-ref-auth-token.1"]).toBe("fresh-1");
    expect(shipped["sb-ref-auth-token.2"]).toBe("");
  });

  it("rebuilds ONCE, and only after every cookie is written to the request", async () => {
    hoisted.getUser = async () => {
      hoisted.adapter.set("sb-ref-auth-token.0", "fresh-0", { path: "/" });
      hoisted.adapter.set("sb-ref-auth-token.1", "fresh-1", { path: "/" });
      return { data: { user: { id: "u1" } }, error: null };
    };
    const { request, rebuild, seenByRebuild } = harness();
    await withRefreshedStaffSession(request, NextResponse.next(), rebuild);

    expect(rebuild).toHaveBeenCalledTimes(1);
    // The forwarded request headers must carry the NEW token — a render handed the expired one
    // fails its own auth read and redirects to the login the refresh just prevented.
    expect(seenByRebuild).toHaveLength(1);
    expect(seenByRebuild[0]).toMatchObject({
      "sb-ref-auth-token.0": "fresh-0",
      "sb-ref-auth-token.1": "fresh-1",
    });
  });

  it("returns the arriving response untouched when nothing rotated", async () => {
    hoisted.getUser = async () => ({ data: { user: { id: "u1" } }, error: null });
    const { request, rebuild } = harness();
    const arriving = NextResponse.next();
    const out = await withRefreshedStaffSession(request, arriving, rebuild);

    // A still-valid session is the common case on every warm request — it must not pay for a rebuild.
    expect(out).toBe(arriving);
    expect(rebuild).not.toHaveBeenCalled();
  });

  it("returns the arriving response when the refresh THROWS — never fails the request", async () => {
    // Missing env, a transport failure, an unparseable cookie. The page's own auth read produces the
    // honest verdict a moment later; a proxy that 500s here takes down a kitchen over a blip.
    hoisted.getUser = async () => {
      throw new Error("supabase unreachable");
    };
    const { request, rebuild } = harness();
    const arriving = NextResponse.next();
    const out = await withRefreshedStaffSession(request, arriving, rebuild);

    expect(out).toBe(arriving);
    expect(rebuild).not.toHaveBeenCalled();
  });
});
