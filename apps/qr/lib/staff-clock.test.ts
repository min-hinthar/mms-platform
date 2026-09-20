import { afterAll, describe, expect, it } from "vitest";

/**
 * tips-1 — the restaurant's clock, pinned with a UTC fixture. The process zone is forced to UTC
 * before the module loads so the fixture separates "the restaurant's zone" from "whatever zone this
 * box is in": on a machine already in Los Angeles a formatter that DROPPED the zone would print the
 * same digits and this suite would be green over the exact defect it exists for (the tips page on
 * Vercel printed UTC to every manager). Node re-reads `TZ` on assignment.
 */
const PREV_TZ = process.env.TZ;
process.env.TZ = "UTC";
afterAll(() => {
  // vitest isolates each file in its own fork, but a sibling that reads the process zone is owed
  // the zone it started with all the same.
  if (PREV_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = PREV_TZ;
});
const { sameServiceDay, serviceDayKey, staffClock, staffDate, staffDateTime } =
  await import("./staff-clock");

/** ICU may set a narrow no-break space before the meridiem; the digits are what is asserted. */
const plain = (s: string) => s.replace(/\u202f/g, " ");

describe("staff-clock — every staff time is the restaurant's", () => {
  // 02:30 UTC on the 16th is 7:30 PM PDT on the 15th.
  const EVENING = "2026-09-16T02:30:00.000Z";

  it("prints the wall clock in Los Angeles, not the process zone", () => {
    // MUTATION: drop `timeZone` from `clock` — `2:30 AM`; red.
    expect(plain(staffClock(EVENING))).toBe("7:30 PM");
    expect(plain(staffDateTime(EVENING))).toBe("Sep 15, 7:30 PM");
    expect(staffDate(EVENING)).toBe("Tue, Sep 15");
  });

  it("the service day is the Los Angeles calendar day", () => {
    // MUTATION: drop `timeZone` from `dayKey` — the UTC date, `2026-09-16`; red.
    expect(serviceDayKey(EVENING)).toBe("2026-09-15");
    // Either side of the Los Angeles midnight (07:00 UTC in September): different days.
    expect(sameServiceDay("2026-09-16T06:59:00.000Z", "2026-09-16T07:01:00.000Z")).toBe(false);
    // Either side of the UTC midnight: the SAME service day — the case a UTC compare gets wrong.
    expect(sameServiceDay("2026-09-15T23:30:00.000Z", "2026-09-16T00:30:00.000Z")).toBe(true);
  });

  it("carries Latin numerals only", () => {
    expect(staffDateTime(EVENING)).toMatch(/^[A-Za-z]{3} \d{1,2}, \d{1,2}:\d{2}\s?[AP]M$/);
  });
});
