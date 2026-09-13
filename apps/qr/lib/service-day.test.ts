import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readServiceDay } from "./service-day";

/**
 * A4·3 (Codex round 1 on #283) — the ONE service-day read the counter's "today" zones share: the
 * server's clock and the CONFIGURED zone, validated, every failure logged and coalesced. The floor
 * rule itself is pinned in `day-window.test.ts`; this suite proves the read reaches it with the
 * configured zone and the server's own instant, and never throws.
 */
// 2026-09-13 19:00Z — 12:00 PM in Los Angeles (floor 07:00Z), 3:00 PM in New York (floor 04:00Z).
const NOW = "2026-09-13T19:00:00.000Z";

type Db = Parameters<typeof readServiceDay>[0];
function fakeDb(opts: {
  now?: { data: unknown; error: { message: string } | null };
  tz?: { data: { tz: string | null } | null; error: { message: string } | null };
}): Db {
  return {
    rpc: () => Promise.resolve(opts.now ?? { data: NOW, error: null }),
    from: () => ({
      select: () => ({
        maybeSingle: () =>
          Promise.resolve(opts.tz ?? { data: { tz: "America/Los_Angeles" }, error: null }),
      }),
    }),
  } as unknown as Db;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("readServiceDay — the one floor every 'today' zone shares", () => {
  it("floors on the CONFIGURED zone at the server's own instant", async () => {
    const day = await readServiceDay(
      fakeDb({ tz: { data: { tz: "America/New_York" }, error: null } }),
      "t",
    );
    expect(day).toEqual({
      nowIso: NOW,
      tz: "America/New_York",
      sinceIso: "2026-09-13T04:00:00.000Z",
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("a failed zone read coalesces to the default zone AND says so — never throws", async () => {
    const day = await readServiceDay(
      fakeDb({ tz: { data: null, error: { message: "boom" } } }),
      "t",
    );
    expect(day.tz).toBe("America/Los_Angeles");
    expect(day.sinceIso).toBe("2026-09-13T07:00:00.000Z");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[t]"), { message: "boom" });
  });

  it("a zone only Postgres knows (or a typo) is validated to the default, not thrown on", async () => {
    const day = await readServiceDay(
      fakeDb({ tz: { data: { tz: "Mars/Olympus" }, error: null } }),
      "t",
    );
    expect(day.tz).toBe("America/Los_Angeles");
    expect(day.sinceIso).toBe("2026-09-13T07:00:00.000Z");
  });

  it("a failed clock read falls back to this server's clock, logged — the floor still parses", async () => {
    const day = await readServiceDay(
      fakeDb({ now: { data: null, error: { message: "rpc down" } } }),
      "t",
    );
    expect(Number.isFinite(Date.parse(day.nowIso))).toBe(true);
    expect(Number.isFinite(Date.parse(day.sinceIso))).toBe(true);
    expect(Date.parse(day.sinceIso)).toBeLessThanOrEqual(Date.parse(day.nowIso));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[t]"), {
      message: "rpc down",
    });
  });
});
