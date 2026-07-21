"use server";
import { serviceClient } from "@mms/db/server";
import type { CartItem, CartTotals } from "@mms/db";
import {
  addItemInput,
  applyPromoInput,
  applyRewardInput,
  assignLineInput,
  cartViewInput,
  makeItNowInput,
  sendToKitchenInput,
  setLineFulfillmentInput,
  setQtyInput,
  undoFireInput,
} from "@mms/db/schemas";
import type { LineState } from "@mms/db";
import { sumLineTax } from "./tax";
import { getCartTotals } from "./totals";
import { assertCartItemMember, assertCartMember } from "./authz";
import { assertMutationRate, withinMutationRate } from "./rate";
import { canMutateLine } from "./permissions";
import { releaseCartLock } from "./lock";
import { getPostHogClient } from "./posthog-server";
import { insertOrIncLine, priceItem, touchCart } from "./order-lines";

/**
 * SERVER-AUTHORITATIVE cart. The browser never sends a price — it sends a menu item id +
 * chosen modifier OPTION ids. The server re-derives every amount (lib/order-lines.ts priceItem,
 * shared with the staff order-for-a-guest path) and writes the snapshot. Fixes red-team C1/C2.
 *
 * Money is integer CENTS end-to-end (parity with the delivery schema). The menu lives in the
 * delivery app: `menu_items` (uuid id, base_price_cents, name_en/name_my) with normalized
 * modifiers (item_modifier_groups → modifier_groups → modifier_options.price_delta_cents).
 * Tax category is resolved QR-side via mms_menu_tax_category (delivery menu is untouched).
 */

export async function addItem(
  cartId: string,
  menuItemId: string,
  modifierIds: string[] = [],
  notes?: string,
  qty?: number,
) {
  const input = addItemInput.parse({ cartId, menuItemId, modifierIds, notes, qty });
  // AuthZ first: a verified member of this cart's active session, and the host hasn't locked it.
  const { uid, sessionId, locked, settling } = await assertCartMember(input.cartId);
  await assertMutationRate(uid); // per-device flood guard (P3.4) — after authz, before the write
  if (locked) throw new Error("Order is locked while someone checks out");
  if (settling) throw new Error("The table is settling up — you can’t edit while everyone pays");

  const db = serviceClient();
  const { data: sess } = await db
    .from("table_sessions")
    .select("mode")
    .eq("id", sessionId)
    .single();
  const dineIn = sess?.mode === "dinein";
  // Diner add: enforce modifier requiredness/cardinality SERVER-side (the client "Choose" gate is advisory)
  // — a forged/stale client can't add a required-modifier item without its required choice.
  const { name, unitPriceCents, taxParts, opts } = await priceItem(
    input.menuItemId,
    input.modifierIds,
    { enforceCardinality: true },
  );
  // W5c: tax each part on its own category (a hot add-on on a cold to-go salad is taxable even though
  // the salad isn't) — same-category lines round exactly as the old single lineTax did.
  const taxCents = sumLineTax(taxParts, dineIn);
  // S4 unified basket: a food line's fulfillment defaults from context — a dine-in table → 'dinein', any
  // other entry (pickup/scan) → 'togo'. The diner can toggle it per line; the tag (not the session mode)
  // then drives routing + per-line tax. taxCents above already matches this default (same dineIn).
  const fulfillment = dineIn ? "dinein" : "togo";
  // Merge-or-insert via the shared status-atomic core. by_seat = the VERIFIED diner uid (provenance for
  // the by-person split), never a client-asserted seat. Throws "Cart is no longer open" on a closed cart.
  // W3b: an empty/whitespace note normalizes away here (Zod already trimmed); a real note rides the line
  // to the kitchen and never merges with a plain sibling.
  await insertOrIncLine(
    input.cartId,
    {
      menuItemId: input.menuItemId,
      name,
      opts,
      unitPriceCents,
      taxCents,
      fulfillment,
      notes: input.notes || undefined,
    },
    uid,
    input.qty,
  );
  await touchCart(input.cartId, "addItem");

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: uid,
    event: "item_added_to_cart",
    properties: {
      cart_id: input.cartId,
      menu_item_id: input.menuItemId,
      item_name: name,
      unit_price_cents: unitPriceCents,
      modifiers: opts,
      dine_in: dineIn,
    },
  });

  // Return the fresh server-authoritative view so the caller renders in ONE round-trip (not a separate
  // getCartView refresh afterward). Re-running assertCartMember here is a couple of indexed reads on the
  // same warm function — cheap next to a second network round-trip.
  return getCartView(input.cartId);
}

