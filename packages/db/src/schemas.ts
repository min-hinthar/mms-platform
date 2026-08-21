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
  /** K0 (Journey II): which DOOR the diner entered through — analytics-only (never authz), so the
   *  three-door IA stays funnel-able even where two doors share an internal mode. */
  door: z.enum(["dinein", "pickup", "togo", "grocery"]).optional(),
  qrCode: z.string().trim().min(1).max(100).optional(),
  // K2 (Journey II): the dine-in table PICKER sends a table NUMBER instead of a token — the server
  // resolves it to that table's registered sticker qr_code (the token never leaves the server). The
  // picker is advisory; the mint re-checks the table is registered + active. Bounds mirror the
  // qr_tables CHECK (1..99). Ignored for non-dine-in modes.
  tableNumber: z.number().int().min(1).max(99).optional(),
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

/** A kitchen note ("no peanuts — allergy") is user-controlled free text → cap length (mirrors the
 *  qr_cart_items.notes column CHECK, 160); JSX escapes it at render. W3b: the allergy channel. */
const lineNotes = z.string().trim().max(160);

/** addItem — the client asserts only an item id + chosen modifier OPTION ids (never a price).
 *  `notes` (W3b) rides to the kitchen verbatim; an empty/whitespace note is dropped server-side.
 *  `qty` (W5c, the item sheet's pre-add stepper) multiplies the SERVER-priced unit — bounded here
 *  AND in the SQL (`mms_cart_item_inc_qty`/`insert_if_open` reject/no-op out-of-range; column CHECK ≤99). */
export const addItemInput = z.object({
  cartId: uuid,
  menuItemId: uuid,
  modifierIds: z.array(uuid).max(20).default([]),
  notes: lineNotes.optional(),
  qty: z.number().int().min(1).max(9).default(1),
});

/** toggleFavorite (J5) — the heart on a menu item; the DB FK re-verifies the id is a real item. */
export const toggleFavoriteInput = z.object({ menuItemId: uuid });

/** reorderOrder (J5) — bring a past order back as draft lines in the CURRENT cart. Ids only: every
 *  amount is re-derived server-side at today's prices (never copied from the historical rows). */
export const reorderInput = z.object({ cartId: uuid, orderId: uuid });

/** announceArrival (J5) — the pickup "I'm here" ping; stamps qr_orders.arrived_at once. */
export const announceArrivalInput = z.object({ orderId: uuid });

/**
 * W9c — the /track post-session fallback lookup. EXACTLY ONE key: a split order is keyed by its
 * resolved order id, a single-pay order by its Stripe PaymentIntent. Neither key AUTHORIZES anything
 * — the read is additionally scoped to `earned_by = auth.uid()` — but bounding the shape here keeps a
 * garbage value out of the query in the first place.
 */
