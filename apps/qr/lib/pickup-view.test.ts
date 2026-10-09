import { describe, expect, it } from "vitest";
import { orderOnScreen, pickupFootPromised, pickupPageShown } from "./pickup-view";
import type { TrackedOrder } from "./track-order";

/**
 * PD3 (the second blind pass on #330) — the pickup page's three decisions, lifted out of OrderTracker
 * so a VALUE falsifies each (CLAUDE.md: decision logic belongs in lib/). verify:slice: pickup-view/*.
 */
const base: TrackedOrder = {
  id: "0b6c1e58-0000-4000-8000-0000000a1b2c",
  status: "paid",
  totalCents: 2418,
  itemCount: 3,
  pickupSlot: "2026-10-09T01:20:00.000Z",
  fireAt: null,
  togoStatus: "preparing",
  hasTogoFood: true,
  hasDineInFood: false,
  arrivedAt: null,
  hasGrocery: false,
  tableNumber: null,
  lines: [],
  breakdown: {
    subtotalCents: 2200,
    discountCents: 0,
    serviceChargeCents: 0,
    taxCents: 218,
    tipCents: 0,
  },
  refund: { state: "none", refundedCents: 0, netPaidCents: 2418 },
  dropped: { count: 0, lines: [] },
  tender: "card",
  createdAt: "2026-10-09T00:58:00.000Z",
  customerName: "Aye Aye",
  togoReadyAt: null,
  togoPickedUpAt: null,
};
const at = (o: Partial<TrackedOrder>): TrackedOrder => ({ ...base, ...o });

describe("orderOnScreen — the page never moves BACKWARDS (critical, second blind pass)", () => {
  it("the exact sequence: snapshot S1 preparing, live reaches ready, a read goes stale — the page stays READY", () => {
    // MUTATION: let any snapshot replace a stale live row — the ticket falls back from the code to
    // the time and the live region re-announces "with the kitchen" for the whole outage.
    const s1 = at({ togoStatus: "preparing" });
    const live = at({ togoStatus: "ready", togoReadyAt: "2026-10-09T01:14:00.000Z" });
    expect(orderOnScreen({ live, liveStale: true, snapshot: s1 })?.togoStatus).toBe("ready");
  });
  it("a stale live row yields to a snapshot that is strictly further along (the lapse, then Ready)", () => {
    const live = at({ togoStatus: "preparing" });
    const s2 = at({ togoStatus: "ready" });
    expect(orderOnScreen({ live, liveStale: true, snapshot: s2 })?.togoStatus).toBe("ready");
    expect(
      orderOnScreen({ live, liveStale: true, snapshot: at({ status: "refunded" }) })?.status,
    ).toBe("refunded");
    expect(
      orderOnScreen({
        live,
        liveStale: true,
        snapshot: at({ arrivedAt: "2026-10-09T01:02:00.000Z" }),
      })?.arrivedAt,
    ).toBe("2026-10-09T01:02:00.000Z");
  });
  it("a live row that is NOT stale is the truth, whatever the snapshot says", () => {
    const live = at({ togoStatus: "preparing" });
    expect(
      orderOnScreen({ live, liveStale: false, snapshot: at({ togoStatus: "ready" }) })?.togoStatus,
    ).toBe("preparing");
  });
  it("no live row: the snapshot, or nothing", () => {
    expect(orderOnScreen({ live: null, liveStale: false, snapshot: base })?.id).toBe(base.id);
    expect(orderOnScreen({ live: null, liveStale: false, snapshot: null })).toBeNull();
  });
});

describe("pickupPageShown — a PAID pickup only (open question, now pinned)", () => {
  it("a paid pickup gets the page; a pending or failed row keeps the existing arms", () => {
    expect(pickupPageShown({ order: base, settleCanceled: false, pureGrocery: false })).toBe(true);
    // MUTATION: drop the paid check — a failed row reads "with the kitchen" on the pickup page.
    for (const status of ["pending", "failed", "refunded"])
      expect(
        pickupPageShown({ order: at({ status }), settleCanceled: false, pureGrocery: false }),
      ).toBe(false);
  });
  it("never without a slot, a cancelled hold or a pure grocery basket", () => {
    expect(
      pickupPageShown({
        order: at({ pickupSlot: null }),
        settleCanceled: false,
        pureGrocery: false,
      }),
    ).toBe(false);
    expect(pickupPageShown({ order: base, settleCanceled: true, pureGrocery: false })).toBe(false);
    expect(pickupPageShown({ order: base, settleCanceled: false, pureGrocery: true })).toBe(false);
    expect(pickupPageShown({ order: null, settleCanceled: false, pureGrocery: false })).toBe(false);
  });
});

describe("pickupFootPromised — 'This page catches up…' only while the page can (open question, now pinned)", () => {
  it("withdrawn only when the live row is gone AND the snapshot read answered a decided no", () => {
    // MUTATION: always promise — the foot tells a device that can no longer read the order that it
    // will catch up.
    expect(pickupFootPromised({ liveStale: true, snapshotRefused: true, pickedUp: false })).toBe(
      false,
    );
    expect(pickupFootPromised({ liveStale: true, snapshotRefused: false, pickedUp: false })).toBe(
      true,
    );
    expect(pickupFootPromised({ liveStale: false, snapshotRefused: true, pickedUp: false })).toBe(
      true,
    );
  });
  it("a collected order's foot (where the receipt lives) is always true", () => {
    expect(pickupFootPromised({ liveStale: true, snapshotRefused: true, pickedUp: true })).toBe(
      true,
    );
  });
});
