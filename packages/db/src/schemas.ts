import { z } from "zod";

/**
 * Runtime validation at the trust boundary (decision #4 in docs/BACKEND_ARCHITECTURE.md §5).
 * Every Server Action / route handler parses its external input through one of these BEFORE it
 * touches the DB. The rules: ids are `uuid`, money/qty are non-negative `int` CENTS, user strings
 * are length-capped (RED-TEAM: cap + escape names), and tip/promo bounds keep a hostile client
 * from steering an amount. Pricing stays server-authoritative — these only gate the *shape* of
 * what the client may assert (an item id + modifier ids), never a price.
 *
 * Isomorphic (Zod runs on the client too), but the parse always happens server-side.
 */

const uuid = z.string().uuid();
/** A guest's display name is user-controlled → cap length; JSX escapes it at render. */
const displayName = z.string().trim().min(1).max(40);

/**
 * POST /api/session — mint/join a table session.
 *
 * `qrCode` is the session key AND (for dine-in group cart, M3·P3.1) the shareable join code: a
 * scanned sticker token, the host's invite code, or a solo per-device id. It is OPTIONAL — when a
 * host starts a fresh dine-in session with no sticker, the omit signals the SERVER to mint an
 * unguessable code (generateJoinCode) and return it for the host to share. Never trust a client
 * price; this only shapes the join key + the optional display name.
 */
export const sessionMintInput = z.object({
  qrCode: z.string().trim().min(1).max(100).optional(),
  mode: z.enum(["dinein", "scango", "pickup"]).default("dinein"),
  name: displayName.default("Guest"),
  // join-ONLY (M3·P3.1): set when joining via the host's invite code (`?j=`). The server must NOT
  // create a session if the code has no active match — a fat-fingered code shouldn't mint a phantom
  // table with the typer as host. A scanned sticker (`?t=`) leaves this false → first scanner may
  // provision the table.
  joinOnly: z.boolean().default(false),
});

/** setDisplayName — a member renames THEIR OWN seat (presence guest list). Server re-verifies the
 *  caller is a member of `sessionId`; the name is length-capped + JSX-escaped at render (XSS). */
export const setDisplayNameInput = z.object({
  sessionId: uuid,
  name: displayName,
});

/** addItem — the client asserts only an item id + chosen modifier OPTION ids (never a price). */
export const addItemInput = z.object({
  cartId: uuid,
  menuItemId: uuid,
  modifierIds: z.array(uuid).max(20).default([]),
});

/** setQty — `0` deletes the line; cap qty so one line can't balloon the order. */
export const setQtyInput = z.object({
  cartItemId: uuid,
  qty: z.number().int().min(0).max(99),
});

/** assignLine (M3·P3.3a) — reassign a cart line to a seat for by-person split. The server verifies
 *  the seat is a member of this session + canMutateLine; the client only asserts the two ids. */
export const assignLineInput = z.object({
  cartItemId: uuid,
  seatId: uuid,
});

/** openSettlement (M3·P3.3b) — start a split-tender. `mode` mirrors the qr_cart_shares derivation +
 *  the SplitSection toggle; bounded here AND by the derivation, never a free string. */
export const splitModeInput = z.object({
  mode: z.enum(["even", "by_person"]),
});

/** applyPromo — the code is validated server-side against `promo_codes`; this only shapes it. */
export const applyPromoInput = z.object({
  cartId: uuid,
  code: z.string().trim().min(1).max(40),
});

/**
 * create-intent — the client sends a cart id + a tip RATE only; the amount is derived by
 * getCartTotals. Tip is capped at 50% so a hostile client can't inflate the charge via metadata.
 */
export const createIntentInput = z.object({
  cartId: uuid,
  tipRate: z.number().min(0).max(0.5).default(0),
});

/** scanAdd (grocery) — a scanned EAN-8(8)/UPC-A(12)/EAN-13(13)/GTIN-14(14) barcode (8–14 digits),
 *  never a price. An unknown-length match just misses the catalog lookup (handled honestly). */
export const scanInput = z.object({
  cartId: uuid,
  barcode: z.string().regex(/^\d{8,14}$/, "barcode must be 8–14 digits"),
});

