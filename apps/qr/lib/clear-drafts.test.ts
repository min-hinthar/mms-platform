import { describe, expect, it } from "vitest";
import { clearAsksFirst } from "./clear-drafts";
import type { ClearPreview } from "./clear-table";

const FREE: ClearPreview = {
  seenAt: "",
  sent: [],
  lossCents: 0,
  units: 0,
  droppedUnits: 0,
  lines: [],
};

describe("clearAsksFirst — the lifecycle audit", () => {
  it("asks only over a FREE clear that would drop the guests' unsent dishes", () => {
    // lck/clear-drafts/drafts-cleared-unasked
    expect(clearAsksFirst({ ...FREE, droppedUnits: 1 })).toBe(true);
    expect(clearAsksFirst(FREE)).toBe(false);
    // a loss look has its own slip, which already names the drafts
    expect(
      clearAsksFirst({
        ...FREE,
        droppedUnits: 1,
        sent: [{ id: "l", qty: 1, name: "M", nameMy: null, state: "fired", amountCents: 100 }],
      }),
    ).toBe(false);
  });
});
