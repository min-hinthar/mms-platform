/**
 * Expo / bagging station shared types (S4.3a). Plain module (no "use server"/"server-only") so BOTH the
 * server read (lib/expo.ts) and the client board (ExpoBoard) import them. The expo is a STAFF surface: it
 * shows PAID orders with a takeaway portion (to-go food + grocery) awaiting bagging + hand-off, so nobody
 * pays and walks out without their bag. Money never appears here beyond the order total for identification.
 */

/** A takeaway line on an expo ticket. `fulfillment` is the destination — `togo` food (cooked by the
 *  kitchen, then bagged) vs `grocery` (never fired; bag-and-go). `notes` (W3b) is the allergy/request
 *  channel — the bagger needs "no peanuts" as much as the wok does (sauce packed separately, etc.). */
export type ExpoLine = {
  id: string;
  name: string;
  qty: number;
  modifiers: string[];
  fulfillment: "togo" | "grocery";
  notes: string | null;
};

/** One paid order's takeaway bag — an expo ticket. `status` is the order's togo_status (preparing → ready
 *  → [picked_up drops off the board]); `label` is what the expo calls out (table code, or the channel). */
export type ExpoTicket = {
  orderId: string;
  label: string;
  /** K2: the registered table (1–10) a dine-in to-go bag came from, or null for a pickup/scango bag
   *  (no table) or an unregistered sticker. Denormalized snapshot — durable past session expiry. */
  tableNumber: number | null;
  /** The session channel this came through, for context ('dinein' to-go vs 'pickup' vs 'scango'). */
  mode: string;
  /** W3e: the first name captured at pickup/scango checkout — expo finally has something to call out.
   *  Null when the diner skipped it (the short code is the fallback call-out). */
  customerName: string | null;
  /** The short order code (#A1B2C3, uuid tail) — matches the diner's /track + exit pass. */
  shortCode: string;
  status: "preparing" | "ready";
  /** Pickup orders carry a slot — the expo shows it as the honest ready-by time (no fabricated countdown). */
  pickupSlot: string | null;
  /** J5: the diner's "I'm here" stamp (null until they announce) — the board flags a waiting diner. */
  arrivedAt: string | null;
  lines: ExpoLine[];
  /** When the order was paid (ISO) — the board shows its age so a forgotten bag surfaces. */
  createdAt: string;
};

export type ExpoQueue = {
  tickets: ExpoTicket[];
  /** Server clock at snapshot (ISO) — the client seeds relative-time ticks from this (clock-skew safe). */
  serverNow: string;
};

/** W3d (K10): poll gate discriminant — an expired staff cookie / locked console redirects instead of
 *  wearing "Reconnecting…" forever (mirrors KitchenPoll). W10b `outage`: the platform is unreachable
 *  (not a cookie verdict) — the board freezes on its last-known queue instead of redirecting. */
export type ExpoPoll =
  | { ok: true; queue: ExpoQueue }
  | { ok: false; reason: "signin" | "locked" | "outage" };
