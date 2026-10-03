import { describe, expect, it } from "vitest";
import { currentZone } from "./counter-zones";

describe("currentZone — the last heading at or above the strip's edge", () => {
  const tops = [
    { id: "start-h", top: -400 },
    { id: "floor-h", top: 60 },
    { id: "expo-h", top: 900 },
  ];
  it("lights the zone whose heading has passed the edge, not the next one coming", () => {
    expect(currentZone(tops, 120)).toBe("floor-h");
  });
  it("a heading exactly ON the edge counts as arrived", () => {
    expect(currentZone(tops, 60)).toBe("floor-h");
    expect(currentZone(tops, 59)).toBe("start-h");
  });
  it("at the top of the page the first zone is current, even before its heading reaches the edge", () => {
    expect(currentZone([{ id: "start-h", top: 300 }], 120)).toBe("start-h");
  });
  it("a missing heading (infinite top) never becomes current", () => {
    expect(
      currentZone(
        [
          { id: "start-h", top: -10 },
          { id: "gone-h", top: Number.POSITIVE_INFINITY },
        ],
        120,
      ),
    ).toBe("start-h");
  });
  it("no zones, no answer", () => {
    expect(currentZone([], 120)).toBeNull();
  });
});
