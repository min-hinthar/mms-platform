import { describe, expect, it } from "vitest";
import { JUST_NOW_SEC, relativeAge } from "./relative-time";

const T0 = Date.parse("2026-09-20T18:00:00.000Z");
const at = (sec: number) => new Date(T0 - sec * 1000).toISOString();

describe("relativeAge — the key and the count, by threshold", () => {
  it("is 'just now' below the floor and a minute count from it", () => {
    expect(relativeAge(at(JUST_NOW_SEC - 1), T0)).toEqual({ k: "time.justNow" });
    // MUTATION: `<=` at the floor — 45 s reads "just now" and this reddens.
    expect(relativeAge(at(JUST_NOW_SEC), T0)).toEqual({ k: "time.minAgo", n: 1 });
    expect(relativeAge(at(5 * 60), T0)).toEqual({ k: "time.minAgo", n: 5 });
  });

  it("a future stamp (device clock behind the server) clamps to 'just now'", () => {
    expect(relativeAge(at(-90), T0)).toEqual({ k: "time.justNow" });
  });

  it("rounds to the nearest unit and rolls minutes → hours → days at 60 and 24", () => {
    // 59.4 min rounds down to 59; 59.5 rounds UP to 60, which is an hour, not "60m ago".
    expect(relativeAge(at(59.4 * 60), T0)).toEqual({ k: "time.minAgo", n: 59 });
    expect(relativeAge(at(59.5 * 60), T0)).toEqual({ k: "time.hrAgo", n: 1 });
    expect(relativeAge(at(23 * 3600), T0)).toEqual({ k: "time.hrAgo", n: 23 });
    // MUTATION: `hr <= 24` — a day-old row reads "24h ago" and this reddens.
    expect(relativeAge(at(24 * 3600), T0)).toEqual({ k: "time.dayAgo", n: 1 });
    expect(relativeAge(at(3 * 86400), T0)).toEqual({ k: "time.dayAgo", n: 3 });
  });
});
