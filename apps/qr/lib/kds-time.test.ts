import { describe, expect, it } from "vitest";

import { localizeCount, tf } from "./i18n/fill";
import { elapsedParts, fmtElapsed, spokenElapsed } from "./kds-time";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("K28 — one elapsed-time formatter, with a ceiling", () => {
  it("reads m:ss under an hour, seconds zero-padded", () => {
    expect(fmtElapsed(0)).toBe("0:00");
    expect(fmtElapsed(3 * MIN + 42_000)).toBe("3:42");
    expect(fmtElapsed(9 * MIN + 5_000)).toBe("9:05");
    expect(fmtElapsed(59 * MIN + 59_000)).toBe("59:59");
  });

  it("switches to hours and minutes at exactly one hour — never `164:01`", () => {
    // The shape K28 measured on a live board: a ticket at 164 minutes read `164:01`, which a cook
    // at two metres parses as a clock time, not an age.
    expect(fmtElapsed(HOUR)).toBe("1h 0m");
    expect(fmtElapsed(2 * HOUR + 44 * MIN + 30_000)).toBe("2h 44m");
    expect(fmtElapsed(164 * MIN + 1_000)).toBe("2h 44m");
    expect(fmtElapsed(23 * HOUR + 59 * MIN + 59_000)).toBe("23h 59m");
  });

  it("caps at a day — `61375:52` (42 days of stale rows in the average) reads `1d+`", () => {
    expect(fmtElapsed(DAY)).toBe("1d+");
    expect(fmtElapsed(42 * DAY + 5 * HOUR)).toBe("1d+");
    expect(fmtElapsed(61375 * MIN + 52_000)).toBe("1d+");
  });

  it("clamps a negative age to zero — a clock-skewed tablet never shows a countdown", () => {
    expect(fmtElapsed(-5_000)).toBe("0:00");
    expect(elapsedParts(-1)).toEqual({ kind: "mmss", m: 0, s: 0 });
  });

  it("truncates, never rounds — 59.9s is still 0:59, and 59m 59s is still under the hour", () => {
    expect(fmtElapsed(59_900)).toBe("0:59");
    expect(fmtElapsed(HOUR - 1)).toBe("59:59");
  });

  it("speaks each band through its dictionary key, in the device language", () => {
    // The sr-only sentence used to be a bare English template literal on a board that can be
    // Burmese — `check-staff-lang` rule 5 cannot see a literal, so the key is pinned here. The
    // Burmese expectations are COMPUTED from the dictionary, never transcribed.
    expect(spokenElapsed("en", 3 * MIN + 42_000)).toBe("3 minutes 42 seconds elapsed");
    expect(spokenElapsed("en", 2 * HOUR + 44 * MIN)).toBe("2 hours 44 minutes elapsed");
    expect(spokenElapsed("en", 3 * DAY)).toBe("More than a day elapsed");
    const my = (v: number) => localizeCount(v, "my");
    expect(spokenElapsed("my", 3 * MIN + 42_000)).toBe(
      tf("my", "kds.age.mmss", { m: my(3), s: my(42) }),
    );
    expect(spokenElapsed("my", 2 * HOUR + 44 * MIN)).toBe(
      tf("my", "kds.age.hm", { h: my(2), m: my(44) }),
    );
    expect(spokenElapsed("my", 3 * DAY)).toBe(tf("my", "kds.age.days", {}));
    // …and a prose count takes Burmese numerals under my (the owner's numerals rule).
    expect(spokenElapsed("my", 3 * MIN + 42_000)).toMatch(/[၀-၉]/);
  });
});