export async function setQty(cartItemId: string, qty: number) {
  const input = setQtyInput.parse({ cartItemId, qty });
  const { cartId, locked, settling, role, lineSeat, lineState, comped, uid } =
    await assertCartItemMember(input.cartItemId);
  await assertMutationRate(uid); // per-device flood guard (P3.4)
  if (locked) throw new Error("Order is locked while someone checks out");
  if (settling) throw new Error("The table is settling up — you can’t edit while everyone pays");
  // canMutate (M3·P3.3a → S2.1a): a diner may change/remove only an OWN, still-'draft' line (host any
  // draft; guest own). Once fired, editing is staff-only. A comped line is immutable (S2-audit B1). Honest
  // reason per case — a fired line isn't an ownership problem (S2.2 also disables the control client-side).
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }, comped))
    throw new Error(
      lineState === "draft"
        ? "Only the host can change someone else’s item"
        : "Ask a server to change an item that’s already gone to the kitchen",
    );
  const db = serviceClient();
  // Status-atomic set/delete (qty<=0 removes) — applies only while the parent cart is 'open' in one
  // statement (migration 20260619000200), matching the addItem paths. 0 rows ⇒ paid/closed (or gone).
  const { data: affected } = await db.rpc("mms_cart_item_set_qty_if_open", {
    p_id: input.cartItemId,
    p_qty: input.qty,
  });
  if (!affected) throw new Error("Cart is no longer open");
  const { error: touchErr } = await db
    .from("qr_carts")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", cartId);
  if (touchErr) console.error("[cart] updated_at touch failed (setQty)", touchErr.message);
  // Return the fresh server-authoritative view so the caller re-syncs in ONE round-trip (mirrors
  // addItem) instead of a separate getCartView afterward — the "cart actions feel delayed" fix. The
  // amounts stay server-derived here; the client never re-prices. Callers that don't need the view
  // (Checkout keeps its own optimistic layer) simply ignore it.
  return getCartView(cartId);
}

/**
 * Reassign a cart line to a seat (M3·P3.3a, by-person split). Authorized as a member, canMutateLine
 * (host-any / guest-own-only), and only while unlocked; the target seat must be a member of THIS
 * session (you can't assign a line to a stranger). Touches updated_at so peers re-sync (P3.2).
 */
export async function assignLine(cartItemId: string, seatId: string) {
  const input = assignLineInput.parse({ cartItemId, seatId });
  const { cartId, sessionId, locked, settling, role, lineSeat, lineState, comped, uid } =
    await assertCartItemMember(input.cartItemId);
  await assertMutationRate(uid); // per-device flood guard (P3.4)
  if (locked) throw new Error("Order is locked while someone checks out");
  if (settling) throw new Error("The table is settling up — you can’t edit while everyone pays");
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }, comped))
    throw new Error(
      lineState === "draft"
        ? "Only the host can reassign someone else’s item"
        : "Ask a server to change an item that’s already gone to the kitchen",
    );
  const db = serviceClient();
  // The target must be at this table — never assign a line to a non-member seat.
  const { data: target } = await db
    .from("session_members")
    .select("seat_id")
    .eq("session_id", sessionId)
    .eq("seat_id", input.seatId)
    .maybeSingle();
  if (!target) throw new Error("That guest isn’t at this table");
  // Status guard, matching the sibling writes (assertCartItemMember verified 'open' at entry; re-check
  // narrows the webhook-flip TOCTOU). by_seat is provenance-only — a post-paid reassign would be a
  // harmless no-op since the order snapshot is already taken — but keep the invariant the others uphold.
  const { data: openCart } = await db
    .from("qr_carts")
    .select("status")
    .eq("id", cartId)
    .maybeSingle();
  if (openCart?.status !== "open") throw new Error("Cart is no longer open");
  // Reassign provenance only (M3·P3.3a). Per-seat lines (R5c) can legitimately leave a diner with TWO
  // matching draft lines after a reassign (or a price-snapshot difference, or a concurrent first-add) — the
  // cart, split, and totals already sum per line, and the menu quick-stepper AGGREGATES the viewer's matching
  // lines, so a duplicate is tolerated everywhere rather than forced into one line by a fragile coalesce.
  const { error } = await db
    .from("qr_cart_items")
    .update({ by_seat: input.seatId })
    .eq("id", input.cartItemId);
  if (error) throw new Error("Could not reassign that item");
  const { error: touchErr } = await db
    .from("qr_carts")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", cartId);
  if (touchErr) console.error("[cart] updated_at touch failed (assignLine)", touchErr.message);
}

