/**
 * Floor-view shared types (S1.2). Plain module (no "use server" / "server-only") so BOTH the server
 * data layer (lib/floor.ts) and the client components (FloorBoard, FloorDetailLive) can import them.
 * Money is integer CENTS end-to-end (format /100 only at the UI edge), parity with the rest of the app.
 */

/** A table's at-a-glance state on the floor. Payment-level only — kitchen statuses (fired/served)
 *  arrive with S2's line lifecycle; until then a paid order rests at "paid". */
export type FloorStatus =
  | "seated" // active session, empty cart, no order yet
  | "ordering" // an open cart with items (building)
  | "paying" // the cart is locked for a single payer
  | "settling" // a split-tender freeze is open
  | "paid"; // a paid order exists and the cart isn't actively building

export type FloorTable = {
  sessionId: string;
  /** The physical table sticker id / dine-in join code — the label a server scans for. */
  label: string;
  mode: "dinein" | "scango" | "pickup";
  status: FloorStatus;
  partySize: number;
  hostName: string | null;
  /** Open-cart running totals (pre-tax "so far" — NOT a charge; the authoritative total is derived at
   *  checkout). null when there's no open cart with items. */
  itemCount: number;
  runningSubtotalCents: number;
  /** The authoritative total of a settled order on this table, when one exists (cents). */
  paidTotalCents: number | null;
  /** Most recent activity (cart mutation, order, or session open) as an ISO instant. */
  lastActivityAt: string;
};

export type FloorSnapshot = {
  tables: FloorTable[];
  /** Server clock at snapshot time (ISO) — the client seeds its relative-time ticks from this so a
   *  clock skew between the staff device and the server doesn't show "in 3m" for a fresh table. */
  serverNow: string;
};

/** One line on the per-table read-only drill-down. by_seat → which guest added it (split attribution). */
export type TableLineView = {
  id: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  bySeatName: string | null;
};

export type TableMemberView = { seatId: string; name: string; isHost: boolean };

export type TableDetail = {
  sessionId: string;
  /** The open cart's id, when one exists — the detail view subscribes to its line changes for live
   *  updates (qr_carts.updated_at isn't bumped, so we watch qr_cart_items by cart_id directly). */
  cartId: string | null;
  label: string;
  mode: "dinein" | "scango" | "pickup";
  status: FloorStatus;
  members: TableMemberView[];
  lines: TableLineView[];
  itemCount: number;
  runningSubtotalCents: number;
  /** Authoritative all-in total (subtotal − discount + service + tax, tip excluded) for a CASH settle,
   *  in cents — the amount the "Settle in cash" action will record. null when there's no open cart with
   *  items. Computed by getCartTotals (the single tax engine), so the staff sees the real charge, not a
   *  pre-tax guess. Only on the detail (one table), never the floor hot path. */
  settleTotalCents: number | null;
  paidTotalCents: number | null;
  lastActivityAt: string;
  /** True while a single-payer lock or a split freeze is live — clear-table / staff write / cash settle
   *  are all refused mid-payment. */
  paymentInFlight: boolean;
  serverNow: string;
};

export type ClearTableResult = { ok: true } | { ok: false; error: string };

/** A table the current (source) table can be merged INTO (S1.4). Same mode, active, has an open cart, not
 *  mid-payment — the legible candidates a server picks from in the explicit merge tool. */
export type MergeCandidate = {
  sessionId: string;
  label: string;
  mode: "dinein" | "scango" | "pickup";
  itemCount: number;
  partySize: number;
};

/** Result of a one-tap merge (S1.4). `movedCount` = units folded into the target (for the success toast);
 *  the source table is now closed and the caller routes to the target. */
export type MergeResult =
  | { ok: true; movedCount: number; targetSessionId: string }
  | { ok: false; error: string };
