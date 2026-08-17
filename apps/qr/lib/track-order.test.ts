import { describe, expect, it } from "vitest";
import { shapeTrackedOrder } from "./track-order";

/**
 * W22r — the tracked-order mapper is VERBATIM CARRIAGE of money snapshots to the /track slip
 * (breakdown rows, line amounts, the paid total). These tests pin the carriage: a dropped or
 * zeroed field here silently renders a wrong receipt on the tracker while every other suite
 * stays green (the money-coverage class). verify:slice mutant: track/breakdown-drops-the-tip.
 */

const row = {
  id: "0b6c1e58-0000-4000-8000-00000000abcd",
  status: "paid",
  total_cents: 4268,
  subtotal_cents: 3500,
  discount_cents: 300,
  service_charge_cents: 0,
  tax_cents: 368,
  tip_cents: 700,
  tender: "terminal",
  created_at: "2026-08-16T19:00:00Z",
  table_number: 4,
  pickup_slot: null,
  customer_name: "Min",
  togo_status: "ready",
  arrived_at: null,
  togo_ready_at: "2026-08-16T19:20:00Z",
  togo_picked_up_at: null,
  // Deliberately OUT of id order: PostgREST gives an embedded relation no defined order, so the
  // mapper's sort is load-bearing — this fixture goes red the moment the sort is dropped.
  qr_order_items: [
    {
      id: "bbbbbbbb-0000-4000-8000-000000000002",
      name: "Tea",
      qty: 1,
      unit_price_cents: 700,
      modifiers: "corrupt" as unknown,
      fulfillment: null,
      notes: "   ",
    },
    {
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      name: "Mohinga",
      qty: 2,
      unit_price_cents: 1400,
      modifiers: ["Extra lime"],
      fulfillment: "dinein",
      notes: "no cilantro",
    },
  ],
};

describe("shapeTrackedOrder — verbatim money carriage", () => {
  it("carries every breakdown cent + total + tender untouched", () => {
    const o = shapeTrackedOrder(row);
    expect(o.breakdown).toEqual({
      subtotalCents: 3500,
      discountCents: 300,
      serviceChargeCents: 0,
      taxCents: 368,
      tipCents: 700,
    });
    expect(o.totalCents).toBe(4268);
    expect(o.tender).toBe("terminal");
  });

  it("maps lines verbatim IN id order, guards malformed modifiers, blank-note → null, null fulfillment → dinein", () => {
    const o = shapeTrackedOrder(row);
    expect(o.lines).toEqual([
      {
        name: "Mohinga",
        qty: 2,
        unitPriceCents: 1400,
        mods: ["Extra lime"],
        fulfillment: "dinein",
        notes: "no cilantro",
      },
      {
        name: "Tea",
        qty: 1,
        unitPriceCents: 700,
        mods: [],
        fulfillment: "dinein",
        notes: null,
      },
    ]);
    expect(o.itemCount).toBe(3);
  });

  it("carries the real step timestamps and the pickup contact", () => {
    const o = shapeTrackedOrder(row);
    expect(o.createdAt).toBe("2026-08-16T19:00:00Z");
    expect(o.togoReadyAt).toBe("2026-08-16T19:20:00Z");
    expect(o.togoPickedUpAt).toBeNull();
    expect(o.customerName).toBe("Min");
  });
});