export type SendToKitchenResult =
  | {
      ok: true;
      fired: number;
      undoUntil: string | null;
      serverNow: string;
      undoBatch: string | null;
    }
  | {
      ok: false;
      reason: "not_host" | "locked" | "settling" | "nothing" | "rate_limited" | "error";
    };

/**
 * Send the table's current draft batch to the kitchen (S2.1b, dine-in). "Send to kitchen" fires
 * EVERYONE's draft lines — a table-level action — so it follows the host-authority model: a guest adds
 * their own items, the HOST sends the batch (staff can always fire from the console via staffFireCart).
 * The fire is the atomic, dine-in-only mms_fire_cart (draft→fired + fire_at=now()+grace, cart-open
 * guarded, grocery/pickup excluded — server-authoritative). Returns a RESULT (not a throw): Next redacts
 * thrown Server Action errors in prod, so the discriminated reason is the only way the button can branch
 * its copy. S2.2: the lines are fired at now()+10s grace (invisible to the KDS until then), so we hand
 * back `undoUntil` — the SERVER-clocked deadline of the batch — for the "Sent! — Undo (Ns)" window.
 */
export async function sendToKitchen(cartId: string): Promise<SendToKitchenResult> {
  const input = sendToKitchenInput.parse({ cartId });
  const { uid, role, locked, settling } = await assertCartMember(input.cartId);
  if (!(await withinMutationRate(uid))) return { ok: false, reason: "rate_limited" };
  if (locked) return { ok: false, reason: "locked" };
  if (settling) return { ok: false, reason: "settling" };
  if (role !== "host") return { ok: false, reason: "not_host" };

  const db = serviceClient();
  const { data: rows, error } = await db.rpc("mms_fire_cart", {
    p_cart_id: input.cartId,
  });
  if (error) {
    console.error("[cart] mms_fire_cart failed", { cartId: input.cartId, message: error.message });
    return { ok: false, reason: "error" };
  }
  const row = rows?.[0];
  const fired = row?.fired ?? 0;
  if (!fired) return { ok: false, reason: "nothing" }; // empty cart / nothing still draft / not dine-in
  await touchCart(input.cartId, "sendToKitchen");

  // S4-audit P1-3: mms_fire_cart RETURNS the fire_batch + the shared grace deadline it stamped, so we hand
  // the client `undoBatch` directly (race-free — no read-back that a concurrent make-it-now could win) and
  // its Undo reverses exactly THIS send's batch, never a guest's make-it-now line sharing the grace window.
  // We return the deadline WITH `serverNow` so the client counts down the server-MEASURED grace duration
  // (`undoUntil − serverNow`) from its own receipt — immune to absolute client-clock skew. fire_deadline ==
  // the lines' fire_at exactly (captured once in the RPC).
  getPostHogClient().capture({
    distinctId: uid,
    event: "send_to_kitchen",
    properties: { cart_id: input.cartId, lines: fired },
  });
  return {
    ok: true,
    fired,
    undoUntil: row?.fire_deadline ?? null,
    serverNow: new Date().toISOString(),
    undoBatch: row?.batch ?? null,
  };
}

