/**
 * Floor-view shared types (S1.2). Plain module (no "use server" / "server-only") so BOTH the server
 * data layer (lib/floor.ts) and the client components (FloorBoard, FloorDetailLive) can import them.
 * Money is integer CENTS end-to-end (format /100 only at the UI edge), parity with the rest of the app.
 */
import type { LineState } from "@mms/db";

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
  /** K2: the registered table number (1–10), or null for an unregistered/legacy sticker or a
   *  host-mint join code — the floor flags null as "unregistered" so staff map it in the registry. */
  tableNumber: number | null;
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
  /** Tab lifecycle (S3.1): `none` until a server/diner formally opens a tab on this table; `trust`
   *  (settle-late, any tender) or `secure` (card-on-file, S3.2). Drives the floor "Tab" badge so a
   *  server reads at a glance which tables are running a tab vs. settling each round. */
  tab: "none" | "trust" | "secure";
  /** Silent ceiling flag (S3.3 / T11): a TRUST tab whose running subtotal has crossed the configured
   *  ceiling. A FLAG only — surfaced for a check-in, never an auto-convert or auto-charge. A secure tab
   *  (card on file) is never flagged. */
  tabOverCeiling: boolean;
  /** Most recent activity (cart mutation, order, or session open) as an ISO instant. */
  lastActivityAt: string;
};

export type FloorSnapshot = {
  tables: FloorTable[];
  /** Server clock at snapshot time (ISO) — the client seeds its relative-time ticks from this so a
   *  clock skew between the staff device and the server doesn't show "in 3m" for a fresh table. */
  serverNow: string;
};

/** One line on the per-table drill-down. by_seat → which guest added it (split attribution). */
export type TableLineView = {
  id: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  bySeatName: string | null;
  /** The line's menu item is 86'd — staff can still decrease/remove it, but not add more (S1-audit S4). */
  soldOut: boolean;
  /** Kitchen-life state (S2.1) — drives the staff line controls: a 'draft' line edits via the stepper; a
   *  fired/cooking/served line is post-fire (the void/comp loss path, S2.3); 'voided' is terminal. */
  state: LineState;
  /** Comped (S2.3) — given away free; the kitchen still makes it, the charge excludes it. */
  comped: boolean;
  /** An open void/comp approval request is pending for this line (S2.4) — a manager resolves it from the
   *  queue; the line is unchanged until then, and the staff editor shows "approval requested" not a new
   *  Void/Comp button (so a second request can't stack). */
  pendingApproval: boolean;
};

export type TableMemberView = { seatId: string; name: string; isHost: boolean };

export type TableDetail = {
  sessionId: string;
  /** The open cart's id, when one exists — the detail view subscribes to its line changes for live
   *  updates (qr_carts.updated_at isn't bumped, so we watch qr_cart_items by cart_id directly). */
  cartId: string | null;
  label: string;
  /** K2: the registered table number (1–10), or null for an unregistered sticker / host-mint code. */
  tableNumber: number | null;
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
  /** Tab lifecycle (S3.1) — `none`/`trust`/`secure`. When not `none`, the drill-down shows a "Tab
   *  open" badge + the open-since time, and the settle action reads "Close tab". */
  tab: "none" | "trust" | "secure";
  /** When the tab was opened (ISO), for the "open since" line; null when `tab === "none"`. */
  tabOpenedAt: string | null;
  /** Server-discretion gating (S3.3). The configured silent ceiling (cents) for the "Tab at $X" copy. */
  ceilingCents: number;
  /** T11: a TRUST tab's running subtotal has crossed the ceiling — surface "convert or check in?", never
   *  auto-act. False for a secure tab (already card-backed) or below the ceiling. */
  tabOverCeiling: boolean;
  /** T12: a config-driven courtesy hint to consider a secure tab — `'party'` (≥ nudge_party_size) or
   *  `'age'` (an open tab past nudge_tab_age_min), else null. Suppressed once the tab is secure. A system
   *  hint paired with courtesy scripting, never unaided per-customer judgment. */
  nudgeSecure: "party" | "age" | null;
  lastActivityAt: string;
  /** True while a single-payer lock or a split freeze is live — clear-table / staff write / cash settle
   *  are all refused mid-payment. */
  paymentInFlight: boolean;
  serverNow: string;
};

/** K2: the human table label for staff surfaces — the registered number (bare, e.g. "7"), or a
 *  flagged fallback to the raw sticker token so an unregistered/legacy sticker stays visible +
 *  actionable (staff map it in the registry), never a silent blank. Returns the BARE value so every
 *  call site keeps its existing `Table {…}` prefix. Plain fn — server + client both import it. */
export function tableDisplay(t: { tableNumber: number | null; label: string }): {
  text: string;
  unregistered: boolean;
} {
  return t.tableNumber != null
    ? { text: String(t.tableNumber), unregistered: false }
    : { text: t.label, unregistered: true };
}

export type ClearTableResult = { ok: true } | { ok: false; error: string };

/** A table the current (source) table can be merged INTO (S1.4). Same mode, active, has an open cart, not
 *  mid-payment — the legible candidates a server picks from in the explicit merge tool. */
export type MergeCandidate = {
  sessionId: string;
  label: string;
  /** K2: the registered table number (1–10), or null. */
  tableNumber: number | null;
  mode: "dinein" | "scango" | "pickup";
  itemCount: number;
  partySize: number;
};

/** Result of a one-tap merge (S1.4). `movedCount` = units folded into the target (for the success toast);
 *  the source table is now closed and the caller routes to the target. */
export type MergeResult =
  | { ok: true; movedCount: number; targetSessionId: string }
  | { ok: false; error: string };
