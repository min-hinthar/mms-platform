import { describe, expect, it } from "vitest";
import { greetingFor } from "./greeting";

// Times are UTC instants; the restaurant is America/Los_Angeles (PDT = UTC−7 in September).
const at = (utc: string) => new Date(utc);

describe("greetingFor — the restaurant's clock, not the server's", () => {
  it("says morning, afternoon and evening at the shop's own hours", () => {
    expect(greetingFor(at("2026-09-22T16:00:00Z"))).toBe("Good morning"); // 9:00 PDT
    expect(greetingFor(at("2026-09-22T20:30:00Z"))).toBe("Good afternoon"); // 13:30 PDT
    // MUTATION: read the UTC hour instead of the shop's — 02:00 UTC is 19:00 PDT (evening), but
    // 2 UTC would read as the small hours; red.
    expect(greetingFor(at("2026-09-23T02:00:00Z"))).toBe("Good evening"); // 19:00 PDT
  });

  it("puts the band edges where a host would", () => {
    expect(greetingFor(at("2026-09-22T11:00:00Z"))).toBe("Good morning"); // 04:00 PDT
    expect(greetingFor(at("2026-09-22T10:59:00Z"))).toBe("Good evening"); // 03:59 PDT
    expect(greetingFor(at("2026-09-22T19:00:00Z"))).toBe("Good afternoon"); // 12:00 PDT
    expect(greetingFor(at("2026-09-23T00:00:00Z"))).toBe("Good evening"); // 17:00 PDT
  });

  it("follows the shop's clock across the DST change, not a fixed offset", () => {
    // December is PST (UTC−8). 00:30 UTC is 16:30 in the shop — still afternoon — but a mutant that
    // hard-codes the summer offset (UTC−7) reads 17:30 and says evening; red.
    expect(greetingFor(at("2026-12-16T00:30:00Z"))).toBe("Good afternoon");
    expect(greetingFor(at("2026-12-15T12:00:00Z"))).toBe("Good morning"); // 04:00 PST
  });
});