export type UndoFireResult =
  | { ok: true; unfired: number }
  | {
      ok: false;
      reason: "not_host" | "expired" | "locked" | "settling" | "rate_limited" | "error";
    };

/**
 * Undo the just-sent batch within the grace window (S2.2). The symmetric inverse of sendToKitchen — same
 * host-authority + dine-in model — driving the grace-gated, atomic mms_undo_fire (fired→draft + fire_at
 * null; a line whose grace already passed is left fired, so undo can't un-send food the kitchen already
 * has). S4-audit P1-3: undo targets the SPECIFIC `batch` sendToKitchen handed back — so a host's Undo
 * reverses only the host's batch, never a guest's make-it-now (S4.2) line sharing the grace window.
 * `expired` (0 rows un-fired) is the honest signal that the window closed / nothing was undoable → the UI
 * steers to "ask a server", never a silent success. Returned (not thrown) for the same prod-redaction reason.
 */
export async function undoFire(cartId: string, batch: string): Promise<UndoFireResult> {
  const input = undoFireInput.parse({ cartId, batch });
  const { uid, role, locked, settling } = await assertCartMember(input.cartId);
  if (!(await withinMutationRate(uid))) return { ok: false, reason: "rate_limited" };
  if (locked) return { ok: false, reason: "locked" };
  if (settling) return { ok: false, reason: "settling" };
  if (role !== "host") return { ok: false, reason: "not_host" };

  const { data: unfired, error } = await serviceClient().rpc("mms_undo_fire", {
    p_cart_id: input.cartId,
    p_batch: input.batch,
  });
  if (error) {
    console.error("[cart] mms_undo_fire failed", { cartId: input.cartId, message: error.message });
    return { ok: false, reason: "error" };
  }
  if (!unfired) return { ok: false, reason: "expired" }; // grace passed / nothing in grace to undo
  await touchCart(input.cartId, "undoFire");

  getPostHogClient().capture({
    distinctId: uid,
    event: "undo_fire",
    properties: { cart_id: input.cartId, lines: unfired },
  });
  return { ok: true, unfired };
}

/** Reasons the cart UI maps to specific copy. SQL returns the validity reasons; the action adds the
 *  pre-check ones (locked / rate_limited / error). Returned (not thrown) — Next redacts thrown Server
 *  Action errors in prod, so a discriminated RESULT is the only way the client can branch per reason. */
export type PromoReason =
  | "invalid"
  | "inactive"
  | "not_started"
  | "expired"
  | "min_not_met"
  | "exhausted"
  | "session_limit"
  | "cart_closed"
  | "locked"
  | "rate_limited"
  | "error";

export type ApplyPromoResult =
  | { ok: true; discountCents: number }
  | { ok: false; reason: PromoReason };

export async function applyPromo(cartId: string, code: string): Promise<ApplyPromoResult> {
  const input = applyPromoInput.parse({ cartId, code });
  const { uid, sessionId, locked, settling } = await assertCartMember(input.cartId);
  // A settling cart is frozen like a locked one — reuse the "locked" reason (same "order frozen" UX);
  // the promo field isn't even shown during split settlement, this is the server backstop.
  if (locked || settling) return { ok: false, reason: "locked" };
  const db = serviceClient();

  // Rate-limit FIRST (anti-enumeration): the gate counts attempts per session in a trailing window
  // (10 / 5 min by default) and returns false once the cap is hit — without recording, so the window
  // can drain — so a client can't brute-force the code space.
  const { data: allowed, error: rlErr } = await db.rpc("mms_promo_attempt", {
    p_session_id: sessionId,
  });
  if (rlErr) return { ok: false, reason: "error" };
  if (!allowed) return { ok: false, reason: "rate_limited" };

  // Single source of truth (active + window + min-subtotal + global cap + per-session cap). Pricing,
  // caps, and reason all come from the DB — the client only asserts the code string.
  const { data: rows, error: chkErr } = await db.rpc("mms_promo_check", {
    p_code: input.code,
    p_cart_id: input.cartId,
  });
  if (chkErr) return { ok: false, reason: "error" };
  const check = rows?.[0];
  if (!check?.valid) return { ok: false, reason: (check?.reason ?? "invalid") as PromoReason };

  // Status-atomic write — only sets the promo on a still-`open` cart (symmetric with the other
  // mutation paths against a webhook flip between the authz check and this update). 0 rows ⇒ closed.
  const normalized = input.code.toUpperCase();
  const { data: updated, error: updErr } = await db
    .from("qr_carts")
    .update({ promo_code: normalized })
    .eq("id", input.cartId)
    .eq("status", "open")
    .select("id");
  if (updErr) return { ok: false, reason: "error" };
  if (!updated || updated.length === 0) return { ok: false, reason: "cart_closed" };

  getPostHogClient().capture({
    distinctId: uid, // the verified diner uid (matches add_to_cart) — not the cart id
    event: "promo_applied",
    properties: {
      cart_id: input.cartId,
      promo_code: normalized,
      discount_cents: check.discount_cents,
    },
  });
  return { ok: true, discountCents: check.discount_cents };
}

