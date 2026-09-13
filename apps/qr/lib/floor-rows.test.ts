import { describe, expect, it } from "vitest";
import { floorRowKey, mergeFloorRows } from "./floor-rows";
import type { FloorTable } from "./floor-types";
import type { RegisterQueueRow } from "./register-queue";

/**
 * A4·2 — the merge decides only where the two lists MEET; each list's own order is its own rule
 * (A1's sort on the floor, oldest-first on the queue), so the cases pin the seam and the
 * preservation, never a re-sort this module does not perform.
 */
const table = (id: string, counterRequestedAt: string | null): FloorTable => ({
  sessionId: id,
  label: id,
  tableNumber: 7,
  mode: "dinein",
  status: counterRequestedAt ? "counter" : "ordering",
  partySize: 2,
  hostName: null,
  itemCount: 1,
  runningSubtotalCents: 1200,
  paidTotalCents: null,
  refund: null,
  tab: "none",
  tabOverCeiling: false,
  counterRequestedAt,
  lastActivityAt: "2026-09-13T18:00:00Z",
});
const order = (id: string): RegisterQueueRow => ({
  sessionId: id,
  customerName: null,
  itemCount: 1,
  subtotalCents: 900,
  startedAt: "2026-09-13T18:00:00Z",
  source: "register",
});
const keys = (rows: ReturnType<typeof mergeFloorRows>) => rows.map(floorRowKey);

describe("mergeFloorRows — tables and counter orders as ONE list", () => {
  it("a table that asked to pay at the counter stays above the counter orders being built", () => {
    // MUTATION: put the counter orders first → a party waiting to leave drops beneath a walk-up
    // that has not ordered yet.
    const rows = mergeFloorRows([table("t-ask", "2026-09-13T17:50:00Z")], [order("reg-1")]);
    expect(keys(rows)).toEqual(["t-ask", "reg-1"]);
  });
  it("counter orders come before the tables that have not asked, in the queue's own order", () => {
    const rows = mergeFloorRows(
      [table("t-1", null), table("t-2", null)],
      [order("reg-old"), order("reg-new")],
    );
    expect(keys(rows)).toEqual(["reg-old", "reg-new", "t-1", "t-2"]);
  });
  it("preserves the floor's own order inside each group and never invents or drops a row", () => {
    const tables = [
      table("t-a", null),
      table("t-ask-1", "2026-09-13T17:00:00Z"),
      table("t-b", null),
      table("t-ask-2", "2026-09-13T17:30:00Z"),
    ];
    const rows = mergeFloorRows(tables, [order("reg-1")]);
    expect(keys(rows)).toEqual(["t-ask-1", "t-ask-2", "reg-1", "t-a", "t-b"]);
    expect(rows.filter((r) => r.kind === "table")).toHaveLength(4);
  });
  it("either side may be empty", () => {
    expect(keys(mergeFloorRows([], [order("reg-1")]))).toEqual(["reg-1"]);
    expect(keys(mergeFloorRows([table("t-1", null)], []))).toEqual(["t-1"]);
    expect(mergeFloorRows([], [])).toEqual([]);
  });
});
