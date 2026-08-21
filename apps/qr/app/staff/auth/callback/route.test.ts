import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The magic-link callback — specifically, what it does to the destination it was given.
 *
 * This file exists because of a demonstrated corruption (Codex round 2, P2). The route used to
 * `decodeURIComponent` the parked-destination cookie, and that is one decode too many: Next's
 * request-cookie parser ALREADY decodes what `document.cookie` wrote. A device token is base64 and
 * routinely contains `+`; a second decode turns `k=aB%2Bc%2Fd%3D%3D` into `k=aB+c/d==`, and `+` in a
 * query string means SPACE. `/board` then reads the token as `aB c/d==` — the token-first fallback
 * that survives an auth outage, silently dead, on the one path nobody re-tests after sign-in.
 *
 * The cookie value the mock hands back is not typed out by hand: it is produced by running the
 * written cookie through the REAL `NextRequest` parser, so this test cannot drift from what Next
 * actually does on the way in.
 */

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => ({ parked: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "mms_staff_next" && hoisted.parked !== undefined
        ? { name, value: hoisted.parked }
        : undefined,
    getAll: () => [],
    set: () => {},
  }),
}));

vi.mock("@mms/db/server", () => ({
  serverClient: () => ({ auth: { exchangeCodeForSession: async () => ({ error: null }) } }),
}));

const { GET } = await import("./route");

/** Exactly what the browser gives the server: `document.cookie`'s value, through Next's parser. */
function throughTheCookieCarrier(destination: string): string {
  const written = encodeURIComponent(destination); // what `parkNext()` writes
  const req = new NextRequest("https://qr.test/staff/auth/callback", {
    headers: { cookie: `mms_staff_next=${written}` },
  });
  return req.cookies.get("mms_staff_next")!.value;
}

async function callbackLocation(): Promise<string> {
  const res = await GET(new NextRequest("https://qr.test/staff/auth/callback?code=authcode"));
  return res.headers.get("location")!;
}

describe("staff auth callback — the parked destination survives intact", () => {
  it("preserves a base64 device token containing + and / and =", async () => {
    const TOKEN = "aB+c/d==";
    const destination = `/board?k=${encodeURIComponent(TOKEN)}`;
    hoisted.parked = throughTheCookieCarrier(destination);

    const location = await callbackLocation();

    // The assertion that was RED: the board received `aB c/d==`, a token that authorizes nothing.
    const delivered = new URL(location).searchParams.get("k");
    expect(delivered).toBe(TOKEN);
    expect(location).toBe(`https://qr.test${destination}`);
  });

  it("still honours an explicit ?next=, which decodes on its own", async () => {
    hoisted.parked = throughTheCookieCarrier("/kiosk");
    const res = await GET(
      new NextRequest("https://qr.test/staff/auth/callback?code=authcode&next=%2Fboard"),
    );
    // The URL parameter wins over the cookie — a hand-built link is the more specific instruction.
    expect(res.headers.get("location")).toBe("https://qr.test/board");
  });

  it("falls back to /staff when the parked destination is not a sign-in surface", async () => {
    hoisted.parked = throughTheCookieCarrier("/menu?table=7");
    expect(await callbackLocation()).toBe("https://qr.test/staff");
  });

  it("clears the parked cookie on the way out — it is single-use", async () => {
    hoisted.parked = throughTheCookieCarrier("/board");
    const res = await GET(new NextRequest("https://qr.test/staff/auth/callback?code=authcode"));
    const cleared = res.cookies.get("mms_staff_next");
    expect(cleared?.value).toBe("");
    expect(cleared?.maxAge).toBe(0);
  });
});
