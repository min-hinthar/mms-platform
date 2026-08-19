import { describe, it, expect } from "vitest";
import { buildLiveOrderPanel } from "./live-order-panel";
import type { TrackedOrder } from "./track-order";

/**
 * W22b — the expanded chip's honesty contract, pinned. Every rule here is one that would turn the
 * panel into a confident liar rather than a broken screen, which is why it lives in lib/ with a test
 * instead of inside the component.
 */
const base: TrackedOrder = {
  id: "o1",
  status: "paid",
  totalCents: 2100,
  itemCount: 3,
  pickupSlot: null,
  togoStatus: null,
  hasTogoFood: true,
  hasDineInFood: false,
  arrivedAt: null,
  hasGrocery: false,
  tableNumber: null,
  lines: [],
  breakdown: {
    subtotalCents: 1900,
    discountCents: 0,
    serviceChargeCents: 0,
    taxCents: 200,
    tipCents: 0,
  },
  refund: { state: "none", refundedCents: 0, netPaidCents: 2100 },
  dropped: { count: 0, lines: [] },
  tender: "card",
  createdAt: "2026-08-17T21:14:00.000Z", // 2:14 PM in America/Los_Angeles
  customerName: null,
  togoReadyAt: null,
  togoPickedUpAt: null,
};

const labels = (o: TrackedOrder, kind: Parameters<typeof buildLiveOrderPanel>[1]) =>
  buildLiveOrderPanel(o, kind).rows.map((r) => r.label);

describe("buildLiveOrderPanel — real moments only", () => {
  it("prints the placed time in the RESTAURANT's timezone, not the device's", () => {
    const v = buildLiveOrderPanel(base, "togo");
    expect(v.rows[0]).toEqual({ label: "Placed", value: "2:14 PM" });
  });

  it("omits every stamp the expo has not written yet — no placeholders, no 'pending'", () => {
    expect(labels(base, "togo")).toEqual(["Placed", "Order total"]);
  });

  it("adds the ready and picked-up stamps only once they exist", () => {
    const done: TrackedOrder = {
      ...base,
      togoStatus: "picked_up",
      togoReadyAt: "2026-08-17T21:31:00.000Z",
      togoPickedUpAt: "2026-08-17T21:40:00.000Z",
    };
    expect(labels(done, "togo")).toEqual(["Placed", "Ready", "Picked up", "Order total"]);
    const v = buildLiveOrderPanel(done, "togo");
    expect(v.rows.find((r) => r.label === "Ready")?.value).toBe("2:31 PM");
  });

  it("NEVER gives a grocery basket a kitchen stamp — its togo_status is an exit-pass check", () => {
    // The DB stamps grocery lines 'preparing' at payment and the expo can mark them 'ready'. Printing
    // "Ready 2:31 PM" over a basket the shopper scanned and is already carrying invents a wait.
    const basket: TrackedOrder = {
      ...base,
      hasTogoFood: false,
      hasGrocery: true,
      togoStatus: "ready",
      togoReadyAt: "2026-08-17T21:31:00.000Z",
      togoPickedUpAt: "2026-08-17T21:40:00.000Z",
    };
    expect(labels(basket, "grocery")).toEqual(["Placed", "Order total"]);
  });

  it("keeps a SEATED diner's groceries out of the expo stamps too", () => {
    // The panel gates on the same predicate as the status word. A dine-in order carrying groceries
    // and no to-go box has a non-null togo_status (the webhook stamps grocery lines), but nothing
    // was bagged — printing "Ready 2:31 PM" would invent a wait the diner never had.
    const seated: TrackedOrder = {
      ...base,
      hasDineInFood: true,
      hasTogoFood: false,
      hasGrocery: true,
      tableNumber: 4,
      togoStatus: "ready",
      togoReadyAt: "2026-08-17T21:31:00.000Z",
    };
    expect(labels(seated, "dinein")).toEqual(["Placed", "Order total"]);
  });

  it("frames the arrival ping as the DINER's action, never as staff acknowledgement", () => {
    const arrived: TrackedOrder = { ...base, arrivedAt: "2026-08-17T21:20:00.000Z" };
    const v = buildLiveOrderPanel(arrived, "togo");
    const row = v.rows.find((r) => r.value === "2:20 PM");
    expect(row?.label).toBe("You said you're here");
    // Nothing in the data records that a staff member saw it.
    expect(v.rows.some((r) => /acknowledg|confirmed|seen/i.test(r.label))).toBe(false);
  });

  it("carries the money snapshot verbatim — it never recomputes a total", () => {
    const v = buildLiveOrderPanel({ ...base, totalCents: 4267 }, "togo");
    expect(v.rows.find((r) => r.label === "Order total")?.value).toBe("$42.67");
  });

  it("drops the Total row rather than printing $0.00 for a zero snapshot", () => {
    expect(labels({ ...base, totalCents: 0 }, "togo")).toEqual(["Placed"]);
  });
});

describe("buildLiveOrderPanel — context and counts", () => {
  it("shows a pickup slot as an ABSOLUTE time, never a countdown", () => {
    const v = buildLiveOrderPanel({ ...base, pickupSlot: "2026-08-17T22:30:00.000Z" }, "pickup");
    expect(v.context).toMatch(/^Ready /);
    // A countdown would need a tick and the ±caps /track owns; a second copy is a second thing to
    // keep true. Assert no relative phrasing leaked in.
    expect(v.context).not.toMatch(/in ~|any minute|min\b/);
  });

  it("shows the table for a seated order", () => {
    const v = buildLiveOrderPanel({ ...base, hasDineInFood: true, tableNumber: 4 }, "dinein");
    expect(v.context).toBe("Table 4");
  });

  it("has no context to show when there is neither a slot nor a table", () => {
    expect(buildLiveOrderPanel(base, "togo").context).toBeNull();
  });

  it("counts items, and gets the singular right", () => {
    expect(buildLiveOrderPanel(base, "togo").itemSummary).toBe("3 items");
    expect(buildLiveOrderPanel({ ...base, itemCount: 1 }, "togo").itemSummary).toBe("1 item");
    expect(buildLiveOrderPanel({ ...base, itemCount: 0 }, "togo").itemSummary).toBeNull();
  });

  it("labels the mode from the shared ladder", () => {
    expect(buildLiveOrderPanel(base, "dinein").modeLabel).toBe("Dine-in");
    expect(buildLiveOrderPanel(base, "grocery").modeLabel).toBe("Grocery");
  });
});
