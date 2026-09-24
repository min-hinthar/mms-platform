import type { LineState } from "@mms/db";

/**
 * The single source for the DINER's line-state vocabulary (S2-audit S12). Plain module (no I/O):
 * imported by Checkout. A comped line reads "Comped" regardless of state (handled at the call site).
 * The staff map that lived here (`STAFF_STATE_COPY`, English-only) was retired in Phase 2a · send:
 * the drill-down's line tags are the staff dictionary's `table.line.state.*` now, so a Burmese
 * console no longer reads them in English.
 */

/** Diner-facing (the cart): warmer phrasing; a voided line reads "Removed". */
export const DINER_STATE_COPY: Record<LineState, string> = {
  draft: "Not sent yet",
  fired: "Sent to kitchen",
  in_progress: "Cooking",
  served: "Served",
  voided: "Removed",
};
