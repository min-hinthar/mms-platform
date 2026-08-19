import { formatClock, formatSlotLong } from "./pickupTime";
import { liveOrderModeLabel, type LiveOrderKind } from "./live-order";
import type { TrackedOrder } from "./track-order";

/**
 * W22b — what the expanded live-order chip is allowed to SAY, as data.
 *
 * This lives in `lib/` and not in the component on purpose: a rule left in a `.tsx` cannot be guarded
 * at all (there is no React test runner here — every one of the 56 suites is a pure node `.test.ts`),
 * and the rules below are exactly the ones that would quietly become lies. The component renders these
 * rows; it decides nothing.
 *
 * The honesty contract, in one place:
 *   • Every row is a REAL stored value — a timestamp the expo/webhook actually wrote, the diner's own
 *     chosen slot, or the fulfillment-time money snapshot. No ETA, no elapsed cook time, no queue
 *     position, no stage counter, no staff name.
 *   • "In the kitchen" gets NO clock. `togo_status='preparing'` is stamped by the Stripe webhook's
 *     drain at PAYMENT, not by a cook — using it as a cooking-start would be a fabricated time wearing
 *     a real column's clothes. /track's rail refuses a TIMESTAMP for that step for the same reason
 *     (it does light the step itself).
 *   • A pure GROCERY basket has no kitchen story at all: the shopper scanned it and is holding it.
 *   • A pickup slot prints as an ABSOLUTE time, never a countdown. The capped countdown is /track's
 *     (it owns the 30s tick and the ±caps); a second copy here would be a second thing to keep true.
 */
export type LiveOrderPanelRow = {
  /** Stable key + the row's label, e.g. "Placed". */
  label: string;
  /** The rendered value — already formatted; the component prints it verbatim. */
  value: string;
};

export type LiveOrderPanelView = {
  /** "Dine-in" | "Pickup" | "To-go" | "Grocery" — the mode, from the shared ladder. */
  modeLabel: string;
  /** Where it is, in the diner's terms: "Table 4", the pickup slot, or null. */
  context: string | null;
  /** Real, stored moments only. */
  rows: LiveOrderPanelRow[];
  /** "3 items" — a count of what was actually ordered, never an estimate. */
  itemSummary: string | null;
};

/** Cents → the app's money string. Snapshot values only; nothing here recomputes a total. */
function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Build the panel's content for the device's OWN tracked order.
 *
 * `kind` is passed in rather than re-derived so the panel can never disagree with the collapsed chip
 * standing directly above it.
 */
export function buildLiveOrderPanel(order: TrackedOrder, kind: LiveOrderKind): LiveOrderPanelView {
  const rows: LiveOrderPanelRow[] = [];

  // Placed — always true once we hold the row.
  rows.push({ label: "Placed", value: formatClock(order.createdAt) });

  // The diner's own "I'm here" ping. Phrased as THEIR action: nothing here proves a staff member saw
  // it, and reading it as acknowledgement would promise a handshake the data does not record.
  if (order.arrivedAt)
    rows.push({ label: "You said you're here", value: formatClock(order.arrivedAt) });

  // Expo stamps. Grocery is excluded: its `togo_status` is an exit-pass check, not a kitchen bag —
  // printing "Ready 2:31 PM" over a basket the shopper already carries invents a wait that never was.
  if (kind !== "grocery") {
    if (order.togoReadyAt) rows.push({ label: "Ready", value: formatClock(order.togoReadyAt) });
    if (order.togoPickedUpAt)
      rows.push({ label: "Picked up", value: formatClock(order.togoPickedUpAt) });
  }

  // The money snapshot, rendered verbatim — the same fulfillment-time total the receipt prints.
  // "Order total", not "Total": on a split-tender order this is the whole table's bill, not this
  // diner's share, and the chip above it is headed "Your order". The receipt slip is the surface that
  // breaks a share down; the chip must not let a $14.22 payer read $42.67 as what they paid.
  if (order.totalCents > 0) rows.push({ label: "Order total", value: money(order.totalCents) });

  const context =
    kind === "pickup" && order.pickupSlot
      ? `Ready ${formatSlotLong(order.pickupSlot)}`
      : order.tableNumber != null
        ? `Table ${order.tableNumber}`
        : null;

  return {
    modeLabel: liveOrderModeLabel(kind),
    context,
    rows,
    itemSummary:
      order.itemCount > 0 ? `${order.itemCount} item${order.itemCount === 1 ? "" : "s"}` : null,
  };
}
