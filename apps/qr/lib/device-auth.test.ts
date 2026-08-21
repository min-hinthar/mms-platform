import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** What `cookies()` reports for the request under test. */
let cookieNames: string[] = [];
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({ getAll: () => cookieNames.map((name) => ({ name, value: "x" })) }),
}));

/** What `getStaffAuth()` answers, and how many times it was ASKED — the cost this module rations. */
let staffAuth: { kind: string; caller?: unknown } = { kind: "anon" };
let staffAuthCalls = 0;
vi.mock("./staff", () => ({
  getStaffAuth: () => {
    staffAuthCalls++;
    return Promise.resolve(staffAuth);
  },
}));

const { authorizeDevice } = await import("./device-auth");

const TOKEN = "a-long-random-device-token";
const SESSION_COOKIE = "sb-fasnpdhtvqtzjlvruqcu-auth-token";

beforeEach(() => {
  cookieNames = [];
  staffAuth = { kind: "anon" };
  staffAuthCalls = 0;
  delete process.env.KIOSK_DEVICE_TOKEN;
  delete process.env.BOARD_DEVICE_TOKEN;
});

describe("authorizeDevice — the token stays free, the staff session is additive", () => {
  it("accepts the device token without ever consulting auth", async () => {
    process.env.KIOSK_DEVICE_TOKEN = TOKEN;
    expect(await authorizeDevice("kiosk", TOKEN)).toEqual({ ok: true, via: "token" });
    expect(staffAuthCalls).toBe(0);
  });

  it("a bookmarked device keeps working through an AUTH-PLANE OUTAGE", async () => {
    // The load-bearing claim in this module's header: the token is checked FIRST so a TV or kiosk
    // that is already configured does not acquire a new dependency on the auth plane. If the order
    // were ever flipped, this is the case that would notice.
    process.env.BOARD_DEVICE_TOKEN = TOKEN;
    staffAuth = { kind: "unavailable" };
    cookieNames = [SESSION_COOKIE];
    expect(await authorizeDevice("board", TOKEN)).toEqual({ ok: true, via: "token" });
    expect(staffAuthCalls).toBe(0);
  });

  it("a WRONG token from a session-less caller costs ZERO auth work", async () => {
    // The property the original gate promised ("an invalid token costs nothing") and that
    // `kiosk.test.ts` counts queries for. Adding a staff fallback nearly retired it silently.
    process.env.KIOSK_DEVICE_TOKEN = TOKEN;
    expect(await authorizeDevice("kiosk", "wrong")).toEqual({ ok: false, reason: "denied" });
    expect(staffAuthCalls).toBe(0);
  });

  it("an unset token with no session is not_configured, and still costs nothing", async () => {
    expect(await authorizeDevice("kiosk", "")).toEqual({ ok: false, reason: "not_configured" });
    expect(staffAuthCalls).toBe(0);
  });

  // ── the new door ────────────────────────────────────────────────────────────────────────────
  it("lets a STAFF session in when the token does not match", async () => {
    process.env.KIOSK_DEVICE_TOKEN = TOKEN;
    cookieNames = [SESSION_COOKIE];
    staffAuth = { kind: "staff", caller: { role: "owner" } };
    expect(await authorizeDevice("kiosk", "stale-bookmark")).toEqual({ ok: true, via: "staff" });
  });

  it("lets a STAFF session in when NO token is configured at all", async () => {
    // The case that makes a fresh device usable without editing env first — the whole point of the
    // second credential (owner, 2026-08-21).
    cookieNames = [SESSION_COOKIE];
    staffAuth = { kind: "staff", caller: { role: "manager" } };
    expect(await authorizeDevice("board", "")).toEqual({ ok: true, via: "staff" });
  });

  it("recognises a CHUNKED session cookie", async () => {
    // `@supabase/ssr` splits the cookie once the JWT outgrows 4KB, which a real session routinely
    // does. Matching an exact name would work in tests and fail on the actual device.
    cookieNames = [`${SESSION_COOKIE}.0`, `${SESSION_COOKIE}.1`];
    staffAuth = { kind: "staff", caller: {} };
    expect(await authorizeDevice("board", "")).toEqual({ ok: true, via: "staff" });
  });

  it("a signed-in NON-staff account is denied, not admitted", async () => {
    process.env.BOARD_DEVICE_TOKEN = TOKEN;
    cookieNames = [SESSION_COOKIE];
    staffAuth = { kind: "not_staff" };
    expect(await authorizeDevice("board", "wrong")).toEqual({ ok: false, reason: "denied" });
  });

  it("an anonymous DINER session is denied — a cookie is a hint, not a credential", async () => {
    // Every diner carries an `sb-…-auth-token` cookie (AnonAuthGate mints one). The cookie only buys
    // the lookup; `getStaffAuth` still decides, and it answers `anon` for them.
    cookieNames = [SESSION_COOKIE];
    staffAuth = { kind: "anon" };
    expect(await authorizeDevice("kiosk", "")).toEqual({ ok: false, reason: "not_configured" });
    expect(staffAuthCalls).toBe(1);
  });

  it("an auth read that FAILS is `unavailable`, never `denied`", async () => {
    // W10b. A 401 here would tell a running display it had been de-authorized during a blip.
    process.env.BOARD_DEVICE_TOKEN = TOKEN;
    cookieNames = [SESSION_COOKIE];
    staffAuth = { kind: "unavailable" };
    expect(await authorizeDevice("board", "wrong")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("keeps the two surfaces' tokens separate", async () => {
    // One env var authorizing the other surface would be a silent privilege bridge.
    process.env.KIOSK_DEVICE_TOKEN = TOKEN;
    expect(await authorizeDevice("board", TOKEN)).toEqual({ ok: false, reason: "not_configured" });
  });
});
