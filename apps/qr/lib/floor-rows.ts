import type { FloorTable } from "./floor-types";
import type { RegisterQueueRow } from "./register-queue";

/**
 * A4·2 — the counter's ONE list: tables and counter orders, keyed by session, in one order.
 *
 * The floor arrives already sorted (A1: the longest "pay at the counter" ask first, above every
 * table that has not asked) and the counter queue arrives oldest first (`readRegisterQueue`). This
 * rule only decides where the two meet — it never re-sorts either, so there is still exactly one
 * definition of each order. A table that asked to pay is a party waiting to leave, so it stays on
 * top; the counter orders being built come next, because they are the work in front of the person
 * holding the tablet; the rest of the room follows in the floor's own order.
 */
export type FloorRow =
  | { kind: "table"; table: FloorTable }
  | { kind: "counter"; order: RegisterQueueRow };

export function mergeFloorRows(
  tables: readonly FloorTable[],
  counter: readonly RegisterQueueRow[],
): FloorRow[] {
  const asks = tables.filter((t) => t.counterRequestedAt !== null);
  const rest = tables.filter((t) => t.counterRequestedAt === null);
  return [
    ...asks.map((table): FloorRow => ({ kind: "table", table })),
    ...counter.map((order): FloorRow => ({ kind: "counter", order })),
    ...rest.map((table): FloorRow => ({ kind: "table", table })),
  ];
}

/** The row's key — a session id in both arms, and the floor never carries a counter session. */
export function floorRowKey(row: FloorRow): string {
  return row.kind === "table" ? row.table.sessionId : row.order.sessionId;
}
