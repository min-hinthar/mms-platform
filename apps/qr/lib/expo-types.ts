/**
 * Expo / bagging station shared types (S4.3a). Plain module (no "use server"/"server-only") so BOTH the
 * server read (lib/expo.ts) and the client board (ExpoBoard) import them. The expo is a STAFF surface: it
 * shows PAID orders with a takeaway portion (to-go food + grocery) awaiting bagging + hand-off, so nobody
 * pays and walks out without their bag. Money never appears here beyond the order total for identification.
 */

/** A takeaway line on an expo ticket. `fulfillment` is the destination (togo food vs grocery); `state` is
 *  the kitchen lifecycle for to-go FOOD (so the expo knows if it's cooked yet) — grocery has no kitchen
 *  state (it's never fired), shown as bag-and-go. */
export type ExpoLine = {
  id: string;
  name: string;
  qty: number;
  modifiers: string[];
  fulfillment: "togo" | "grocery";
};

/** One paid order's takeaway bag — an expo ticket. `status` is the order's togo_status (preparing → ready
 *  → [picked_up drops off the board]); `label` is what the expo calls out (table code, or the channel). */
export type ExpoTicket = {
  orderId: string;
  label: string;
  /** The session channel this came through, for context ('dinein' to-go vs 'pickup' vs 'scango'). */
  mode: string;
  status: "preparing" | "ready";
  /** Pickup orders carry a slot — the expo shows it as the honest ready-by time (no fabricated countdown). */
  pickupSlot: string | null;
  lines: ExpoLine[];
  /** When the order was paid (ISO) — the board shows its age so a forgotten bag surfaces. */
  createdAt: string;
};

export type ExpoQueue = {
  tickets: ExpoTicket[];
  /** Server clock at snapshot (ISO) — the client seeds relative-time ticks from this (clock-skew safe). */
  serverNow: string;
};
