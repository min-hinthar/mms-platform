/**
 * Floor-view shared types (S1.2). Plain module (no "use server" / "server-only") so BOTH the server
 * data layer (lib/floor.ts) and the client components (FloorBoard, FloorDetailLive) can import them.
 * Money is integer CENTS end-to-end (format /100 only at the UI edge), parity with the rest of the app.
 */
// verify:slice-exempt — this module is TYPES plus one pure helper, and neither takes a mutant that
// says anything. A type declaration is erased before the code runs, so mutating one changes no
// behaviour at all: the guard for a field added here is the mutant on the module that POPULATES it
// (`lib/floor.ts`, which carries one per field this file gained). The single runtime function,
// `tableDisplay`, is exercised through `lib/floor-merge-promo.test.ts` — the merge refusal names the
// target table through it, and `floor/merge-refusal-names-the-wrong-table` fails when that name is
// wrong. Re-examine this line if the file ever grows a second function.
import type { LineState } from "@mms/db";
import type { RefundSummary } from "./refund-view";
import type { RegisterQueueRow } from "./register-queue";
import type { StaffSendCounts } from "./staff-send-view";
import type { InFlightHolder } from "./inflight-refusal";
import type { KdsThresholds } from "./kitchen-types";
import type { CounterArm as CounterArmOf } from "./counter-order";
import type { Handoff } from "./register-ui";

/** Phase 2f — how a counter order was started (re-exported for the client components). */
export type CounterArm = CounterArmOf;

/** A table's at-a-glance state on the floor. Payment-level only — the kitchen picture rides beside
 *  it as `FloorTable.kitchen` (Phase 2d), never folded into this word; a paid order rests at "paid". */
export type FloorStatus =
  | "seated" // active session, empty cart, no order yet
  | "ordering" // an open cart with items (building)
  | "paying" // the cart is locked for a single payer
  | "settling" // a split-tender freeze is open
  | "counter" // A1: the table asked to pay at the register (an ask, not a freeze — below paying/settling)
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
  /** K33 — the refund state of that settled order, from `lib/refund-view.ts`. null when there is no
   *  settled order. The CARD must read this before it prints `paidTotalCents`: the two are the same
   *  order, and showing the total beside "Paid" while the drill-down says the charge came back is
   *  one table telling two stories on one screen. */
  refund: RefundSummary | null;
  /** Tab lifecycle (S3.1): `none` until a server/diner formally opens a tab on this table; `trust`
   *  (settle-late, any tender) or `secure` (card-on-file, S3.2). Drives the floor "Tab" badge so a
   *  server reads at a glance which tables are running a tab vs. settling each round. */
  tab: "none" | "trust" | "secure";
  /** Silent ceiling flag (S3.3 / T11): a TRUST tab whose running subtotal has crossed the configured
   *  ceiling. A FLAG only — surfaced for a check-in, never an auto-convert or auto-charge. A secure tab
   *  (card on file) is never flagged. */
  tabOverCeiling: boolean;
  /** A1: when the table asked to pay at the counter (ISO), or null. Sorts the floor: the
   *  longest-waiting ask first, above every table that has not asked. */
  counterRequestedAt: string | null;
  /** Most recent activity (cart mutation, order, or session open) as an ISO instant. */
  lastActivityAt: string;
  // ── Phase 2d · floor ──
  /** When the session was opened (`table_sessions.created_at`) — the card's "Opened {ago}". What
   *  the data records, not a claim about when THIS party sat: a session outlives payment until
   *  Clear table. */
  openedAt: string;
  /** The table's kitchen picture (`foldFloorKitchen`, lib/floor-kitchen.ts) — null when nothing on
   *  it is unsent, cooking, ready or served. */
  kitchen: FloorKitchen | null;
};

/**
 * Phase 2d · floor — one table's kitchen picture, folded once server-side from the open cart and
 * the table's paid carts (`foldFloorKitchen`). Counts are dish UNITS (qty), like every count here.
 */
