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

/** POST /api/session — mint/join a table session bound to a scanned physical QR. */
export const sessionMintInput = z.object({
  qrCode: z.string().trim().min(1).max(100),
  mode: z.enum(["dinein", "scango", "pickup"]).default("dinein"),
  name: displayName.default("Guest"),
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

/** scanAdd (grocery) — a scanned UPC-A(12)/EAN-13(13)/EAN-8(8) barcode, never a price. */
export const scanInput = z.object({
  cartId: uuid,
  barcode: z.string().regex(/^\d{8,14}$/, "barcode must be 8–14 digits"),
});

/** getCartView — a member-gated read of a cart's lines + server-authoritative totals. */
export const cartViewInput = z.object({ cartId: uuid });

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
});

export type SessionMintInput = z.infer<typeof sessionMintInput>;
export type SessionMintOutput = z.infer<typeof sessionMintOutput>;
export type AddItemInput = z.infer<typeof addItemInput>;
export type SetQtyInput = z.infer<typeof setQtyInput>;
export type ApplyPromoInput = z.infer<typeof applyPromoInput>;
export type CreateIntentInput = z.infer<typeof createIntentInput>;
export type ScanInput = z.infer<typeof scanInput>;
export type CartViewInput = z.infer<typeof cartViewInput>;