export type ApplyRewardReason =
  | "invalid"
  | "min_not_met"
  | "in_use"
  | "busy"
  | "cart_closed"
  | "rate_limited"
  | "error";
export type ApplyRewardResult = { ok: true } | { ok: false; reason: ApplyRewardReason };

/**
 * Redeem a Morning Star reward coupon on the cart (M4 P4.2). Member-gated; mms_apply_reward re-derives
 * OWNERSHIP (the reward's user_id must equal the caller's uid — so a guessed code that isn't yours is just
 * 'invalid', no enumeration), unredeemed/unexpired, the redemption minimum, and the open+unlocked cart.
 * The reward then rides the discount rail (getCartTotals → mms_reward_discount); it flips to redeemed at
 * fulfillment. Refused mid-pay so it never changes a total a peer is settling.
 */
export async function applyReward(cartId: string, rewardCode: string): Promise<ApplyRewardResult> {
  const input = applyRewardInput.parse({ cartId, rewardCode });
  const { uid, locked, settling } = await assertCartMember(input.cartId);
  if (!(await withinMutationRate(uid))) return { ok: false, reason: "rate_limited" }; // W1·Q6
  if (locked || settling) return { ok: false, reason: "busy" };
  const db = serviceClient();
  const { data, error } = await db.rpc("mms_apply_reward", {
    p_cart: input.cartId,
    p_code: input.rewardCode.toUpperCase(),
    p_user: uid,
  });
  if (error) {
    console.error("[cart] mms_apply_reward failed", error.message);
    return { ok: false, reason: "error" };
  }
  switch (data) {
    case "ok":
      getPostHogClient().capture({
        distinctId: uid,
        event: "reward_applied",
        properties: { cart_id: input.cartId },
      });
      return { ok: true };
    case "min_not_met":
      return { ok: false, reason: "min_not_met" };
    case "in_use":
      return { ok: false, reason: "in_use" };
    case "busy":
      return { ok: false, reason: "busy" };
    case "not_open":
    case "not_found":
      return { ok: false, reason: "cart_closed" };
    default:
      return { ok: false, reason: "invalid" };
  }
}

export type SetFulfillmentResult = { ok: true } | { ok: false; reason: string };

/**
 * Toggle a FOOD line's destination for-here↔to-go (S4 unified basket). Member-gated + canMutateLine
 * (host-any / guest-own, draft only — a fired line can't be re-routed); the RPC refuses a grocery line and
 * RECOMPUTES the line's tax (cold food is taxable only dine-in). The tag, not the session mode, drives
 * routing + tax. Returns a Result so the toggle UI can show an honest reason; touches updated_at via the
 * RPC's row write so peers re-sync.
 */