export type FloorKitchen = {
  /** What staff can Send right now — `staffOwedSendUnits(hostPresent, staffSendCounts(…))` (2a):
   *  every sendable dish on a hostless table, only staff-added ones on a host table. */
  notSent: number;
  /** Fired or cooking past the send grace (`PULSE_COOKING_STATES`), open and paid carts alike. */
  inKitchen: number;
  /** Served with `bumped_at` inside the wall's `PULSE_PASS_LINGER_MS` — the wall's "Ready to serve". */
  up: number;
  /** Phase 2d · Codex round 1 · ready — one key per served line inside that same window, its
   *  bump's `<line id>@<bumped_at>` (`floor-kitchen.ts`). The floor's cue reads these, never `up`:
   *  a count holds still when one dish leaves the window as another comes out. */
  upKeys: string[];
  /** Served before that window (or with no bump stamp). */
  done: number;
  /** The OLDEST in-kitchen line's fire time (ISO) — the instant the table's oldest ticket counts from. */
  oldestFireAt: string | null;
};

export type FloorSnapshot = {
  tables: FloorTable[];
  /** A4·2 — the open COUNTER orders (`reg-` and kiosk pickup sessions with an open cart), read by
   *  `readRegisterQueue` on the same poll. The floor's `tables` never carry these sessions, so the
   *  one list `mergeFloorRows` builds cannot key a session twice. */
  counter: CounterFloorRow[];
  /** The counter read hit its cap — the newest orders are not in `counter`, and the board says so. */
  counterTruncated: boolean;
  /** Server clock at snapshot time (ISO) — the client seeds its relative-time ticks from this so a
   *  clock skew between the staff device and the server doesn't show "in 3m" for a fresh table. */
  serverNow: string;
  // ── Phase 2d · floor ──
  /** Every ACTIVE registered table number, ascending (`qr_tables`) — the strip's one tile per table.
   *  Required, never defaulted: an absent registry would silently hide the only way to start one. */
  registry: number[];
  /** The kitchen's own lateness thresholds (`mms_kds_config`, or the defaults) — the wait pill reads
   *  `kdsUrgency` with these, never a second 8/12. */
  thresholds: KdsThresholds;
  // ── Phase 2d · review ──
  /** The paid-cart kitchen read came back full this poll (`lib/floor.ts`, floor #6): every table's
   *  `kitchen` is null because it is UNKNOWN, not empty, and the board says so once in its region.
   *  Required, never defaulted — a producer that forgot it would draw "nothing in the kitchen". */
  kitchenUnknown: boolean;
};

/** W10b: the floor poll discriminant (K10 parity with KitchenPoll/ExpoPoll). A failed gate/read used
 *  to render as an EMPTY room ("the floor is quiet" over live tables) — `signin` redirects honestly,
 *  `outage` freezes the board on its last-known snapshot. */