export const trackFallbackInput = z
  .object({
    orderId: uuid.nullish(),
    paymentIntent: z
      .string()
      .max(255)
      .regex(/^pi_[A-Za-z0-9_]+$/, "not a PaymentIntent id")
      .nullish(),
  })
  .refine((v) => !!v.orderId !== !!v.paymentIntent, {
    message: "provide exactly one of orderId / paymentIntent",
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
 * getCartTotals. Tip is capped at 100% of the order (W2d custom tips ride the same rate) so a hostile
 * client can't inflate the charge via metadata.
 */
export const createIntentInput = z.object({
  cartId: uuid,
  // W19 (owner: "no limit to custom or capped amount"): the real ceiling is a DOLLAR amount — $1,000,
  // the cash tip's own bound — enforced in create-intent on the DERIVED tipCents after getCartTotals,
  // because a rate cannot express a dollar cap (rate = cents/net). This schema bound is only the
  // transport sanity rail: 4000 = $1,000 over the 25¢ menu-price floor, the largest rate any
  // in-bounds tip can need. Server-authoritative as ever: getCartTotals applies round(net·rate) and
  // the webhook recomputes identically from metadata.tipRate — the client never sends an amount.
  tipRate: z.number().min(0).max(4000).default(0),
  // W3e: the optional pickup/scango call-out identity ("first name for pickup"). Length-capped
  // (mirrors the qr_carts.customer_name CHECK); persisted on the CART then snapshotted to the order
  // at fulfillment — never rendered anywhere money-bearing, and never sent to analytics (PII).
  firstName: z.string().trim().max(40).optional(),
  // W21 (owner: "pickup should need name and phone number") — the pickup contact phone. This bound
  // is only the transport rail; the REAL rule (shape + ≥7 digits, and required-ness on pickup) is
  // `pickupContactMissing` in apps/qr/lib/pickup-contact.ts, run by create-intent, with the
  // qr_carts.customer_phone column CHECK as the DB belt. PII: cart column only, never analytics.
  phone: z.string().trim().max(20).optional(),
});

/**
 * create-share-intent (split-tender) — same server-authoritative rule (the client sends a rate, never an
 * amount), but the tip cap here is 0.5, NOT the single-pay 1.0: this rate is written to the
 * `qr_cart_shares.tip_rate` column, whose CHECK is `<= 0.5`, so the Zod bound MUST match the column (the
 * split path only ever needs presets ≤ 0.20). Kept SEPARATE from `createIntentInput` so single-pay's
 * custom-tip widening (→1.0) can't loosen the split path past its DB CHECK. (`firstName` is single-pay
 * only — the split call-out identity comes from the seat, so it's omitted here.)
 */
export const shareIntentInput = z.object({
  cartId: uuid,
  tipRate: z.number().min(0).max(0.5).default(0),
});

/** scanAdd (grocery) — a scanned EAN-8(8)/UPC-A(12)/EAN-13(13)/GTIN-14(14) barcode (8–14 digits),
 *  never a price. An unknown-length match just misses the catalog lookup (handled honestly).
 *  `scanId` (W7b) is the offline queue's per-scan-EVENT id: a replay with the same id is deduped
 *  in the SQL statement and answers as an idempotent OK. Live scans omit it — a repeat barcode
 *  deliberately counts (qty+1). Still never a price. */
export const scanInput = z.object({
  cartId: uuid,
  barcode: z.string().regex(/^\d{8,14}$/, "barcode must be 8–14 digits"),
  scanId: uuid.optional(),
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

/** clearPickupSlot (W5e) — the client asks to go ASAP ("make it now"): clear any scheduled slot so the
 *  order fires at settlement. Shape only; the server re-derives membership + the open-cart guard (in the
 *  RPC's UPDATE). No amount — pickup_slot/fire_at are fulfillment metadata, never price. */
export const clearPickupSlotInput = z.object({ cartId: uuid });

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
  // K2: the registered table this dine-in session is seated at (1–10), or null for a host-mint join
  // code, an unregistered/legacy sticker, or a solo mode. Drives "Table 7" on the greeting/guest
  // list/settle; the order surfaces read the denormalized qr_orders.table_number instead.
  tableNumber: z.number().int().nullable().default(null),
  // W5a: true when this mint CREATED a fresh session (vs rejoining an existing one). Lets a
  // resume-intent client (the home card) tell the diner honestly when their old table had ended
  // and a fresh empty session was started, instead of silently landing them in an empty cart.
  created: z.boolean().default(false),
});

/**
 * Shape of the `GET /api/session/peek` RESPONSE (W5a) — the passive "do I have a live session?"
 * read behind the home resume card + the picker's "your table" state. Deliberately minimal
 * disclosure: no joinCode (the caller already holds it if they're a member; the resume paths
 * rejoin via localStorage / the member-aware claim), no seat lists, no expiry timestamps.
 */
export const sessionPeekOutput = z.object({
  sessions: z.array(
    z.object({
      mode: z.enum(["dinein", "scango", "pickup"]),
      // The registered table (dine-in), or null for host-mint / unregistered / solo modes.
      tableNumber: z.number().int().nullable().default(null),
      // The session's open cart — lets a solo resume land directly on /cart. Null if none open.
      cartId: uuid.nullable().default(null),
      // Line count of the open cart (display-only, never money).
      itemCount: z.number().int().min(0),
    }),
  ),
});
export type SessionPeekOutput = z.infer<typeof sessionPeekOutput>;

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

/** secureTab (S3.2) — mint/reuse the ephemeral Stripe Customer + a SetupIntent to save a card on the
 *  tab (at open or mid-tab convert). Shape only; the route re-derives membership/staff authority and the
 *  cart's dine-in/open state. No PAN ever touches the server (SAQ-A) — the card is in the Element. */
export const secureTabInput = z.object({ cartId: uuid });

/** applyReward (M4 P4.2) — redeem a Morning Star reward coupon on the cart. Shape only; mms_apply_reward
 *  re-derives ownership (the reward must belong to the caller's uid), unredeemed/unexpired, the redemption
 *  minimum, and the open+unlocked cart — the client only asserts which code. */
export const applyRewardInput = z.object({
  cartId: uuid,
  rewardCode: z.string().trim().min(1).max(40),
});

/** setLineFulfillment (S4) — toggle a FOOD line's destination for-here↔to-go. Shape only; the server
 *  re-derives membership + own/host-draft authority and refuses a grocery line; the RPC recomputes the
 *  line's tax (cold food is taxable only dine-in). Grocery is never client-flippable. M100: the RPC
 *  also re-derives the SESSION's mode and refuses `dinein` off a dine-in session
 *  (`not_dinein_session`) — one-directionally, so `togo` stays reachable everywhere and a
 *  mis-tagged line can always be repaired. The enum here is the transport rail, not the rule. */
export const setLineFulfillmentInput = z.object({
  cartItemId: uuid,
  fulfillment: z.enum(["dinein", "togo"]),
});

/** makeItNow (S4.2) — fire ONE to-go food line to the kitchen early. Shape only; the server re-derives
 *  membership + own/host-draft authority, and mms_fire_line refuses anything that isn't an open-cart,
 *  draft, `togo` line on a DINE-IN session (a dine-in line uses the batch send; grocery never fires;
 *  M107 — pickup and scan-and-go are pay-first, so their food fires at settlement via
 *  mms_fire_pending_food, never from an open cart). */
export const makeItNowInput = z.object({ cartItemId: uuid });

/** setTogoStatus (S4.3a) — the expo bumps a paid order's takeaway bag forward. Shape only; the action
 *  re-checks requireStaff() and mms_set_togo_status re-asserts the legal edge (preparing→ready→picked_up)
 *  in the write. `to` excludes 'preparing' (that's set at settlement, never by the bump). */
export const setTogoStatusInput = z.object({
  orderId: uuid,
  to: z.enum(["ready", "picked_up"]),
});

/** refundLine (S4.3b) — a manager refunds ONE paid order line (money-OUT). Shape only; the amount + PI are
 *  SERVER-derived (mms_refund_authorize), never sent by the client. `pin` is the money-out step-up
 *  (verifyStaffPin on the manager's own identity); `reason` is an audit code. */
export const refundLineInput = z.object({
  orderItemId: uuid,
  reason: z.enum(["unhappy", "wrong_item", "too_slow", "duplicate", "sold_out", "other"]),
  pin: z.string().regex(/^\d{4,8}$/),
});

/** submitFeedback (M4 P4.3) — leave feedback on an order. Shape + bounds only; mms_submit_feedback
 *  re-derives that the caller is the order's EARNER + the order is paid (one per order). Rating bounded
 *  1..5; comment length-capped (mirrors the column CHECK). UNGATED — any rating is accepted. */
export const submitFeedbackInput = z.object({
  orderId: uuid,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

/** sendToKitchen (S2.1b) — fire the table's current draft batch to the kitchen. Shape only: the client
 *  asserts which cart, never a price or a line set; the server re-derives membership + fires every still-
 *  draft line server-side (mms_fire_cart, dine-in only). */
export const sendToKitchenInput = z.object({ cartId: uuid });

/** undoFire (S2.2) — the host reverses the just-sent batch within the grace window (fired→draft for any
 *  line still in grace). `batch` is the fire_batch sendToKitchen handed back, so undo targets exactly that
 *  send (S4-audit P1-3 — never another actor's make-it-now line). Shape only; the server re-derives
 *  membership + host + the grace gate (mms_undo_fire, dine-in only, fire_at > now(), fire_batch = batch). */
export const undoFireInput = z.object({ cartId: uuid, batch: uuid });

/** staffFireCart (S2.1b) — staff fire a table's draft batch from the console (keyed by session). */
export const staffFireInput = z.object({ sessionId: uuid });

/** bumpLine (S2.1b) — a cook advances ONE fired line on the KDS: 'in_progress' (Start) or 'served'
 *  (Ready). The legal-edge graph is enforced in mms_line_transition; this only bounds the target shape so
 *  a hostile client can't drive a line to 'draft'/'voided' through the bump path. */
export const bumpLineInput = z.object({
  lineId: uuid,
  to: z.enum(["in_progress", "served"]),
});

/** bumpTicket (W3d) — the cook bumps a WHOLE ticket served in one tap. The client passes the line ids
 *  it displayed (so a line that fired mid-tap is never silently served) + their cart; every guard
 *  (state, cart status, fire_at ≤ now) re-asserts in mms_bump_ticket's single UPDATE. Bounded well
 *  above any real ticket (the queue read caps at 500 lines board-wide). */
export const bumpTicketInput = z.object({
  cartId: uuid,
  lineIds: z.array(uuid).min(1).max(60),
});

/** recallTicket (W3d) — restore a mis-bumped ticket from the recall rail. Same shape as the bump;
 *  the 2-minute window + served-state guard live in mms_recall_ticket, never the client. */
export const recallTicketInput = z.object({
  cartId: uuid,
  lineIds: z.array(uuid).min(1).max(60),
});

/** fireTicketNow (W3a) — pull a HELD (scheduled pickup) ticket onto the live board early. Shape only;
 *  mms_fire_ticket_now moves only future-fire_at fired lines on a PAID cart (a dine-in send's undo
 *  grace lives on an OPEN cart and is untouchable from the KDS). */
export const fireTicketNowInput = z.object({ cartId: uuid });

/** setLineNotes (W3b) — staff set/clear the kitchen note on a DRAFT line ("no peanuts — allergy",
 *  taken at the table). Empty clears. Post-fire the note is frozen — the kitchen may already be
 *  reading it; the guard lives in the action's draft-only UPDATE. */
export const setLineNotesInput = z.object({
  cartItemId: uuid,
  notes: lineNotes,
});

/** staffAddItem (S1.3) — a staff member orders FOR a guest, adding to the table's open cart. Like the
 *  diner addItem the client asserts only an item id + chosen modifier OPTION ids (never a price); the
 *  server resolves the session's open cart, re-derives every amount, and attributes the line to no seat
 *  (by_seat = null, "added by server"). menuItemId stays a uuid — staff order from the restaurant menu. */
export const staffAddItemInput = z.object({
  sessionId: uuid,
  menuItemId: uuid,
  modifierIds: z.array(uuid).max(20).default([]),
  notes: lineNotes.optional(),
  // W6a: the register's per-add quantity (the diner ItemSheet's 1–9 bound). Defaults to 1 so every
  // existing tap-to-add call is unchanged.
  qty: z.number().int().min(1).max(9).default(1),
});

/** setKioskTip (W17c-3) — the kiosk guest chooses a tip, minutes before a cashier takes the money.
 *  An AMOUNT, not a rate, and stored rather than charged: the kiosk pays at the counter, so this is
 *  the guest's half of the conversation (`qr_carts.intended_tip_cents`) and the cashier's entry is
 *  still the authority. Bounded 0..100000 here and by the column CHECK. `null` clears it back to
 *  "never asked", which the register renders differently from "asked, chose nothing". */
export const setKioskTipInput = z.object({
  cartId: uuid,
  tipCents: z.number().int().min(0).max(100000).nullable(),
});

/** setMenuPrice (W17b) — a MANAGER edits a dish's menu price from the staff console. The client
 *  asserts the amount here (it is the decision being made, not a derived total), so it is bounded on
 *  BOTH sides: this `.min(25).max(500000)` and the `menu_items_base_price_cents_bounds` column CHECK
 *  the migration adds. The 25¢ floor clears today's catalog floor ($2.00); the $5,000 ceiling makes a
 *  fat-fingered extra zero a refusal instead of a money incident. This is the ONE place a price
 *  crosses from a human into the system — every OTHER money amount in this app is server-derived and
 *  must stay that way (see priceItem: it reads this stored price, it never accepts one). */
export const setMenuPriceInput = z.object({
  menuItemId: uuid,
  priceCents: z.number().int().min(25).max(500000),
  // W21d (Codex P1 on #180) — the price the manager's SCREEN showed when they confirmed. The
  // server refuses when the live value differs: the old id-keyed CAS only guarded the server's own
  // read-to-write window, so a confirmation visibly reading "$14 → $16" could overwrite another
  // manager's fresher $18.
  expectedPriceCents: z.number().int().min(25).max(500000),
});

/** setItemSoldOut (W23a) — the 86 toggle. NOT a money amount, but it is a revenue decision: while the
 *  flag is true nobody can order the dish. `expectedSoldOut` is the state the staff member's SCREEN
 *  showed when they tapped, so the server can refuse a flip made against a stale render (the same
 *  human render-to-confirm window `expectedPriceCents` guards, which on a busy console is minutes). */
export const setItemSoldOutInput = z.object({
  menuItemId: uuid,
  soldOut: z.boolean(),
  expectedSoldOut: z.boolean(),
});

/** setCartCustomerName (W6a) — the register's call-out identity for a cash order. Staff-gated; the
 *  server writes qr_carts.customer_name (bounded by the column CHECK) only while the cart is open.
 *  Empty clears — same semantics as the diner's create-intent name write. */
export const setCartNameInput = z.object({
  sessionId: uuid,
  name: z.string().trim().max(40),
});

/** settleCash (S1.3) — a staff member settles the table order in cash ("pay a human"). Shape only; the
 *  server re-derives the authoritative total (getCartTotals), refuses mid-card-payment, and records a
 *  cash order idempotently. The client asserts only the session id — never an amount. */
export const settleCashInput = z.object({
  sessionId: uuid,
  // W17c-2 — the cash tip. This is an AMOUNT, not a rate, and that is correct here: it is money in
  // the cashier's hand, counted, not a percentage of anything. (The diner path sends a rate because
  // the server must re-derive the charge; here the server has nothing to re-derive it FROM — only
  // the human who took the cash knows what was left.) Bounded 0..100000: $1,000 is far above any
  // real tip and far below a mis-keyed one, and the `qr_orders_tip_cents_nonneg` column CHECK is the
  // belt — a negative tip would otherwise REDUCE the recorded total, a silent discount wearing a
  // tip's name. Deliberately no ceiling relative to the bill: a tip larger than the order is real.
  tipCents: z.number().int().min(0).max(100000).default(0),
});

/** Terminal poll/cancel (W6c) — the register UI tracks / cancels a reader collect it started. The
 *  PI id is only a HANDLE: the server re-verifies it is a kiosk/register terminal PI (metadata.kind)
 *  and every money fact comes from Stripe + the DB, never this input. */
export const terminalPollInput = z.object({
  sessionId: uuid,
  paymentIntentId: z.string().startsWith("pi_").max(200),
});

/** openRegisterOrder (W6a) — staff start an order that has no diner phone behind it: a walk-up or a
 *  phone order (counter arms — a per-order `mode='pickup'` session keyed `reg-<code>`), or "start a
 *  table" (a real dine-in session on a registered table, so eat-in tax basis and floor/KDS routing come
 *  by construction). Shape only; the mint is staff-gated + service-role — never through /api/session
 *  (its rate limits key on a diner seat) and never with a client-asserted session or price. */
export const openRegisterInput = z.object({
  kind: z.enum(["walkup", "phone", "table"]),
  tableNumber: z.number().int().min(1).max(999).optional(),
  customerName: z.string().trim().max(40).optional(),
});

/** openKioskOrder / kioskReset (W6b) — the self-serve kiosk's device-token-gated mint and abandon
 *  reset. `k` is the device token from the kiosk bookmark (verified constant-time server-side, the
 *  /board pattern); the client never asserts a session code or a price. */
/**
 * The device token is `.max(200)` but deliberately NOT `.min(1)` — an EMPTY `k` must reach the gate.
 *
 * A kiosk signed in by a staff account carries no token at all (`/staff/login?next=/kiosk` →
 * `/kiosk` with no `?k=`), and `authorizeDevice` is what decides that case: staff session → ok, no
 * token configured → `not_configured`, token configured but absent → `denied`. A `.min(1)` here ran
 * BEFORE that gate and turned every one of those answers into a bare parse failure, so the tokenless
 * kiosk this whole credential exists for answered "Something went wrong — please order at the
 * counter." on every tap. The upper bound is the real transport rail and stays.
 *
 * Not a widening of authority: the gate is unchanged and still refuses an empty token whenever a
 * token is configured and no staff session is present (`kiosk.test.ts`, red-first).
 */
export const kioskOpenInput = z.object({
  k: z.string().max(200),
  kind: z.enum(["dinein", "togo", "grocery"]),
  tableNumber: z.number().int().min(1).max(999).optional(),
  customerName: z.string().trim().max(40).optional(),
});
export const kioskResetInput = z.object({
  k: z.string().max(200),
  sessionId: uuid,
});

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
    "sold_out", // 86'd mid-service — the kitchen cannot produce it (W23a)
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
    "sold_out",
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

/**
 * redeemMergeToken (K3b) — the single-use proof minted while anonymous (mms_merge_tokens), presented after
 * sign-in to move that device's Stars onto the account signed into. Server-generated (base64url, ≥256-bit),
 * but it round-trips through the client's localStorage, so validate the SHAPE defensively before the DB
 * claim (the atomic single-use `.update().is(redeemed_at,null)` is the real authority — this is a cheap
 * pre-filter that rejects an obviously-junk value without a round trip).
 */
export const mergeTokenInput = z.object({
  token: z.string().trim().min(20).max(200),
});
export type MergeTokenInput = z.infer<typeof mergeTokenInput>;

/**
 * W7a — the receipt artifact. The orderId is a LOOKUP the actions re-authorize on
 * earned_by / qr_order_payers (the lib/orders.ts doctrine: an order id is never a credential).
 */
export const receiptLinkInput = z.object({ orderId: uuid });
export type ReceiptLinkInput = z.infer<typeof receiptLinkInput>;

export const setReceiptEmailInput = z.object({
  orderId: uuid,
  // Lower-cased (the provisionStaff precedent) so stored values compare stably; 254 = the RFC
  // address ceiling, mirrored by the qr_orders.receipt_email column CHECK.
  email: z.string().trim().toLowerCase().email().max(254),
});
export type SetReceiptEmailInput = z.infer<typeof setReceiptEmailInput>;

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
export type BumpTicketInput = z.infer<typeof bumpTicketInput>;
export type RecallTicketInput = z.infer<typeof recallTicketInput>;
export type FireTicketNowInput = z.infer<typeof fireTicketNowInput>;
export type SetLineNotesInput = z.infer<typeof setLineNotesInput>;
export type SetMenuPriceInput = z.infer<typeof setMenuPriceInput>;
export type SetItemSoldOutInput = z.infer<typeof setItemSoldOutInput>;
export type SetKioskTipInput = z.infer<typeof setKioskTipInput>;
export type StaffAddItemInput = z.infer<typeof staffAddItemInput>;
export type SettleCashInput = z.infer<typeof settleCashInput>;
export type TerminalPollInput = z.infer<typeof terminalPollInput>;
export type OpenRegisterInput = z.infer<typeof openRegisterInput>;
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
