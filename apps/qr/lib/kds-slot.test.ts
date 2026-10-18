import { describe, expect, it } from "vitest";
import { kdsWhen } from "./kds-slot";
import { staffClock, staffWeekday } from "./staff-clock";
import { tf } from "./i18n/fill";

/**
 * The lifecycle audit — a held card's due time carries its DAY: today as before, "Tomorrow …", or the
 * weekday. NOW is 11 AM PDT on Sunday 20 September.
 */
const NOW = "2026-09-20T18:00:00.000Z";

describe("kdsWhen — when a held card is due", () => {
  it("today reads exactly as before — the bare clock", () => {
    const tonight = "2026-09-21T01:00:00.000Z"; // 6 PM today
    expect(kdsWhen("en", tonight, NOW)).toBe(staffClock(tonight));
  });
  it("tomorrow says so, in the device language", () => {
    // lck/kds-slot/tomorrow-reads-as-today
    const tomorrow = "2026-09-22T01:00:00.000Z"; // 6 PM Monday
    for (const lang of ["en", "my"] as const)
      expect(kdsWhen(lang, tomorrow, NOW)).toBe(
        tf(lang, "kds.when.tomorrow", { t: staffClock(tomorrow) }),
      );
  });
  it("a later day names its weekday", () => {
    // lck/kds-slot/later-day-reads-as-today
    const tuesday = "2026-09-23T01:00:00.000Z";
    expect(kdsWhen("en", tuesday, NOW)).toBe(`${staffWeekday(tuesday)} ${staffClock(tuesday)}`);
  });
});
