/**
 * KDS shared types (S2.1b, reshaped by W3). Plain module (no "use server" / "server-only") so BOTH the
 * server read (lib/kitchen.ts) and the client board (KdsBoard) import them. The KDS is a STAFF surface:
 * it shows the live fire queue — every fired line from EVERY channel (dine-in send, to-go fired at
 * checkout, pickup/scango fired at settlement) that isn't yet served — grouped into per-cart tickets.
 * Money never appears here; the kitchen cares about items, not amounts.
 */

/** Station tag (W3d): a coarse routing chip derived server-side from the item's menu category. Data is
 *  station-aware from day one so a second physical screen is a client-side filter, never a schema change. */
export type KitchenStation = "wok" | "cold" | "drinks";

/** A single fired line on a ticket. `state` drives the per-line check-off (fired ⇒ "Start",
 *  in_progress ⇒ "Ready"). Modifiers are the kitchen-relevant choices, FULL-contrast on the board —
 *  they carry the allergy-adjacent picks; `notes` is the diner/staff free-text allergy channel (W3b),
 *  rendered as the highest-contrast element on the card. */
export type KitchenLine = {
  id: string;
  /** W23a — the catalog id behind this line, so the cook can 86 the DISH from the ticket that just
   *  told them it is out. Null when the line is a grocery barcode rather than a menu item (the soft
   *  ref also carries those), which is exactly when there is nothing to 86. */
  menuItemId: string | null;
  /** W23a — whether that dish is ALREADY off the menu. The board reads it two ways: it is the
   *  `expectedSoldOut` the compare-and-swap is made against (never a hardcoded guess), and it is what
   *  turns the ticket's 86 control from an offer into a statement. */
  soldOut: boolean;
  name: string;
  qty: number;
  /** Human-readable modifier labels (e.g. ["Spicy", "No egg"]) — empty when the line has none. */
  modifiers: string[];
  /** The kitchen note ("no peanuts — allergy"), or null. Bounded at 160 (Zod + column CHECK). */
  notes: string | null;
  state: "fired" | "in_progress";
  /** When the line fired / will fire (ISO). Held lines (scheduled pickup) carry a FUTURE fire_at. */
  firedAt: string;
  /** S4.2 destination routing: `togo` lines get a "To-go" badge so the cook/expo bags them instead of
   *  running them to the table. `dinein` is the default (no badge). */
  fulfillment: "dinein" | "togo" | "grocery";
  station: KitchenStation;
};

/** The order channel a ticket arrived through — the SYMBOLIC dimension on the card (SPEC-KDS §1).
 *  Urgency (the color dimension) ages dine-in from the send and pickup/scango from fire time. */
export type KitchenChannel = "dinein" | "pickup" | "scango";

/** One cart's worth of live kitchen lines — a ticket. Grouped by CART (not session) so the ticket-level
 *  bump has one unambiguous parent; ordered oldest-fire-first so the kitchen works the queue head-down. */
export type KitchenTicket = {
  cartId: string;
  sessionId: string;
  channel: KitchenChannel;
  /** The table sticker id / label the expo calls out (dine-in fallback identity). */
  label: string;
  /** K2: the registered table number the cook/expo calls out, or null for an unregistered sticker
   *  or a pickup/scango ticket (those headline the customer name + short code instead). */
  tableNumber: number | null;
  /** W3e: the optional first name captured at pickup/scango checkout, or null. */
  customerName: string | null;
  /** The short order code (#A1B2C3) for pickup/scango tickets — the same uuid-tail derivation the
   *  grocery exit pass shows, so the kitchen and the diner's phone always agree. Null for dine-in. */
  shortCode: string | null;
  /** The chosen pickup slot (ISO) — shown on HELD cards so the cook sees WHEN it's due. */
  pickupSlot: string | null;
  /** W3a HELD: a scheduled order whose fire time hasn't arrived. Renders dimmed with its slot time;
   *  turns live (and chimes) when the clock passes fire_at. Manual fire-early allowed. */
  held: boolean;
  lines: KitchenLine[];
  /** Earliest fire on the ticket (its age for the urgency strip; the due time while held). */
  firedAt: string;
};

/** Aging thresholds (minutes) per channel + the re-chime window — read from mms_kds_config so the
 *  metric and the urgency colors can never disagree (SPEC-KDS §7). */
export type KdsThresholds = {
  dineinAmberMin: number;
  dineinRedMin: number;
  pickupAmberMin: number;
  pickupRedMin: number;
  rechimeSec: number;
};

/** Today's bump-derived metrics (mms_kds_stats): avg fire→bump seconds + tickets served since local
 *  midnight. Zero-state renders as "—", never a fabricated number. */
export type KdsStats = { avgSecs: number; servedToday: number };

export type KitchenQueue = {
  tickets: KitchenTicket[];
  /** Server clock at snapshot (ISO) — the client seeds elapsed-time ticks from this (clock-skew safe). */
  serverNow: string;
  thresholds: KdsThresholds;
  stats: KdsStats;
};

/**
 * W3d (K10): the poll result discriminant. An expired staff cookie or a locked console must surface as
 * a REDIRECT, never an eternal "Reconnecting…" — the client can't tell a thrown 401 from a dropped
 * socket (prod redacts thrown Server Action errors), so the gate outcome rides the return value.
 * W10b adds `outage`: the platform is unreachable, which is NOT a verdict about the cookie — the board
 * keeps its last-known queue (frozen banner) instead of redirecting a working kitchen to login.
 */
export type KitchenPoll =
  | { ok: true; queue: KitchenQueue }
  | { ok: false; reason: "signin" | "locked" | "outage" };
