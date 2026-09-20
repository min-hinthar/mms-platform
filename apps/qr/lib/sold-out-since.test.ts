import { describe, expect, it } from "vitest";

process.env.TZ = "UTC"; // see staff-clock.test.ts — the fixture must not be the process zone
const { soldOutSinceParts } = await import("./sold-out-since");
const plain = (s: string) => s.replace(/\u202f/g, " ");

describe("soldOutSinceParts — a stamp from another day carries its day", () => {
  it("same service day: the clock alone", () => {
    // 6:40 PM PDT Sep 15 (01:40 UTC Sep 16), read at 9:00 PM PDT the same evening.
    const r = soldOutSinceParts("2026-09-16T01:40:00.000Z", "2026-09-16T04:00:00.000Z");
    expect(r.sameDay).toBe(true);
    expect(plain(r.t)).toBe("6:40 PM");
  });

  it("the day after: the day rides with the clock, and the caller is told", () => {
    // The same 6:40 PM Sep 15, read at 11:00 AM PDT on Sep 16.
    const r = soldOutSinceParts("2026-09-16T01:40:00.000Z", "2026-09-16T18:00:00.000Z");
    expect(r.sameDay).toBe(false);
    expect(plain(r.t)).toBe("Sep 15, 6:40 PM");
  });

  it("across the UTC midnight but inside one Los Angeles evening: still the same day", () => {
    // MUTATION: compare `slice(0, 10)` of the ISO strings (UTC dates) — 11:30 PM PDT (06:30Z the
    // 16th) and 4:30 PM PDT (23:30Z the 15th) split into two days; red.
    const r = soldOutSinceParts("2026-09-15T23:30:00.000Z", "2026-09-16T06:30:00.000Z");
    expect(r.sameDay).toBe(true);
    expect(plain(r.t)).toBe("4:30 PM");
  });
});
