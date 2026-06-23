import type { LineState } from "@mms/db";

/**
 * The single source for line-state vocabulary (S2-audit S12) — so the diner cart and the staff surfaces
 * can't drift on what a state is CALLED. Plain module (no I/O): imported by Checkout (diner) and
 * StaffLineEditor / FloorDetailLive (staff). A comped line reads "Comped" regardless of state (handled at
 * the call site); these maps cover the kitchen-life states.
 */

/** Diner-facing (the cart): warmer phrasing; a voided line reads "Removed". */
export const DINER_STATE_COPY: Record<LineState, string> = {
  draft: "In your cart",
  fired: "Sent to kitchen",
  in_progress: "Cooking",
  served: "Served",
  voided: "Removed",
};

/** Staff-facing (the drill-down): terser; a voided line reads "Voided". */
export const STAFF_STATE_COPY: Record<LineState, string> = {
  draft: "In cart",
  fired: "Sent",
  in_progress: "Cooking",
  served: "Served",
  voided: "Voided",
};