export type FloorPoll =
  | { ok: true; snapshot: FloorSnapshot }
  // Phase 2d · floor — `locked` (K14): a console locked from another tab stops drawing the room.
  | { ok: false; reason: "signin" | "outage" | "locked" };

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
  /** Phase 2a · send — this line is what the Send fires (`sendFiresLine`): a dine-in session's DRAFT
   *  whose fulfillment is dine-in (`mms_fire_cart`), or — Phase 2f · Codex r1, while pay at pickup
   *  is on — a counter order's to-go DRAFT (`mms_fire_counter_cart`). The editor tags it "Not sent"
   *  and an unsaved note on it holds the Send (`sendHoldFrom`); a table's to-go draft (cooks at pay)
   *  and every settled record line are false. */
  sendable: boolean;
  /** Comped (S2.3) — given away free; the kitchen still makes it, the charge excludes it. */
  comped: boolean;
  /** An open void/comp approval request is pending for this line (S2.4) — a manager resolves it from the
   *  queue; the line is unchanged until then, and the staff editor shows "approval requested" not a new
   *  Void/Comp button (so a second request can't stack). */
  pendingApproval: boolean;
  /** W3b: the kitchen note (allergy/request). Staff set it on DRAFT lines; frozen once fired. */
  notes: string | null;
  /** K33: the chosen options, as the server-priced labels stored on the line ("No egg", "Extra spicy").
   *  A server reading a table back needs what was CHOSEN, not just the dish — the floor was the one
   *  staff surface that never carried them. Empty array when the line has none. */
  modifiers: string[];
  /** K33: how much of THIS line has been refunded, in cents. Always 0 on an open-cart line — a cart
   *  line cannot be refunded, only voided. On a settled line it is `qr_order_items.refunded_cents`.
   *
   *  ⚠️ It exists because a PARTIAL refund leaves `qr_orders.status` at 'paid', so the settled record
   *  renders through the ordinary path with nothing about it that says money came back. Rendering
   *  the line at full price there tells staff the guest paid for a dish the restaurant already
   *  returned the money for. */
  refundedCents: number;
  // ── Phase 2c · pad ──
  /** The dish this line is (`qr_cart_items.menu_item_id` — a soft ref: a grocery line carries a
   *  barcode). The order pad's tile badge counts the confirmed units per dish from it. Null on a
   *  settled record line (the pad never reads a settled record). */
  menuItemId: string | null;
  /** Where the line goes — the ticket groups a to-go draft at a dine-in table apart ("goes to the
   *  kitchen when paid"). A settled record line reads "dinein" (a record is never re-grouped). */
  fulfillment: "dinein" | "togo" | "grocery";
  /** The catalog's Burmese name (`catalogNameMy`-validated) — advisory: a failed name read gives
   *  null and the line renders its English snapshot, never an outage. */
  nameMy: string | null;
  /** Per-slot Burmese for `modifiers` (`pairModifiersMy`), each null where unknown. */
  modifiersMy: (string | null)[];
};

export type TableMemberView = { seatId: string; name: string; isHost: boolean };