export async function setLineFulfillment(
  cartItemId: string,
  fulfillment: "dinein" | "togo",
): Promise<SetFulfillmentResult> {
  const input = setLineFulfillmentInput.parse({ cartItemId, fulfillment });
  const { locked, settling, role, lineSeat, lineState, comped, uid } = await assertCartItemMember(
    input.cartItemId,
  );
  await assertMutationRate(uid);
  if (locked || settling) return { ok: false, reason: "busy" };
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }, comped))
    return { ok: false, reason: "not_yours" };
  const { data, error } = await serviceClient().rpc("mms_set_line_fulfillment", {
    p_line: input.cartItemId,
    p_fulfillment: input.fulfillment,
  });
  if (error) {
    console.error("[cart] mms_set_line_fulfillment failed", error.message);
    return { ok: false, reason: "error" };
  }
  if (data !== "ok") return { ok: false, reason: data ?? "error" };
  return { ok: true };
}

/**
 * "Make it now" (S4.2): fire ONE to-go food line to the kitchen early (draft→fired, +10s grace), instead
 * of waiting for checkout. Member-gated + canMutateLine (host-any / guest-own, draft only); mms_fire_line
 * re-derives in SQL that it's an open-cart, draft, `togo` line (a dine-in line uses sendToKitchen's batch;
 * grocery never fires). Returns a Result so the UI shows an honest reason; the RPC's row write touches the
 * line so the KDS + peers re-sync via realtime.
 */
export async function makeItNow(cartItemId: string): Promise<SetFulfillmentResult> {
  const input = makeItNowInput.parse({ cartItemId });
  const { locked, settling, role, lineSeat, lineState, comped, uid } = await assertCartItemMember(
    input.cartItemId,
  );
  await assertMutationRate(uid);
  if (locked || settling) return { ok: false, reason: "busy" };
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }, comped))
    return { ok: false, reason: "not_yours" };
  const { data, error } = await serviceClient().rpc("mms_fire_line", { p_line: input.cartItemId });
  if (error) {
    console.error("[cart] mms_fire_line failed", error.message);
    return { ok: false, reason: "error" };
  }
  if (data !== "ok") return { ok: false, reason: data ?? "error" };
  // No touchCart: mms_fire_line's write to qr_cart_items (state→fired) is itself the realtime trigger the
  // KDS + cart peers subscribe to (same as setLineFulfillment). The grace window is the fire_at stamp.
  return { ok: true };
}

/** Remove the applied reward (member-gated; open + unlocked cart only). Refused mid-pay so it can't drop
 *  the discount the create-intent PI already priced in → a webhook 409 reconcile strand (mms_clear_reward
 *  re-guards locked/settle_at in the statement as the backstop for a direct call). */