/** searchGroceryItems — the Scan & Go name-search fallback when a barcode won't scan / isn't known.
 *  Catalog read only (never a price); length-capped so a hostile client can't drive a huge ILIKE. */
export const grocerySearchInput = z.object({
  query: z.string().trim().min(2).max(40),
});

/** getCartView — a member-gated read of a cart's lines + server-authoritative totals. */
export const cartViewInput = z.object({ cartId: uuid });

/** setPickupSlot — the client asserts a cart id + a chosen slot (ISO instant). The server re-validates
 *  it against live availability + capacity, so a stale/forged/full slot is rejected, never trusted. */
export const setPickupSlotInput = z.object({
  cartId: uuid,
  slot: z.string().datetime({ offset: true }),
});

/**
 * Shape of the `POST /api/session` RESPONSE — parsed on the client so a contract drift (a deploy
 * skew, a missing `cartId`) surfaces as a hard parse error instead of silently degrading to "no
 * cart". "Parse at the trust boundary" cuts both ways: validate what we receive, not just what we send.
 */
export const sessionMintOutput = z.object({
  sessionId: uuid,
  seat: uuid,
  role: z.enum(["host", "guest"]),
  cartId: uuid,
  // The resolved session key — the code other phones scan/enter to join this dine-in session.
  // For solo modes it's the per-device id (the UI doesn't surface it).
  joinCode: z.string().min(1),
});

/**
 * provisionStaff (S1.1a) — an OWNER creates a staff account (server/manager/owner). The email is
 * the magic-link / OTP login identity; the server (service-role) creates the auth user + the staff
 * row. Owner-gated server-side (is_staff_at_least('owner')); this only shapes the input. `role` is
 * bounded to the three roles (never a free string); `displayName` is length-capped (mirrors the
 * column CHECK length 1..80) and JSX-escaped at render.
 */
export const provisionStaffInput = z.object({
  // Lower-cased so the stored value matches the case-insensitive email-allowlist lookups
  // (is_staff `lower(email)` + getStaffAuth `.eq("email", …toLowerCase())`).
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["server", "manager", "owner"]),
  displayName: z.string().trim().min(1).max(80),
});

/** setStaffActive (S1.1a) — an owner offboards/reinstates a staff member (never deletes the audit
 *  trail; flips `active`, which is_staff/is_staff_at_least gate on). Owner-gated server-side. */
export const setStaffActiveInput = z.object({
  userId: uuid,
  active: z.boolean(),
});

/**
 * setStaffPin (S1.1b) — a staff member sets/rotates THEIR OWN shared-tablet PIN. 4–8 digits only
 * (numeric, for a fast tablet keypad); bounded HERE and by the SQL `mms_staff_set_pin` CHECK (the
 * project's "Zod + DB check" rule). A handful of trivial PINs (all-same / simple run) are rejected so
 * a server can't pick `0000` or `1234`; everything else is allowed. Never a price — this only shapes
 * the secret; the hash is computed server-side (bcrypt via pgcrypto).
 */
/** A PIN is "trivial" if every digit is the same (0000, 999999) or the digits run strictly
 *  consecutively up or down (1234, 123456, 9876) — the most-guessed shapes, at ANY 4–8 length
 *  (an algorithmic check, not a fixed list, so 6–8 digit `000000`/`123456` are caught too). */
function isTrivialPin(p: string): boolean {
  // charCodeAt avoids the `noUncheckedIndexedAccess` undefined on `digits[i]`; for a 4–8 char
  // string every index is in range, and we only need adjacent deltas (=0 same, ±1 a run).
  let allSame = true;
  let asc = true;
  let desc = true;
  const firstCode = p.charCodeAt(0);
  for (let i = 1; i < p.length; i++) {
    const prev = p.charCodeAt(i - 1);
    const cur = p.charCodeAt(i);
    if (cur !== firstCode) allSame = false;
    if (cur - prev !== 1) asc = false;
    if (cur - prev !== -1) desc = false;
  }
  return allSame || asc || desc;
}
export const setStaffPinInput = z.object({
  pin: z
    .string()
    .regex(/^\d{4,8}$/, "PIN must be 4–8 digits")
    .refine((p) => !isTrivialPin(p), "Choose a less guessable PIN"),
});