export type TableDetail = {
  sessionId: string;
  /** K33: these lines came from the SETTLED order (`qr_order_items`), not an open cart — the table has
   *  paid and `qr_carts.status` is no longer 'open'. The list is a read-only record of what was
   *  ordered, so the surface says "Ordered" rather than "Order so far" and never offers an editor.
   *  The "so far" money row stays hidden: `itemCount`/`runningSubtotalCents` are open-cart bindings
   *  and a settled table's authoritative figure is `paidTotalCents`. */
  settled: boolean;
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
  /** W17c-3 — the tip BASE the server uses (subtotal − discount, BEFORE tax). Percentages are
   *  offered against this on every surface; `settleTotalCents` is tax-inclusive and offering
   *  against it makes the same "20%" label charge more at the register than at the kiosk. */
  settleTipBaseCents: number | null;
  /** W17c-3 — the tip a KIOSK guest chose before walking to the counter. `null` means they were
   *  never asked (every non-kiosk cart); `0` means they were asked and chose to leave nothing. The
   *  settle UI shows those differently, so the distinction has to survive the read. */
  intendedTipCents: number | null;
  /** A1: when the table asked to pay at the counter (ISO), or null — the drill-down shows the ask
   *  above the settle controls so the register knows the table is waiting, not still eating. */
  counterRequestedAt: string | null;
  paidTotalCents: number | null;
  /** K33 — the refund state of the settled order behind `paidTotalCents`, from `lib/refund-view.ts`,
   *  which is the ONE derivation of this question in the app. null when no settled order exists.
   *
   *  ⚠️ SUMMARIZED HERE RATHER THAN HANDED OVER AS PARTS, deliberately. `summarizeRefund` reconciles
   *  two facts that can legitimately disagree for a beat (`status` flips on the webhook, the column
   *  bumps in-app) and always answers the one claiming LESS was paid. A surface that took
   *  `refunded_cents` and `status` and decided for itself would be a second derivation of a money
   *  question, which is the drift the W17 rules name — and this repo has already shipped
   *  "Paid in full" over returned money once (registry M2). */
  refund: RefundSummary | null;
  /** K33 — how many settled orders this table has (rounds it has paid for). 0 when none. The lines
   *  and `paidTotalCents` describe the LATEST one, matching the floor board's own reduction, so a
   *  count above 1 means the record on screen is one round of several and must say so. */
  settledOrderCount: number;
  /** Phase 2d · Codex round 1 — the id of the table's LATEST paid (or refunded) order, the same row
   *  `paidTotalCents` describes; null when none. The paid card compares it with its own `orderId`
   *  (`handoffStillCurrent`): a round that opened and paid while the screen looked elsewhere is seen
   *  only here, as a newer order, never as a live cart. */
  paidOrderId: string | null;
  /** M212 — true when the settled-order read hit its cap, so `settledOrderCount` is a floor and the
   *  surface must render it as "N+" rather than as an exact total it cannot know. */
  settledOrderCountCapped: boolean;
  /** Phase 2g · P2em (D2) — a SETTLED counter order's #CODE card, built on the server from the paid
   *  row this detail already read (`serverCounterHandoff`, lib/register-ui): the session the webhook's
   *  best-effort close left active shows its card on any device, with no panel and no tab stash. Null
   *  (or absent) off a counter order, over an open cart, and whenever money came back. The surface
   *  renders it only when it has no card of its own — this tab's card (with the tender and change)
   *  wins. */
  serverHandoff?: Handoff | null;
  /** P3 — the promo code on the open cart, or null. The drill-down needs it for two things staff
   *  could not do before: SEE that a discount is in play before settling a table in cash, and REMOVE
   *  it (OPEN-ITEMS P2e — the merge refusal named that action for months while nothing implemented
   *  it). Null once the cart is settled/absent, like every other open-cart field here. */
  promoCode: string | null;
  /** P3 — the promo's DELIVERED contribution in cents, from the SAME `getCartTotals` call that
   *  produced `settleTotalCents`, so those two AMOUNTS cannot disagree.
   *
   *  ⚠️ That guarantee does NOT extend to the code/amount pair the drill-down renders side by side,
   *  and an earlier version of this comment implied it did. `promoCode` is read in the `Promise.all`
   *  batch and this figure comes off a LATER awaited `getCartTotals`, so a diner applying a
   *  different code between the two statements makes the card show one code beside the other code's
   *  amount, for one round trip. Accepted rather than closed: the 5s poll corrects it, the settle
   *  button charges the server-derived total either way, and folding the read into the batch would
   *  mean pricing every table on the floor list. Named so the next reader does not have to re-derive
   *  the window from two line numbers.
   *
   *  ⚠️ NOT the apply-time quote from `mms_promo_check`. A pinned `promo_granted_cents` outranks
   *  the live derivation (M70) and the quote never reads it, and M22's reward-first clamp can take
   *  the delivered promo to 0 while the quote stays whole — so the two are legitimately different
   *  numbers. Showing the quote beside a settle total derived from the other would be the "computed
   *  in one place, quoted in another" drift the W17 rules name. Null when there is no open cart with
   *  items (there is no total for it to belong to). */
  settlePromoCents: number | null;
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
  /** Phase 2c · register (P2w) — WHO holds the in-flight payment (lib/inflight-refusal): a guest's
   *  phone, the register's own attempt, or unsure. Null when `paymentInFlight` is false. The
   *  page's paying banner says the holder's sentence, never "their phone" by default. */
  paymentHolder: InFlightHolder | null;
  /** Phase 2a · send — the session has a diner host (`host_seat` set): create-intent's binding for
   *  "someone at the table can send". Decides the Send's emphasis (owner decision #3). */
  hostPresent: boolean;
  /** Phase 2a · send — the table's send counts, computed ONCE here from the open cart's rows
   *  (`staffSendCounts`; `sendable` is `kitchenDraftUnitsFromRows` on a dine-in session). All zero
   *  with no open cart. */
  send: StaffSendCounts;
  /** The DATABASE clock (`mms_now`) on a counter order — the grace behind `unpaidSent` is measured
   *  on it; the process clock otherwise. */
  serverNow: string;
  // ── Phase 2f · P2v — a counter order may cook before it is paid ──
  /** A staff-minted `reg-` counter order (`isCounterOrder`) — the ONE predicate, never
   *  `label.startsWith("reg-")` at a call site. */
  counterOrder: boolean;
  /** The counter order's arm (`qr_carts.counter_arm`); null off a counter order, with no open cart,
   *  or on a row that predates the column (reads as a walk-up). */
  counterArm: CounterArm | null;
  /** The open cart's `customer_name` (every mode; the page shows it only for counter orders). */
  customerName: string | null;
  /** A counter order with food PAST its grace (DB clock) on its open cart — "Unpaid — collect at
   *  pickup". ONE binding: `counterOrder && cart open && send.counterSentPastGrace`. */
  unpaidSent: boolean;
  /** The open-cart lines `counterSentLine` holds true for (DB clock) — exactly the set a no-show
   *  writes off. Empty off a counter order. */
  sentLineIds: string[];
  /** The open-cart lines `counterNoShowDropped` holds true for, on the SAME DB clock as `sentLineIds`
   *  — what a no-show drops without writing off: every draft and every in-grace `fired` line, comped
   *  or grocery included (the SQL reverts those and cancels the cart). Disjoint from `sentLineIds`.
   *  Empty off a counter order. */
  droppedLineIds: string[];
  /** The open-cart lines that are `counterKitchenLine` AND comped, on the SAME DB clock — a no-charge
   *  dish the kitchen already has. A no-show neither writes it off (the comp is already an audited
   *  loss) nor drops it, but cancelling the cart takes it off the kitchen screen, so the no-show sheet
   *  says so (never as a loss, never with an amount). Disjoint from both sets above. Empty off a
   *  counter order. */
  compedKitchenLineIds: string[];
  /** `surfaceOpen("payAtPickup")` — the counter Send is DRAWN only while it is true. */
  payAtPickup: boolean;
  /** The merge tool may be offered: an open cart, and not a counter order with food in the kitchen
   *  (the server refuses those — `mergeCounterRefusal`). */
  mergeable: boolean;
};

