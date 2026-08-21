import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT, safeNext } from "./safe-next";

/**
 * The two attacks in the first block are the whole reason this module exists rather than a one-line
 * predicate at the call site: both are accepted by
 * `startsWith("/") && !startsWith("//") && !includes("://")`, and both resolve to `https://evil.com`.
 * If either ever returns anything but DEFAULT_NEXT, the staff magic link is an open redirect.
 */
describe("safeNext — the open-redirect guard on the staff magic link", () => {
  it.each([
    ["a backslash, which aliases to / for http(s)", "/\\evil.com"],
    ["a TAB, which the URL parser STRIPS before resolving", "/\t/evil.com"],
    ["a newline, stripped the same way", "/\n/evil.com"],
    ["a carriage return, stripped the same way", "/\r/evil.com"],
    ["a backslash pair", "\\\\evil.com"],
  ])("refuses %s", (_why, candidate) => {
    expect(safeNext(candidate)).toBe(DEFAULT_NEXT);
  });

  it("proves the premise: these candidates really do resolve off-origin", () => {
    // Not a test of our code — a test of the ASSUMPTION our code is built on. If a future runtime
    // stops normalizing these, this fails and the comments above need rewriting rather than trusting.
    expect(new URL("/\\evil.com", "https://mms.invalid").origin).toBe("https://evil.com");
    expect(new URL("/\t/evil.com", "https://mms.invalid").origin).toBe("https://evil.com");
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["absolute http", "https://evil.com/staff"],
    ["absolute with a permitted path", "https://evil.com/kiosk"],
    ["a scheme that is not http", "javascript:alert(1)"],
    ["a bare word", "evil.com"],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
  ])("refuses %s", (_why, candidate) => {
    expect(safeNext(candidate as string | null | undefined)).toBe(DEFAULT_NEXT);
  });

  it("refuses a same-origin path that is not a sign-in surface", () => {
    // The allowlist is the point: `next` rides in a mailbox, so "any same-origin path" would make
    // every future route part of this guard's blast radius.
    expect(safeNext("/account")).toBe(DEFAULT_NEXT);
    expect(safeNext("/menu?mode=dinein")).toBe(DEFAULT_NEXT);
    expect(safeNext("/api/board?k=secret")).toBe(DEFAULT_NEXT);
  });

  it("refuses a prefix that only LOOKS allowlisted", () => {
    // `/staffing` starts with `/staff` as a string. It is not the staff console.
    expect(safeNext("/staffing")).toBe(DEFAULT_NEXT);
    expect(safeNext("/kiosk-evil")).toBe(DEFAULT_NEXT);
    expect(safeNext("/boardroom")).toBe(DEFAULT_NEXT);
  });

  // ── and the other direction: over-blocking costs the feature its whole point ────────────────────
  it.each([
    ["the console root", "/staff"],
    ["the kitchen portal", "/staff/kitchen"],
    ["the expo board", "/staff/expo"],
    ["the front-of-house orders board", "/staff/orders"],
    ["the kiosk", "/kiosk"],
    ["the ready board", "/board"],
  ])("allows %s", (_why, candidate) => {
    expect(safeNext(candidate)).toBe(candidate);
  });

  it("PRESERVES the query string — the device token rides there", () => {
    // A magic link that dropped `?k=…` would land the device on its own "not linked" state, which is
    // exactly the failure this feature exists to remove.
    expect(safeNext("/board?k=abc123")).toBe("/board?k=abc123");
    expect(safeNext("/kiosk?k=abc123")).toBe("/kiosk?k=abc123");
  });

  it("preserves a hash", () => {
    expect(safeNext("/staff/orders#today")).toBe("/staff/orders#today");
  });

  it("judges traversal on the RESOLVED path, not the raw string", () => {
    // `/staff/../kiosk` is what the string says; `/kiosk` is what the browser would request. Judging
    // the raw string would let `/staff/../account` through on its `/staff` prefix.
    expect(safeNext("/staff/../kiosk")).toBe("/kiosk");
    expect(safeNext("/staff/../account")).toBe(DEFAULT_NEXT);
  });
});
