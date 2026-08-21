import { describe, expect, it, vi } from "vitest";

// `proxy-session` reaches `@mms/db/server` for the SSR client, which carries `server-only` — the
// repo idiom for testing such a module (see `cart-toggle.test.ts`). The predicate under test is
// pure; the client construction is never exercised here.
vi.mock("server-only", () => ({}));

const { needsStaffSession } = await import("./proxy-session");

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