/** Phase 2f — a counter-queue row as the floor draws it: whether its food is in the kitchen
 *  unpaid, and its kitchen row (the SAME `foldFloorKitchen` the tables use, mode pickup). Kiosk rows
 *  carry `false` / `null` (they never cook before payment). */
export type CounterFloorRow = RegisterQueueRow & {
  unpaidSent: boolean;
  kitchen: FloorKitchen | null;
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

/** `code: "sent"` (Phase 2f) — a counter order whose food reached the kitchen: the page says the
 *  no-show's words instead of the server's sentence. */
export type ClearTableResult = { ok: true } | { ok: false; error: string; code?: "sent" };

/** W10b: the drill-down read result. `closed` is the ONLY state that bounces back to the floor — a
 *  cleared table is gone, but an unreadable one ISN'T (the old `null` conflated them, so an outage
 *  mid-service kicked staff off a live table's order). `signin` mirrors the boards' K10 redirect;
 *  `outage` freezes the last-known detail. */
export type TableDetailResult =
  | { kind: "detail"; detail: TableDetail }
  /** Phase 2d · split — the session's own label and number when the row still exists (a table
   *  cleared or merged away), so a pane opened straight onto it can name it and find the live
   *  namesake a new party sat at. Absent for a malformed id or a vanished row. */
  | {
      kind: "closed";
      label?: string;
      tableNumber?: number | null;
      /** Phase 2g · P2em (D2) — a closed COUNTER order's #CODE card, from its latest order row
       *  (`serverCounterHandoff`): the counter session closes behind its settle, so this is where a
       *  card lost with its panel or its tab is found again. Absent off a counter session; null when
       *  there is no unrefunded paid order, or its read failed (logged — never an outage). */
      handoff?: Handoff | null;
    }
  | { kind: "signin" }
  | { kind: "outage" };

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