export async function clearReward(cartId: string): Promise<{ ok: boolean }> {
  const { uid, locked, settling } = await assertCartMember(cartId);
  if (!(await withinMutationRate(uid))) return { ok: false }; // W1·Q6 — per-device flood guard
  if (locked || settling) return { ok: false };
  const { error } = await serviceClient().rpc("mms_clear_reward", { p_cart: cartId });
  if (error) {
    console.error("[cart] mms_clear_reward failed", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Member-gated read of a cart's lines + server-authoritative totals — the single source the cart
 * UI renders and re-fetches after every mutation (never client math). Totals exclude tip (a
 * pay-step choice). Authorized like every other path (RED-TEAM #2), so it's not an IDOR read.
 */
export async function getCartView(cartId: string): Promise<{
  items: CartItem[];
  totals: CartTotals;
  pickupSlot: string | null;
  /** Effective pay-window lock (P3.2-lock): true while a member is checking out → the UI goes
   *  read-only; `lockedBy` is that seat (map to a name via presence). null/false otherwise. */
  locked: boolean;
  lockedBy: string | null;
  /** Effective split-tender settlement freeze (M3·P3.3b): true while the table pays its shares → the
   *  cart goes read-only for everyone and the UI shows the split board; `settleBy` is the host. */
  settling: boolean;
  settleBy: string | null;
  /** Tab lifecycle (S3.1): `none` until someone opens a tab on this table; `trust`/`secure` once open.
   *  Drives the diner "Keep tab open / settle later" affordance vs. the "Tab open" state on /cart. */
  tabType: "none" | "trust" | "secure";
}> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  const { locked, lockedBy, settling, settleBy } = await assertCartMember(id);
  const db = serviceClient();
  const { data: cart } = await db
    .from("qr_carts")
    .select("pickup_slot,tab_type")
    .eq("id", id)
    .single();
  const { data: rows } = await db
    .from("qr_cart_items")
    .select(
      "id,menu_item_id,name,qty,modifiers,unit_price_cents,tax_cents,by_seat,state,fire_at,comped,fulfillment,notes",
    )
    .eq("cart_id", id)
    .order("created_at", { ascending: true });
  // Resolve which lines are now 86'd so the cart can disable their "+" (QA §D sold-out trap — a peer
  // can 86 an item that's already in a cart). menu_item_id is a soft text ref: a menu_items uuid for
  // restaurant lines, a barcode for grocery. Filter to UUID-shaped ids before the lookup — `id` is a
  // uuid column, so a barcode in the IN-list would error (invalid uuid); grocery lines stay not-sold-out.
  const uuidRe = /^[0-9a-f-]{36}$/i;
  const menuIds = [
    ...new Set((rows ?? []).map((r) => r.menu_item_id).filter((x) => uuidRe.test(x))),
  ];
  const soldOut = new Set<string>();
  if (menuIds.length) {
    // Deliberate swallow: sold-out is an advisory disable on the "+", not load-bearing. A failed
    // lookup degrades to "nothing sold-out" (the worst case is an 86'd line stays incrementable —
    // the server still re-prices on add) rather than blocking the whole cart view.
    const { data: flags } = await db.from("menu_items").select("id,is_sold_out").in("id", menuIds);
    for (const f of flags ?? []) if (f.is_sold_out) soldOut.add(f.id);
  }
  const items: CartItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    menuItemId: r.menu_item_id,
    name: r.name,
    qty: r.qty,
    modifiers: Array.isArray(r.modifiers) ? (r.modifiers as string[]) : [],
    unitPriceCents: r.unit_price_cents,
    taxCents: r.tax_cents,
    bySeat: r.by_seat ?? undefined,
    soldOut: soldOut.has(r.menu_item_id),
    // Kitchen-life state (S2.2): drives the diner UI — a 'draft' line keeps its stepper, a fired/cooking/
    // served line shows its state + "Ask a server" (the server enforces the same rule via canMutateLine).
    lineState: (r.state ?? "draft") as LineState,
    fireAt: r.fire_at ?? null,
    // Comped (S2.3): the kitchen still makes it but the guest isn't charged — the cart shows a "Comped"
    // chip and the totals (getCartTotals) exclude it. Distinct from 'voided' (removed entirely).
    comped: r.comped ?? false,
    // S4 routing tag — drives the cart's destination grouping + the per-food-line for-here/to-go toggle.
    fulfillment: (r.fulfillment ?? "dinein") as CartItem["fulfillment"],
    // W3b: the diner's own kitchen note — visible so it's verifiable (and so a noted line reads
    // differently from an identical plain sibling; the two never merge).
    notes: r.notes ?? null,
  }));
  return {
    items,
    totals: await getCartTotals(id),
    pickupSlot: cart?.pickup_slot ?? null,
    locked,
    lockedBy,
    settling,
    settleBy,
    tabType: (cart?.tab_type ?? "none") as "none" | "trust" | "secure",
  };
}

/**
 * Release the pay-window lock the caller holds (the "Edit order" path). Authorized as a member, then
 * scoped to the caller's own seat (lib/lock releaseCartLock with uid) — a member can only release
 * THEIR lock, never unlock another diner mid-checkout. assertCartMember returns the lock (doesn't
 * throw on it), so this is callable on a locked-but-open cart. Idempotent + safe to call when unlocked.
 */
export async function releasePayLock(cartId: string): Promise<void> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  const { uid } = await assertCartMember(id);
  // W1·Q6 flood guard — a rate-limited release just no-ops (the lock TTL is the backstop, so a
  // legit diner who somehow hits the cap recovers on the next tap or the TTL; never throw here).
  if (!(await withinMutationRate(uid))) return;
  await releaseCartLock(id, uid);
}
