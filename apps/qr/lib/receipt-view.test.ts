import { describe, expect, it } from "vitest";
import {
  buildReceiptRows,
  receiptDateLabel,
  receiptStatusLabel,
  serviceDisclosed,
  tenderLabel,
} from "./receipt-view";

const base = {
  subtotalCents: 2000,
  discountCents: 0,
  serviceChargeCents: 0,
  taxCents: 0,
  tipCents: 0,
};

describe("buildReceiptRows", () => {
  it("zero-gates every optional row and keeps the order subtotal → … → total", () => {
    expect(buildReceiptRows(base, 2000).map((r) => r.key)).toEqual(["subtotal", "total"]);
    const full = buildReceiptRows(
      {
        subtotalCents: 2000,
        discountCents: 300,
        serviceChargeCents: 100,
        taxCents: 195,
        tipCents: 400,
      },
      2395,
    );
    expect(full.map((r) => r.key)).toEqual([
      "subtotal",
      "discount",
      "service",
      "tax",
      "tip",
      "total",
    ]);
    expect(full.find((r) => r.key === "discount")?.negative).toBe(true);
    expect(full.find((r) => r.key === "total")?.grand).toBe(true);
    // Amounts are rendered VERBATIM — the model never recomputes (2395 ≠ any sum it might invent).
    expect(full.find((r) => r.key === "total")?.amountCents).toBe(2395);
  });
});

describe("serviceDisclosed — SB-1524 rides the fee, always", () => {
  it("discloses exactly when the charge exists", () => {
    expect(serviceDisclosed(base)).toBe(false);
    expect(serviceDisclosed({ ...base, serviceChargeCents: 1 })).toBe(true);
  });
});

describe("receiptDateLabel", () => {
  it("stamps the restaurant's clock, not UTC", () => {
    // 02:00Z on Jul 1 is still the evening of Jun 30 in Los Angeles.
    expect(receiptDateLabel("2026-07-01T02:00:00Z")).toContain("Jun 30");
  });
});

describe("tenderLabel", () => {
  it("names the reader tap correctly (never 'Card' for a card-present W6c settle)", () => {
    expect(tenderLabel("card")).toBe("Card");
    expect(tenderLabel("cash")).toBe("Cash");
    expect(tenderLabel("terminal")).toBe("Card · reader");
  });
});

describe("receiptStatusLabel", () => {
  it("never claims 'Paid in full' on a refunded order", () => {
    expect(receiptStatusLabel(false, "terminal")).toBe("Paid in full · Card · reader");
    expect(receiptStatusLabel(true, "card")).toBe("Refunded — this charge was returned to you");
    expect(receiptStatusLabel(true, "card")).not.toContain("Paid");
  });
});
