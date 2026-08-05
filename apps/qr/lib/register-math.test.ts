import { describe, expect, it } from "vitest";
import { changeDue, laDayStartIso, summarizeDay } from "./register-math";

describe("summarizeDay — the Z-report buckets", () => {
  it("buckets paid orders by tender and keeps refunded APART (never netted)", () => {
    const s = summarizeDay([
      { tender: "cash", total_cents: 2500, status: "paid" },
      { tender: "cash", total_cents: 1300, status: "paid" },
      { tender: "card", total_cents: 4200, status: "paid" },
      { tender: "card", total_cents: 990, status: "refunded" },
    ]);
    expect(s).toEqual({
      cashCount: 2,
      cashCents: 3800,
      cardCount: 1,
      cardCents: 4200,
      refundedCount: 1,
      refundedCents: 990,
    });
  });

  it("ignores rows in any other status — an unfinished order is not drawer money", () => {
    const s = summarizeDay([
      { tender: "cash", total_cents: 999, status: "pending" },
      { tender: "cash", total_cents: 100, status: "paid" },
    ]);
    expect(s.cashCents).toBe(100);
    expect(s.cashCount).toBe(1);
  });

  it("an unknown tender lands in the card bucket, never the cash drawer", () => {
    // The DB CHECK bounds tender to card|cash today; if a tender is ever added and this module
    // lags, overstating the CASH drawer is the harmful direction — default to the other bucket.
    const s = summarizeDay([{ tender: "ebt", total_cents: 500, status: "paid" }]);
    expect(s.cashCents).toBe(0);
    expect(s.cardCents).toBe(500);
  });
});

describe("changeDue — cashier arithmetic (display-only)", () => {
  it("returns the difference on an over-tender", () => {
    expect(changeDue(1350, 2000)).toBe(650);
  });
  it("never goes negative on a short tender", () => {
    expect(changeDue(1350, 1000)).toBe(0);
  });
  it("exact tender is zero change", () => {
    expect(changeDue(1350, 1350)).toBe(0);
  });
});

describe("laDayStartIso — the LA day window", () => {
  it("returns LA midnight during PDT (UTC−7)", () => {
    // 2026-07-15T19:30Z = 12:30 PDT → LA midnight is 07:00Z that day.
    expect(laDayStartIso(new Date("2026-07-15T19:30:00Z"))).toBe("2026-07-15T07:00:00.000Z");
  });
  it("returns LA midnight during PST (UTC−8)", () => {
    // 2026-01-15T19:30Z = 11:30 PST → LA midnight is 08:00Z.
    expect(laDayStartIso(new Date("2026-01-15T19:30:00Z"))).toBe("2026-01-15T08:00:00.000Z");
  });
  it("early-UTC evening still maps to the LA date, not the UTC date", () => {
    // 2026-07-16T03:00Z is 2026-07-15 20:00 PDT — the LA day is still the 15th.
    expect(laDayStartIso(new Date("2026-07-16T03:00:00Z"))).toBe("2026-07-15T07:00:00.000Z");
  });
});