/** verifyStaffPin (S1.1b) — unlock the shared tablet / S2 manager step-up. Shape only; the verify +
 *  lockout are server-side in the SQL `mms_staff_verify_pin`. Bounded so a hostile client can't drive
 *  an oversized comparison; the wrong-PIN path is rate-limited with lockout, not by this parse. */
export const verifyStaffPinInput = z.object({
  pin: z.string().regex(/^\d{4,8}$/, "PIN must be 4–8 digits"),
});

/** clearTable (S1.2) — a staff member clears a table on turnover (closes the session + cancels its
 *  open cart). Shape only; the server (requireStaff + service-role) owns the close, refuses mid-payment,
 *  and logs it. The client asserts only the session id. */
export const clearTableInput = z.object({ sessionId: uuid });

/** openTab (S3.1) — mark a dine-in cart as a trust tab (deferred settlement). Shape only; the server
 *  resolves the opener's authority (staff OR diner member) + the open/dine-in/idempotency guards
 *  (mms_open_tab). The client asserts which cart, never the tab state. */
export const openTabInput = z.object({ cartId: uuid });

/** sendToKitchen (S2.1b) — fire the table's current draft batch to the kitchen. Shape only: the client
 *  asserts which cart, never a price or a line set; the server re-derives membership + fires every still-
 *  draft line server-side (mms_fire_cart, dine-in only). */
export const sendToKitchenInput = z.object({ cartId: uuid });

/** undoFire (S2.2) — the host reverses the just-sent batch within the grace window (fired→draft for any
 *  line still in grace). Shape only; the server re-derives membership + host + the grace gate
 *  (mms_undo_fire, dine-in only, fire_at > now()). */
export const undoFireInput = z.object({ cartId: uuid });

/** staffFireCart (S2.1b) — staff fire a table's draft batch from the console (keyed by session). */
export const staffFireInput = z.object({ sessionId: uuid });

/** bumpLine (S2.1b) — a cook advances ONE fired line on the KDS: 'in_progress' (Start) or 'served'
 *  (Ready). The legal-edge graph is enforced in mms_line_transition; this only bounds the target shape so
 *  a hostile client can't drive a line to 'draft'/'voided' through the bump path. */
export const bumpLineInput = z.object({
  lineId: uuid,
  to: z.enum(["in_progress", "served"]),
});

/** staffAddItem (S1.3) — a staff member orders FOR a guest, adding to the table's open cart. Like the
 *  diner addItem the client asserts only an item id + chosen modifier OPTION ids (never a price); the
 *  server resolves the session's open cart, re-derives every amount, and attributes the line to no seat
 *  (by_seat = null, "added by server"). menuItemId stays a uuid — staff order from the restaurant menu. */
export const staffAddItemInput = z.object({
  sessionId: uuid,
  menuItemId: uuid,
  modifierIds: z.array(uuid).max(20).default([]),
});

/** settleCash (S1.3) — a staff member settles the table order in cash ("pay a human"). Shape only; the
 *  server re-derives the authoritative total (getCartTotals), refuses mid-card-payment, and records a
 *  cash order idempotently. The client asserts only the session id — never an amount. */
export const settleCashInput = z.object({ sessionId: uuid });

/** mergeTables (S1.4 soft convergence) — fold a SOURCE table's open order into a TARGET table, then close
 *  the source (the one-tap recovery for a double-order). Shape only; the server (requireStaff + service-
 *  role) re-resolves both open carts, refuses mid-payment on either side, requires a shared mode, and runs
 *  the atomic mms_merge_table_orders. The client asserts only the two session ids — never a line or price. */
export const mergeTablesInput = z.object({
  sourceSessionId: uuid,
  targetSessionId: uuid,
});

/**
 * voidLine (S2.3) — a staff member voids (cancels) or comps (free, kitchen still makes it) a line on the
 * table's open order. The loss gate (cooked? over-ceiling? comp?) is derived SERVER-side from the line's
 * state + value — NEVER from the client — so this only shapes the request: which line, the action, a
 * bounded reason code, and (for the gated path) the manager the server picked + that manager's PIN. The
 * PIN is verified server-side (mms_staff_verify_pin, lockout-counted); a `server`-role approver is
 * rejected even with a correct PIN. The client never asserts an amount or whether approval is needed.
 */
