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

export type ProvisionStaffInput = z.infer<typeof provisionStaffInput>;
export type SetStaffActiveInput = z.infer<typeof setStaffActiveInput>;
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
