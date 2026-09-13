import { describe, expect, it } from "vitest";
import { aggregateConnection } from "./live-connection";

describe("aggregateConnection — the screen's ONE connection word for a report", () => {
  it("no board has reported: the screen is a page", () => {
    expect(aggregateConnection({})).toBe("page");
  });
  it("every board live: live", () => {
    expect(aggregateConnection({ floor: "live", bags: "live" })).toBe("live");
  });
  it("ANY board frozen is the screen's word — the person was staring at a frozen board", () => {
    // MUTATION-shaped: fold with `every` instead of `includes` → a frozen lane beside a live floor
    // reports "live", and the owner cannot tell a frozen-lane report from a live one.
    expect(aggregateConnection({ floor: "live", bags: "not_updating" })).toBe("not_updating");
    expect(aggregateConnection({ floor: "not_updating", bags: "live" })).toBe("not_updating");
  });
});
