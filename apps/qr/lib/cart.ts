"use server";
import { serviceClient } from "@mms/db/server";
import type { CartItem, CartTotals } from "@mms/db";
import {
  addItemInput,
  applyPromoInput,
  assignLineInput,
  cartViewInput,
  sendToKitchenInput,
  setQtyInput,
  undoFireInput,
} from "@mms/db/schemas";
import type { LineState } from "@mms/db";
import { lineTax } from "./tax";
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

export async function addItem(cartId: string, menuItemId: string, modifierIds: string[] = []) {
  const input = addItemInput.parse({ cartId, menuItemId, modifierIds });
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
  const { name, unitPriceCents, category, opts } = await priceItem(
    input.menuItemId,
    input.modifierIds,
  );
  const taxCents = lineTax(unitPriceCents, category, dineIn);
  // Merge-or-insert via the shared status-atomic core. by_seat = the VERIFIED diner uid (provenance for
  // the by-person split), never a client-asserted seat. Throws "Cart is no longer open" on a closed cart.
  await insertOrIncLine(
    input.cartId,
    { menuItemId: input.menuItemId, name, opts, unitPriceCents, taxCents },
    uid,
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
  const { cartId, locked, settling, role, lineSeat, lineState, uid } = await assertCartItemMember(
    input.cartItemId,
  );
  await assertMutationRate(uid); // per-device flood guard (P3.4)
  if (locked) throw new Error("Order is locked while someone checks out");
  if (settling) throw new Error("The table is settling up — you can’t edit while everyone pays");
  // canMutate (M3·P3.3a → S2.1a): a diner may change/remove only an OWN, still-'draft' line (host any
  // draft; guest own). Once fired, editing is staff-only. Honest reason per case — a fired line isn't an
  // ownership problem (S2.2 also disables the control client-side + adds the undo path).
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }))
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
}

/**
 * Reassign a cart line to a seat (M3·P3.3a, by-person split). Authorized as a member, canMutateLine
 * (host-any / guest-own-only), and only while unlocked; the target seat must be a member of THIS
 * session (you can't assign a line to a stranger). Touches updated_at so peers re-sync (P3.2).
 */
export async function assignLine(cartItemId: string, seatId: string) {
  const input = assignLineInput.parse({ cartItemId, seatId });
  const { cartId, sessionId, locked, settling, role, lineSeat, lineState, uid } =
    await assertCartItemMember(input.cartItemId);
  await assertMutationRate(uid); // per-device flood guard (P3.4)
  if (locked) throw new Error("Order is locked while someone checks out");
  if (settling) throw new Error("The table is settling up — you can’t edit while everyone pays");
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }))
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
  | { ok: true; fired: number; undoUntil: string | null }
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
  const { data: fired, error } = await db.rpc("mms_fire_cart", {
    p_cart_id: input.cartId,
  });
  if (error) {
    console.error("[cart] mms_fire_cart failed", { cartId: input.cartId, message: error.message });
    return { ok: false, reason: "error" };
  }
  if (!fired) return { ok: false, reason: "nothing" }; // empty cart / nothing still draft / not dine-in
  await touchCart(input.cartId, "sendToKitchen");

  // The batch's grace deadline = the latest fire_at among the lines just fired (all share now()+grace
  // from the single UPDATE; an earlier elapsed batch has a smaller fire_at, so DESC picks this one).
  // Server-clocked so the client counts down to DB truth, not its own clock. A miss → no undo window
  // shown (the line is still server-side undoable; the button just won't offer it) rather than a fake one.
  const { data: deadline } = await db
    .from("qr_cart_items")
    .select("fire_at")
    .eq("cart_id", input.cartId)
    .eq("state", "fired")
    .order("fire_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  getPostHogClient().capture({
    distinctId: uid,
    event: "send_to_kitchen",
    properties: { cart_id: input.cartId, lines: fired },
  });
  return { ok: true, fired, undoUntil: deadline?.fire_at ?? null };
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
 * null for every line on the cart still in grace; a line whose grace already passed is left fired, so
 * undo can't un-send food the kitchen already has). `expired` (0 rows un-fired) is the honest signal that
 * the window closed / nothing was undoable → the UI steers to "ask a server", never a silent success.
 * Returned (not thrown) for the same prod-redaction reason as sendToKitchen.
 */
export async function undoFire(cartId: string): Promise<UndoFireResult> {
  const input = undoFireInput.parse({ cartId });
  const { uid, role, locked, settling } = await assertCartMember(input.cartId);
  if (!(await withinMutationRate(uid))) return { ok: false, reason: "rate_limited" };
  if (locked) return { ok: false, reason: "locked" };
  if (settling) return { ok: false, reason: "settling" };
  if (role !== "host") return { ok: false, reason: "not_host" };

  const { data: unfired, error } = await serviceClient().rpc("mms_undo_fire", {
    p_cart_id: input.cartId,
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
}> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  const { locked, lockedBy, settling, settleBy } = await assertCartMember(id);
  const db = serviceClient();
  const { data: cart } = await db.from("qr_carts").select("pickup_slot").eq("id", id).single();
  const { data: rows } = await db
    .from("qr_cart_items")
    .select("id,menu_item_id,name,qty,modifiers,unit_price_cents,tax_cents,by_seat,state,fire_at")
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
  }));
  return {
    items,
    totals: await getCartTotals(id),
    pickupSlot: cart?.pickup_slot ?? null,
    locked,
    lockedBy,
    settling,
    settleBy,
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
  await releaseCartLock(id, uid);
}
