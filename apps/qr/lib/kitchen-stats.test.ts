import { describe, expect, it } from "vitest";
import { servedMoreKey, shapeKdsStats } from "./kitchen-stats";

describe("shapeKdsStats — an absent stats row is an UNKNOWN count, never zero (Codex round 1 on A4·1)", () => {
  it("maps a row", () => {
    expect(shapeKdsStats({ avg_secs: 512, served_count: 38 })).toEqual({
      avgSecs: 512,
      servedToday: 38,
    });
  });
  it("a genuine zero stays zero — nothing served yet is a count, not an outage", () => {
    expect(shapeKdsStats({ avg_secs: 0, served_count: 0 })).toEqual({ avgSecs: 0, servedToday: 0 });
    expect(servedMoreKey(0)).toBe("kds.served.more");
  });
  it("no row — the rpc failed — is null, and the capped sentence takes the honest form", () => {
    // MUTATION: `served_count ?? 0` → "Showing the last 40 of 0 served today" over a full rail.
    expect(shapeKdsStats(undefined)).toEqual({ avgSecs: 0, servedToday: null });
    expect(shapeKdsStats(null).servedToday).toBeNull();
    expect(servedMoreKey(null)).toBe("kds.served.moreUnknown");
    expect(servedMoreKey(38)).toBe("kds.served.more");
  });
});
