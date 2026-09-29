import { describe, expect, it } from "vitest";
import { floorTone } from "./floor-tone";

// ── Phase 2d · floor ──
describe("floorTone — the ONE tone map for tiles, card edges and chips", () => {
  it("names each status's tone: the ask, money in flight, ordering, rest, done", () => {
    expect(floorTone("counter", null)).toBe("ask");
    expect(floorTone("paying", null)).toBe("inflight");
    expect(floorTone("settling", null)).toBe("inflight");
    expect(floorTone("ordering", null)).toBe("live");
    expect(floorTone("seated", null)).toBe("rest");
    expect(floorTone("paid", null)).toBe("done");
    expect(floorTone("paid", "none")).toBe("done");
  });

  it("returned money is NEVER the success tone (K33) — a partial or a full refund reads 'returned'", () => {
    // MUTATION: map a refunded paid table to `done` → the card edge and chip go --ok over money
    // that came back.
    expect(floorTone("paid", "partial")).toBe("returned");
    expect(floorTone("paid", "full")).toBe("returned");
  });

  it("a refund never re-tones a table that is not resting on its payment", () => {
    expect(floorTone("ordering", "full")).toBe("live");
  });
});