export const voidLineInput = z.object({
  sessionId: uuid,
  cartItemId: uuid,
  action: z.enum(["void", "comp"]),
  reason: z.enum([
    "mistake", // wrong item / ordered by error
    "kitchen_error", // kitchen made it wrong
    "quality", // guest unhappy with the item
    "guest_request", // guest changed their mind
    "service_recovery", // comp to make good on a problem
    "other",
  ]),
  // Present only for the manager-PIN step-up: the manager the initiating server tapped + their PIN.
  approverStaffId: uuid.optional(),
  pin: z
    .string()
    .regex(/^\d{4,8}$/)
    .optional(),
});

export type VoidLineInput = z.infer<typeof voidLineInput>;

/**
 * requestApproval (S2.4) — a server REQUESTS a manager's approval for a gated void/comp when no manager
 * is at hand. Same shape as the void action minus the inline PIN: the loss gate is still SERVER-derived
 * (mms_request_approval refuses if the action wouldn't need a manager). Creates a default-safe `pending`
 * row; the line is untouched until a manager resolves it.
 */
export const requestApprovalInput = z.object({
  sessionId: uuid,
  cartItemId: uuid,
  action: z.enum(["void", "comp"]),
  reason: z.enum([
    "mistake",
    "kitchen_error",
    "quality",
    "guest_request",
    "service_recovery",
    "other",
  ]),
});

/**
 * resolveApproval (S2.4) — a manager approves or denies a pending request from the queue. The manager is
 * proven by the PIN step-up (verified server-side, lockout-counted) so it works on a shared tablet
 * regardless of who's signed in; mms_resolve_approval re-checks the approver is an active manager/owner
 * and not the requester (D3), and resolves a row only once (D4).
 */
export const resolveApprovalInput = z.object({
  approvalId: uuid,
  decision: z.enum(["approve", "deny"]),
  approverStaffId: uuid,
  pin: z.string().regex(/^\d{4,8}$/),
});

export type RequestApprovalInput = z.infer<typeof requestApprovalInput>;
export type ResolveApprovalInput = z.infer<typeof resolveApprovalInput>;
export type SetStaffPinInput = z.infer<typeof setStaffPinInput>;
export type VerifyStaffPinInput = z.infer<typeof verifyStaffPinInput>;
export type SetStaffActiveInput = z.infer<typeof setStaffActiveInput>;
export type ProvisionStaffInput = z.infer<typeof provisionStaffInput>;
export type ClearTableInput = z.infer<typeof clearTableInput>;
export type OpenTabInput = z.infer<typeof openTabInput>;
export type SendToKitchenInput = z.infer<typeof sendToKitchenInput>;
export type UndoFireInput = z.infer<typeof undoFireInput>;
export type StaffFireInput = z.infer<typeof staffFireInput>;
export type BumpLineInput = z.infer<typeof bumpLineInput>;
export type StaffAddItemInput = z.infer<typeof staffAddItemInput>;
export type SettleCashInput = z.infer<typeof settleCashInput>;
export type MergeTablesInput = z.infer<typeof mergeTablesInput>;
export type SessionMintInput = z.infer<typeof sessionMintInput>;
export type SessionMintOutput = z.infer<typeof sessionMintOutput>;
export type SetDisplayNameInput = z.infer<typeof setDisplayNameInput>;
export type AddItemInput = z.infer<typeof addItemInput>;
export type SetQtyInput = z.infer<typeof setQtyInput>;
export type ApplyPromoInput = z.infer<typeof applyPromoInput>;
export type CreateIntentInput = z.infer<typeof createIntentInput>;
export type ScanInput = z.infer<typeof scanInput>;
export type GrocerySearchInput = z.infer<typeof grocerySearchInput>;
export type CartViewInput = z.infer<typeof cartViewInput>;
export type SetPickupSlotInput = z.infer<typeof setPickupSlotInput>;
