"use server";
import { serviceClient } from "@mms/db/server";
import type { CartItem, CartTotals } from "@mms/db";
import {
  addItemInput,
  applyPromoInput,
  applyRewardInput,
  assignLineInput,
  cartViewInput,
  releaseAttemptInput,
  makeItNowInput,
  sendToKitchenInput,
  setKioskTipInput,
  setLineFulfillmentInput,
  setLineNotesInput,
  setQtyInput,
  undoFireInput,
} from "@mms/db/schemas";
import type { LineState } from "@mms/db";
import { nudgeLive, type SendNudge } from "./send-nudge-state";
import { lineTax } from "./tax";
import { getCartTotals } from "./totals";
import { assertCartItemMember, assertCartMember, AuthzError, UNAVAILABLE } from "./authz";
import { assertMutationRate, withinMutationRate } from "./rate";
import { canMutateLine } from "./permissions";
import { releasePayAttemptSafely } from "./supersede";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS, effectiveFreeze } from "./lock-ttl";
// P3 — the refusal diagnosis moved to its own server-only module when `lib/staff-promo.ts`
// became the second writer of `qr_carts.promo_code`. One verdict, both doors; see its docblock.
import { refusedPromoReason } from "./promo-refusal";
// J37 — an undo that took back nothing: the ONE diagnosis both undos read (lib/undo-miss.ts).
import { undoMissReason } from "./undo-miss";
import { classifyRelease, classifyZeroRow, normalizeEra, type PayLockRelease } from "./pay-attempt";
import { getPostHogClient } from "./posthog-server";
import { insertOrIncLine, ItemUnsellableError, priceItem, touchCart } from "./order-lines";
import { dishAvailability, sendBlockers } from "./availability-read";
import { dishUnavailable, type Unavailable } from "./availability";
import { dbClockIso } from "./db-clock";
import type { ServerRefusal } from "./cart-freeze";
import { CartPayingError, lineRpcRefusal, rpcDishUnavailable } from "./line-rpc-refusal";
import { safeImageUrl } from "./media-url";
import { TABLE_STARTER_MID } from "./confirm-copy";
import { removedReasons } from "./line-state-copy";

/**
 * The view a MUTATION returns — and it must never fail the mutation.
 *
 * ⚠️ THE WRITE HAS ALREADY COMMITTED BY THE TIME THIS RUNS. `addItem` and `setQty` insert or bump
 * the row, touch the cart, and only THEN render a view, so a failure here says nothing about whether
 * the diner's tap landed. Both of the plausible answers are wrong:
 *
 *   • RESOLVING with a blank view (what shipped before T21(a)) hands the caller an empty cart as
 *     server truth — `TableCartProvider` applied it and the basket vanished under an optimistic
 *     "Added to your order";
 *   • THROWING (T21(a)'s first draft, and the blind pass caught it) tells every caller the WRITE
 *     failed. `/grocery` then rolls its optimistic list back to the pre-tap snapshot — UI 2, server
 *     3, and checkout charges 3, which is the exact invariant that file's own comment forbids — and
 *     `KioskMenu` leaves the sheet open with "something went wrong", inviting the operator to re-tap
 *     an add that already committed and charging the guest twice.
 *
 * So it answers `null`: *the write landed, the view could not be read*. Callers that ignore the
 * return value are unaffected; callers that render it re-read instead of painting a lie.
 */
async function viewAfterWrite(
  cartId: string,
): Promise<Awaited<ReturnType<typeof getCartView>> | null> {
  try {
    return await getCartView(cartId);
  } catch {
    // Deliberate, and narrow: the ONLY thing swallowed here is our inability to RENDER the result of
    // a write that already succeeded. `getCartView` still throws for every plain reader.
    return null; // written, unreadable — NEVER a refused write
  }
}

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
  const { uid, locked, settling, mode } = await assertCartMember(input.cartId);
  await assertMutationRate(uid); // per-device flood guard (P3.4) — after authz, before the write
  if (locked) throw new Error("Order is locked while someone checks out");
  if (settling) throw new Error(ADD_WHILE_PAYING);
  return addItemWrite({ input, uid, mode });
}

const ADD_WHILE_PAYING = "Your table is paying — you can’t change the order while everyone pays";
type AddItemDoor = {
  input: ReturnType<typeof addItemInput.parse>;
  uid: string;
  mode: Awaited<ReturnType<typeof assertCartMember>>["mode"];
};

/** `addItem`'s write: price, insert-or-merge (status- and freeze-atomic in its RPC), touch, view.
 *  Behind a door that already authorized, rate-counted and refused the freezes — `addItem`'s own,
 *  or `addItemOutcome`'s, whose restock retry re-runs THIS only (the capped blind pass on #362: a
 *  retry through `addItem` counted one tap twice against the device's rate limit). */
async function addItemWrite({ input, uid, mode }: AddItemDoor) {
  // M108 — the mode comes from `assertCartMember`, which read it off the SAME row it used to prove
  // the session is active and throws 503 when that read fails. The second read this replaced
  // discarded its error, so an unreadable session tagged a dine-in table's line `togo` and charged
  // the to-go tax — under-collecting, which M97 calls the legally worse direction of the two.
  const dineIn = mode === "dinein";
  // S4 unified basket: a food line's fulfillment defaults from context — a dine-in table → 'dinein', any
  // other entry (pickup/scan) → 'togo'. The diner can toggle it per line; the tag (not the session mode)
  // drives routing and per-line tax. W17a: it does NOT drive the price — dine-in and to-go ring the same
  // POS price (the 15% that separated them at the register was the retired service charge).
  const fulfillment = dineIn ? "dinein" : "togo";
  // Diner add: enforce modifier requiredness/cardinality SERVER-side (the client "Choose" gate is advisory)
  // — a forged/stale client can't add a required-modifier item without its required choice.
  const { name, unitPriceCents, category, opts, optionIds } = await priceItem(
    input.menuItemId,
    input.modifierIds,
    { enforceCardinality: true },
  );
  const taxCents = lineTax(unitPriceCents, category, dineIn);
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
      optionIds, // M3 — the stable ids ride the line beside the labels
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
  // same warm function — cheap next to a second network round-trip. `null` = written but unreadable;
  // see `viewAfterWrite`, and never conflate it with a refused write.
  return viewAfterWrite(input.cartId);
}

/**
 * Lifecycle audit (out-of-stock 0) — the DINER's add, with a sold-out refusal answered as a VALUE.
 *
 * `priceItem` refuses an 86'd (or delisted) dish with a sentence of its own — but it THROWS, and
 * Next redacts a thrown Server Action's message in production, so /menu never heard it: the
 * provider re-read the cart, found no lock, and hedged "We couldn’t confirm Mohinga — the order
 * below is up to date." over a card that stayed live, and every retry met the same hedge. The refusal
 * is DEFINITE — `priceItem` runs before `insertOrIncLine`, so nothing was written — and so it can be
 * named, the M230 shape (`ServerRefusal`, lib/cart-freeze.ts). `at` is the DATABASE clock as it
 * refused (`dbClockIso`, #362): the menu weighs the mark against its catalog render stamp and the
 * cart view's `dbNow` — one clock for all three, never the phone's or an app server's.
 *
 * A WRAPPER, not a change to `addItem`'s contract: the kiosk awaits `addItem` raw and reads any
 * answer as a landing (`KioskMenu`'s `landed`), so a refusal-as-value there would be counted as an
 * added dish. Every other outcome is `addItem`'s own, untouched — including its throws.
 */
export async function addItemOutcome(
  cartId: string,
  menuItemId: string,
  modifierIds: string[] = [],
  notes?: string,
  qty?: number,
): Promise<
  { ok: true; view: Awaited<ReturnType<typeof addItem>> } | ({ ok: false } & ServerRefusal)
> {
  // The door, ONCE — the same refusals as `addItem`'s, in this function so `check:freeze-parity`
  // reads them here: a retry below re-runs the write, never the door (its rate count included).
  const input = addItemInput.parse({ cartId, menuItemId, modifierIds, notes, qty });
  const { uid, locked, settling, mode } = await assertCartMember(input.cartId);
  await assertMutationRate(uid);
  if (locked) throw new Error("Order is locked while someone checks out");
  if (settling) throw new Error(ADD_WHILE_PAYING);
  const authorized: AddItemDoor = { input, uid, mode };
  try {
    return { ok: true, view: await addItemWrite(authorized) };
  } catch (e) {
    // ONLY the availability refusal becomes a value. It is thrown from `priceItem`, BEFORE the
    // insert, so nothing landed; every other throw keeps its old meaning (it may have committed).
    // #362 (Codex round 1) — WHICH refusal travels: an 86 (`sold_out`), or a dish no longer on the
    // menu (`gone`). Folding a delisting into "sold out" told the diner it was coming back.
    if (!(e instanceof ItemUnsellableError)) throw e;
    // Codex P2 on #362 — the stamp is taken BEFORE a read that confirms the refusal, never after
    // `priceItem`'s: a stamp later than the read that found the 86 can postdate a restock and a cart
    // view that read the dish available, and the stale mark then outvoted it on /menu.
    const { at, why } = await stampThenConfirm(menuItemId, "addItemOutcome");
    if (why) return { ok: false, refused: why, at };
    // Restocked (or unreadable) since `priceItem` refused: NOTHING was written, so the diner's add is
    // asked once more — its own `priceItem` read follows the stamp, so a second refusal carries it.
    try {
      return { ok: true, view: await addItemWrite(authorized) };
    } catch (again) {
      if (again instanceof ItemUnsellableError) return { ok: false, refused: again.reason, at };
      throw again;
    }
  }
}

/**
 * Codex P2 on #362 — a sold-out REFUSAL's stamp, taken no later than a read that saw the dish
 * unavailable. /menu weighs the refusal's mark against the cart view's `dbNow` (`freshestSoldOut`),
 * so a stamp read AFTER the availability read claims a freshness it does not have: a restock and a
 * cart view in between read "available" at an earlier instant, and the stale mark won. So: the DB
 * clock first, then a fresh `dishAvailability` read. `why` null = the dish can be made now (or the
 * read failed) — the caller decides what a refusal that no longer holds means.
 */
async function stampThenConfirm(
  menuItemId: string,
  context: string,
): Promise<{ at: string; why: Unavailable | null }> {
  const at = await dbClockIso(context);
  const now = await dishAvailability(menuItemId);
  return { at, why: now === "sold_out" || now === "gone" ? now : null };
}

/**
 * Lifecycle audit (edit-notes 6 · out-of-stock 1) — a definite, NAMED refusal comes back as a VALUE
 * (`ServerRefusal`); everything else is unchanged (a view, `null` for written-but-unreadable, or a
 * throw). The two named ones:
 *
 *   • `not_draft` — the line already went to the kitchen: the pre-check saw it, or the RPC's own
 *     re-check under the row lock raised `sent` (P2dd). It used to THROW "Ask our staff…", which the
 *     redaction swallowed, so a menu "−" on a dish a tablemate had just sent said "Removed Mohinga",
 *     then hedged "We couldn’t confirm that", while the dish was cooking and stayed on the bill;
 *   • `sold_out` / `gone` — the write would GROW a line whose dish the kitchen can no longer make
 *     (/cart's "+" on a draft whose dish was 86'd, or delisted, after the view that drew it). WHICH
 *     one travels (#362). Shrinking and removing are always allowed: they are the way OUT of it;
 *   • `voided` — staff REMOVED the line (#362 blind pass 8). It used to answer `not_draft`, and the
 *     provider then said "it's already gone to the kitchen" about a dish that had been taken off.
 */
export async function setQty(cartItemId: string, qty: number) {
  const input = setQtyInput.parse({ cartItemId, qty });
  const { cartId, locked, settling, role, lineSeat, lineState, comped, uid, lineQty, menuItemId } =
    await assertCartItemMember(input.cartItemId);
  await assertMutationRate(uid); // per-device flood guard (P3.4)
  if (locked) throw new Error("Order is locked while someone checks out");
  if (settling)
    throw new Error("Your table is paying — you can’t change the order while everyone pays");
  // Lifecycle audit (edit-notes 6) — a line that LEFT draft is the server's own fact to NAME, the M230
  // order `setLineFulfillment` already uses: before the ownership rule, which also answers for it.
  if (lineState === "voided") return { refused: "voided", at: new Date().toISOString() } as const;
  if (lineState !== "draft") return { refused: "not_draft", at: new Date().toISOString() } as const;
  // canMutate (M3·P3.3a → S2.1a): a diner may change/remove only an OWN, still-'draft' line (host any
  // draft; guest own). Once fired, editing is staff-only. A comped line is immutable (S2-audit B1). Honest
  // reason per case — a fired line isn't an ownership problem (S2.2 also disables the control client-side).
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }, comped))
    throw new Error(
      lineState === "draft"
        ? `Only ${TABLE_STARTER_MID} can change someone else’s item`
        : "Ask our staff to change an item that’s already gone to the kitchen",
    );
  // Lifecycle audit (out-of-stock 1) — never GROW a line whose dish the kitchen can no longer make.
  // Only a growth asks (one read, off the hot "−" path); `null` (unknowable, or a grocery barcode)
  // is FAIL-OPEN like every availability pre-read — the charge boundary re-reads regardless. The
  // window between this read and the RPC is the same race `priceItem`'s add-time gate accepts.
  if (input.qty > lineQty) {
    const availability = await dishAvailability(menuItemId);
    if (availability === "sold_out" || availability === "gone") {
      // Codex P2 on #362 — stamped BEFORE a read that confirms it (`stampThenConfirm`); restocked in
      // between, the growth lands (the gate's own fail-open posture for a dish it cannot refuse).
      const { at, why } = await stampThenConfirm(menuItemId, "setQty");
      if (why) return { refused: why, at } as const;
    }
  }
  const db = serviceClient();
  // Status-atomic set/delete (qty<=0 removes) — applies only while the parent cart is 'open' in one
  // statement (migration 20260619000200), matching the addItem paths. 0 rows ⇒ paid/closed (or gone).
  const { data: affected, error: qtyErr } = await db.rpc("mms_cart_item_set_qty_if_open", {
    p_id: input.cartItemId,
    p_qty: input.qty,
  });
  // P2dd · P2cy — the RPC re-checks, under the cart's row lock, the two facts read above: the host
  // (or staff) sent it to the kitchen, or the table started paying, in between. Both are definite
  // refusals and say what the pre-checks would have said.
  const refusal = lineRpcRefusal(qtyErr);
  if (refusal === "sent")
    // Lifecycle audit — named, not thrown (see the docblock): the raise aborted, nothing landed.
    return { refused: "not_draft", at: new Date().toISOString() } as const;
  // #362 (Codex P2) — the GROWTH gate under the row lock (20261018140000): `lineQty` above was read
  // before this call, so a concurrent decrease could make a stale request a growth the pre-read never
  // saw. The RPC compares against the quantity it replaces, and stamps the refusal itself.
  const dish = rpcDishUnavailable(qtyErr);
  if (dish) return { refused: dish.why, at: dish.at } as const;
  if (refusal === "paying") throw new CartPayingError();
  if (!affected) throw new Error("Cart is no longer open");
  const { error: touchErr } = await db
    .from("qr_carts")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", cartId);
  if (touchErr) console.error("[cart] updated_at touch failed (setQty)", touchErr.message);
  // Return the fresh server-authoritative view so the caller re-syncs in ONE round-trip (mirrors
  // addItem) instead of a separate getCartView afterward — the "cart actions feel delayed" fix. The
  // amounts stay server-derived here; the client never re-prices. Callers that don't need the view
  // (Checkout keeps its own optimistic layer) simply ignore it. `null` = written but unreadable.
  return viewAfterWrite(cartId);
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
  if (settling)
    throw new Error("Your table is paying — you can’t change the order while everyone pays");
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }, comped))
    throw new Error(
      lineState === "draft"
        ? `Only ${TABLE_STARTER_MID} can move someone else’s item`
        : "Ask our staff to change an item that’s already gone to the kitchen",
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
  if (error) throw new Error("Couldn’t move that item");
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
    }
  /** Lifecycle audit (out-of-stock 1) — dine-in drafts whose dish the kitchen can no longer make;
   *  nothing was fired. Each dish carries the catalog's name and WHY (#362 — sold out, or no longer
   *  on the menu), for the sentence (`unavailableSendNotice`). */
  | {
      ok: false;
      reason: "unavailable";
      dishes: { name: string; why: Unavailable }[];
    };

/**
 * Send the table's current draft batch to the kitchen (S2.1b, dine-in). "Send to kitchen" fires
 * EVERYONE's draft lines — a table-level action — so it follows the host-authority model: a guest adds
 * their own items, the HOST sends the batch (staff can always fire from the console via `staffFireCart`
 * in lib/staff-send.ts — the table page's Send, Phase 2a).
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
  // Lifecycle audit (out-of-stock 1 · kitchen-board-sync 6) — `mms_fire_cart` reads no availability,
  // so a dish 86'd while it sat in a cart went to the board with the rest. Refuse the Send and NAME
  // the dishes; the guest removes them and sends the rest. Fail-open on an unreadable catalog (a
  // secondary check must never stop a table's food). The read→fire race is filed for the SQL fix.
  const blocking = await sendBlockers(input.cartId);
  if (blocking.length > 0)
    return {
      ok: false,
      reason: "unavailable",
      dishes: blocking.map((d) => ({ name: d.name, why: d.why })),
    };

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
  | { ok: true; unfired: number; gone: boolean }
  | {
      ok: false;
      reason: "not_host" | "expired" | "voided" | "locked" | "settling" | "rate_limited" | "error";
    };

/**
 * Undo the just-sent batch within the grace window (S2.2). The symmetric inverse of sendToKitchen — same
 * host-authority + dine-in model — driving the grace-gated, atomic mms_undo_fire (fired→draft + fire_at
 * null; a line whose grace already passed is left fired, so undo can't un-send food the kitchen already
 * has). S4-audit P1-3: undo targets the SPECIFIC `batch` sendToKitchen handed back — so a host's Undo
 * reverses only the host's batch, never a guest's make-it-now (S4.2) line sharing the grace window.
 * A 0 is read by `undoMissReason` (lib/undo-miss.ts), never guessed: `expired` (the kitchen has the
 * batch and none of it is still undoable) is the honest signal that the window closed → the UI steers
 * to "ask a server", never a silent success; `frozen` (lines the un-fire could move are still in their
 * grace — J45) is the freshness legs' REFUSAL, answered with the lock's own reason so the window stays;
 * `voided` (staff voided what was sent) closes it with a sentence that claims nothing came back; `gone`
 * (the cart still open and NO line carries the batch) is a SUCCESS: an earlier undo of this batch
 * landed and its answer was lost (J37), so asking again is idempotent. Returned (not thrown) for the
 * same prod-redaction reason.
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
  if (!unfired) {
    // J37 — a 0 is several facts, and a diner's re-ask after a LOST response is one of them: un-fire
    // clears `fire_batch`, so no line carrying the batch on an open cart means an earlier undo of it
    // LANDED. One diagnosis for both undos (lib/undo-miss.ts); an unread check stays `expired`.
    const miss = await undoMissReason(input.cartId, input.batch);
    if (miss === "gone") return { ok: true, unfired: 0, gone: true }; // already brought back — not a second undo (no touch, no count)
    // Staff voided the batch: nothing is cooking and nothing came back — never "Brought back".
    if (miss === "voided") return { ok: false, reason: "voided" };
    if (miss === "frozen") {
      // J45 — dishes the un-fire could move are still in their grace, so the RPC's freshness legs
      // (M258) refused it: a pay lock or split freeze. The window stays for the rest of the grace and a
      // re-tap lands once the freeze lifts. Authz's EFFECTIVE flags pick only the SENTENCE (never
      // re-derived here), and a lock already freed again — taken and released inside one checkout —
      // still reads `locked`: "That didn't go through — please try again." is true of it.
      const again = await assertCartMember(input.cartId).catch(() => null);
      return { ok: false, reason: again?.settling ? "settling" : "locked" };
    }
    return { ok: false, reason: "expired" };
  }
  await touchCart(input.cartId, "undoFire");

  getPostHogClient().capture({
    distinctId: uid,
    event: "undo_fire",
    properties: { cart_id: input.cartId, lines: unfired },
  });
  return { ok: true, unfired, gone: false };
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

  // FREEZE-atomic write, not merely status-atomic (M70, Codex round 2 P1). The `locked || settling`
  // refusal above is read at authz time, and TWO awaited RPCs run between it and this UPDATE — long
  // enough for a tablemate to reach the pay screen, take the lock, and pin the grant. A write gated
  // only on `status = 'open'` sails through that and clears a LIVE attempt's pin: its PaymentIntent
  // was minted under the old code, the webhook re-derives under the new one, and the amounts
  // disagree — `reconcile_mismatch` after the card is charged. The freeze has to be re-tested in the
  // same statement that writes, which is the same rule every other mutation here follows for status.
  //
  // The predicates mirror `assertCartMember`'s EFFECTIVE checks (authz.ts:168-175), not the raw
  // columns: a lock is only real while `locked_at` is within CART_LOCK_TTL, and `locked = true` with
  // a null `locked_at` is not a lock. Diverging here would refuse promos the UI still offers.
  //
  // ⚠️ `{ count: "exact" }` and NOT `.select("id")`. A mutation with `.select()` asks PostgREST for
  // `return=representation`, and PostgREST 14 re-applies the top-level `or()` against the RETURNING
  // projection — with only `id` in scope, `locked` falls out and the whole UPDATE 400s with 42703.
  // That is documented at `lock.ts:49-56`, where it once gave every checkout a spurious 409.
  const normalized = input.code.toUpperCase();
  const lockCutoff = new Date(Date.now() - CART_LOCK_TTL_MS).toISOString();
  const settleCutoff = new Date(Date.now() - SETTLE_TTL_MS).toISOString();
  const { count, error: updErr } = await db
    .from("qr_carts")
    // M70 — a new code voids any grant pinned for the OLD one, and it rides in the SAME statement
    // as the code write so the two cannot drift apart. (`mms_pin_promo_grant` only pins when null,
    // so a stale grant left here would silently outrank the code the diner just entered.)
    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })
    .eq("id", input.cartId)
    .eq("status", "open")
    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)
    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)
    // M152 (a) — and NO LIVE INTENT. The freeze predicate above is deliberately TTL-aware, so five
    // minutes after a captured intent whose webhook is merely late, a tablemate's code passed it
    // and nulled the pin that capture reconciles against: a charged card and no order. The pin
    // outlives the lock (M70); this is the term that makes that true for THIS writer.
    .is("live_payment_intent_id", null);
  if (updErr) return { ok: false, reason: "error" };
  if ((count ?? 0) === 0) return { ok: false, reason: await refusedPromoReason(input.cartId) };

  getPostHogClient().capture({
    distinctId: uid, // the verified diner uid (matches add_to_cart) — not the cart id
    event: "promo_applied",
    properties: {
      cart_id: input.cartId,
      promo_code: normalized,
      // The QUOTE, not the outcome: what the code is worth against the basket as it stands right
      // now. A reward, a void or a comp landing afterwards all move what is actually delivered, and
      // M22's reward-first clamp can take it to 0. The delivered figure is `promo_cents` on
      // `payment_succeeded` / `staff_settle_cash` — the one fulfillment consumes a redemption on.
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
 * routing + tax — but M100 bounds WHICH tags a session can reach: `mms_set_line_fulfillment` re-derives
 * `table_sessions.mode` and answers `not_dinein_session` when a pickup/scango cart asks for `dinein`,
 * because `Checkout.tsx`'s `isDineIn &&` render gate is advisory on a public POST. The refusal is
 * one-directional — `togo` stays reachable on every mode, so an already-mis-tagged line can be repaired.
 * The rule has ONE home and it is the SQL statement; nothing here re-derives it. Returns a Result so the
 * toggle UI can show an honest reason; touches updated_at via the RPC's row write so peers re-sync.
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
  // M230 — a line that has LEFT DRAFT cannot be re-routed, and that is a fact to NAME, in the RPC's
  // own word: folded into `not_yours` (which `canMutateLine` also answers for ownership and comps) it
  // was the one reason /cart could not speak, though it is the reachable one — the dine-in kitchen
  // batch fires the line between this diner's read and the tap.
  if (lineState !== "draft") return { ok: false, reason: "not_draft" };
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }, comped))
    return { ok: false, reason: "not_yours" };
  // M17 — no `priceItem` call here, so nothing in TS re-reads the menu item on a flip. It doesn't
  // need to: the line carries its own `tax_category`, stamped at insert and read by the RPC, so a
  // catalog row pruned mid-session can no longer change what this toggle charges.
  // W17a — the toggle is TAX-ONLY again. Under mode pricing it had to re-derive the charged
  // price on every flip; now dine-in and to-go are the same POS price, so a flip changes only the
  // routing tag and the per-line tax (cold food is taxable dine-in, exempt to-go). The SQL fn keeps
  // its `p_unit_price_cents` parameter — omitted here, which is its documented "leave the price
  // alone" path — so no migration is needed to undo this.
  const db = serviceClient();
  const { data, error } = await db.rpc("mms_set_line_fulfillment", {
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
 * grocery never fires) on a DINE-IN session (M107 — pickup and scan-and-go are pay-first, so their food
 * reaches the kitchen through `mms_fire_pending_food` at settlement, never from an open cart; before that
 * gate an unpaid pickup cart could put a line on the KDS, since `kitchen.ts` reads carts in open+paid).
 * Returns a Result so the UI shows an honest reason; the RPC's row write touches the line so the KDS +
 * peers re-sync via realtime.
 */
export async function makeItNow(cartItemId: string): Promise<SetFulfillmentResult> {
  const input = makeItNowInput.parse({ cartItemId });
  const { locked, settling, role, lineSeat, lineState, comped, uid, menuItemId } =
    await assertCartItemMember(input.cartItemId);
  await assertMutationRate(uid);
  if (locked || settling) return { ok: false, reason: "busy" };
  // M230 — already with the kitchen: the same fact as the toggle's, in the word `mms_fire_line`
  // itself answers, never folded into the ownership reason.
  if (lineState !== "draft") return { ok: false, reason: "not_draft" };
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }, comped))
    return { ok: false, reason: "not_yours" };
  // Lifecycle audit (out-of-stock 1) — "Send to kitchen now" on a dish the kitchen can no longer
  // make: refused and NAMED with WHY (`serverNamedRefusal` — `sold_out` or `gone`, #362), never
  // fired. Fail-open on `null`.
  const availability = await dishAvailability(menuItemId);
  if (availability === "sold_out" || availability === "gone")
    return { ok: false, reason: availability };
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

export type SetLineNoteResult =
  | { ok: true }
  /** #362 (blind pass 1) — the note on the order is no longer the one the sheet was seeded from:
   *  someone (staff, the host) wrote it while the sheet was open. NOTHING was written; `notes` is the
   *  note now on the order, so the sheet re-seeds from it and the view says so. */
  | { ok: false; reason: "changed"; notes: string | null }
  | {
      ok: false;
      /** `busy` a pay lock / split freeze · `not_draft` the line went to the kitchen (named, M230) ·
       *  `voided` staff removed it (named — never "gone to the kitchen") · `not_yours` a guest's note
       *  on someone else's dish, or a comp · `closed` the cart is no longer open · `stale` a race the
       *  reason does not name · `rate_limited` · `error`. */
      reason:
        | "busy"
        | "not_draft"
        | "voided"
        | "not_yours"
        | "closed"
        | "stale"
        | "rate_limited"
        | "error";
    };

/**
 * Lifecycle audit (edit-notes 3) — the DINER adds, changes or clears the kitchen note on their own
 * UNSENT dish ("no peanuts — allergy"). Before this the note was read-only on /cart ("remove/re-add
 * to change it"), so a diner who only wanted to add an allergy had to trash the dish, find it on the
 * menu, re-pick its options and type the note — and some would skip the note — while a server could
 * edit the very same draft note from the floor (`setLineNotes`). The diner was the only party with
 * no edit path to their own allergy channel.
 *
 * Guarded like the other draft-only diner writes: member-gated (`assertCartItemMember`), rate-
 * limited, refused under a pay lock or split freeze, `not_draft` NAMED before the ownership rule
 * (M230's order — `voided` for a line staff removed), then `canMutateLine` (host any draft, guest
 * their own, never a comp). The UPDATE itself carries the line's guards IN THE STATEMENT — this line,
 * this cart, still `draft`, not comped, for a guest still their own seat, and the note still the one
 * the sheet was seeded from (`seen`, a compare-and-swap — #362) — and its row count is READ
 * (`.select("id")`): a blocked UPDATE answers success otherwise (the W17 lesson).
 *
 * The cart's `open` status and its two freezes live on `qr_carts`, which one PostgREST UPDATE on
 * `qr_cart_items` cannot test, so they are RE-READ in one query immediately before the write —
 * `status,locked,locked_at,settle_at`, judged by `effectiveFreeze`, the rule `assertCartMember`
 * applies (#362 blind pass 5: this read used to take `status` alone while this paragraph claimed the
 * freezes). That narrows the window to the gap between two statements; it does not close it. A note
 * carries no money, so the residual costs at most a note landing beside a payment; a status-atomic
 * RPC (with options editing) is filed as needing a migration (M299). `touchCart` re-syncs every
 * phone at the table.
 *
 * ⚠️ THE COMPARE-AND-SWAP (`seen`). The sheet seeds its field from the line once; a staff allergy
 * note written while it was open was overwritten on Save — or, with the field untouched, ERASED (the
 * button became "Remove the note"). So the write lands only while the stored note is still `seen`
 * (`notes is null` for an empty one: every writer stores an empty note as NULL — this one, staff
 * `setLineNotes`, `addItem`'s `|| undefined`). On zero rows the re-read names `changed` and hands
 * back the note now on the order. Never a silent overwrite.
 */
export async function setLineNote(
  cartItemId: string,
  notes: string,
  seen: string,
): Promise<SetLineNoteResult> {
  // Zod trims and bounds it at 160, the column CHECK's own bound (`qr_cart_items.notes`).
  const parsed = setLineNotesInput.safeParse({ cartItemId, notes });
  if (!parsed.success) return { ok: false, reason: "error" };
  // `seen` is compared RAW against the stored value, so it carries the column's own bound and no
  // trim; anything else is a value the sheet could never have been seeded from.
  if (typeof seen !== "string" || seen.length > 160) return { ok: false, reason: "error" };
  const input = parsed.data;
  const { cartId, locked, settling, role, lineSeat, lineState, comped, uid } =
    await assertCartItemMember(input.cartItemId);
  if (!(await withinMutationRate(uid))) return { ok: false, reason: "rate_limited" };
  if (locked || settling) return { ok: false, reason: "busy" };
  if (lineState === "voided") return { ok: false, reason: "voided" };
  if (lineState !== "draft") return { ok: false, reason: "not_draft" };
  if (!canMutateLine(lineState, { kind: "diner", role, isOwner: lineSeat === uid }, comped))
    return { ok: false, reason: "not_yours" };
  const db = serviceClient();
  const { data: cartRow, error: cartErr } = await db
    .from("qr_carts")
    .select("status,locked,locked_at,settle_at")
    .eq("id", cartId)
    .maybeSingle();
  if (cartErr) return { ok: false, reason: "error" };
  if (cartRow?.status !== "open") return { ok: false, reason: "closed" };
  const freeze = effectiveFreeze(cartRow, Date.now());
  if (freeze.locked || freeze.settling) return { ok: false, reason: "busy" };
  let write = db
    .from("qr_cart_items")
    .update({ notes: input.notes || null })
    .eq("id", input.cartItemId)
    .eq("cart_id", cartId)
    .eq("state", "draft")
    .eq("comped", false);
  // A guest's note may only ever land on a dish that is STILL theirs (a reassign can move it).
  if (role !== "host") write = write.eq("by_seat", uid);
  // The compare-and-swap (see the docblock): only over the note the sheet was seeded from.
  write = seen === "" ? write.is("notes", null) : write.eq("notes", seen);
  const { data: noted, error: noteErr } = await write.select("id");
  if (noteErr) {
    console.error("[cart] setLineNote failed", noteErr.message);
    return { ok: false, reason: "error" };
  }
  if (!noted || noted.length === 0) {
    // Zero rows: a guard in the statement refused. Name only what a re-read establishes — a line
    // that left draft is the kitchen's (M230) or staff's (`voided`), a note that is no longer the one
    // the sheet saw is `changed`; anything else is a race we do not name.
    const { data: now } = await db
      .from("qr_cart_items")
      .select("state,notes")
      .eq("id", input.cartItemId)
      .maybeSingle();
    if (now?.state === "voided") return { ok: false, reason: "voided" };
    if (now && now.state !== "draft") return { ok: false, reason: "not_draft" };
    if (now && (now.notes ?? "") !== seen)
      return { ok: false, reason: "changed", notes: now.notes ?? null };
    return { ok: false, reason: "stale" };
  }
  await touchCart(cartId, "setLineNote");
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
  /** The cart's fire-time (W2 pickup). NULL with a set `pickupSlot` marks an ASAP snap (fire now);
   *  a non-null value is an intentional schedule (`slot - prep`). Lets the checkout seed ASAP vs scheduled. */
  fireAt: string | null;
  /** Effective pay-window lock (P3.2-lock): true while a member is checking out → the UI goes
   *  read-only; `lockedBy` is that seat (map to a name via presence). null/false otherwise. */
  locked: boolean;
  lockedBy: string | null;
  /** W9b — the VIEWER's own seat. The checkout must decide whether `lockedBy` is a peer's seat or its
   *  own, and its only previous source for that was `SplitContext`, which `app/cart/page.tsx` nulls on
   *  ANY read failure — leaving the lockbar silent and every control live on exactly the cart that is
   *  refusing writes. This comes from the same `assertCartMember` call that produced `lockedBy`, so the
   *  comparison can never be defeated by a second read failing. */
  mySeat: string;
  /** Effective split-tender settlement freeze (M3·P3.3b): true while the table pays its shares → the
   *  cart goes read-only for everyone and the UI shows the split board; `settleBy` is the host. */
  settling: boolean;
  settleBy: string | null;
  /** Tab lifecycle (S3.1 → W12): `none`/`trust` vs `secure`. Diner-side it only gates the Bill
   *  moment's save-card affordance vs its "Card on file" note (the tab is a state, not a choice);
   *  the staff floor still names it. */
  tabType: "none" | "trust" | "secure";
  /** A1 — when the table asked to pay at the counter (ISO), or null. */
  counterRequestedAt: string | null;
  /** A1 — the registered table number for the counter card ("Table 7"), null for an unregistered
   *  sticker or a to-go session. Read HERE, from the session row, so the card names the same table
   *  the floor does — never inferred client-side. */
  tableNumber: number | null;
  /** PD1 — a guest's "Let {host} know" stamp standing on the cart (`qr_carts.send_nudge_*`), or
   *  null: nobody waiting, or the advisory read failed. Cleared by `mms_fire_cart` with the fire. */
  sendNudge: SendNudge | null;
  /** PD1 — the stamp read itself SUCCEEDED (the blind pass on #335): false on a project without
   *  the PD1 migration (42703) or a failed read, and the Bill then never offers "Let {host} know" —
   *  a button whose every tap would fail. */
  nudgeReady: boolean;
  /** PD1 — the app server's clock (ISO) as this view was made. */
  serverNow: string;
  /** PD10 — the DATABASE clock (`mms_now()`, ISO), read BEFORE the lines: what a bump's undo window
   *  and a Send's grace are measured against on the guest's pass (falls back, logged, to this
   *  server's clock at the same point when the clock read fails). */
  dbNow: string;
  /** The session's mode (`table_sessions.mode`), from the fail-closed authorization read. */
  mode: string;
}> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  const { uid, sessionId, locked, lockedBy, settling, settleBy, mode } = await assertCartMember(id);
  const db = serviceClient();
  // ⚠️ T21(a) — BOTH ERRORS ARE BOUND, AND A FAILED READ THROWS. These two were the only unbound
  // reads in this file, and the cost was not a missing field: postgrest RESOLVES on failure (the
  // service client never calls `.throwOnError()`), so a dropped socket, a statement timeout, a pool
  // error and a 42703 all land as `{ data: null, error }` — and `rows ?? []` below turned that into
  // an EMPTY ITEM LIST, returned as authoritative. The totals come from a SECOND read
  // (`getCartTotals`) which does bind and throw, so the two can disagree: the kiosk review rendered
  // an empty list above a live "Total $53.40" with its failure screen suppressed, and the provider
  // applied the blank cart with the optimistic "Added to your order" still on screen.
  //
  // The throw is `UNAVAILABLE()`, not a bare Error, because the SHAPE is what routes it: `/cart`
  // tests `code === "unavailable"` to reach the outage screen and otherwise tells the diner their
  // order "isn't available on this device". A verdict we cannot support is the thing W10a deleted.
  //
  // 503 for BOTH arms is deliberate even though `.single()` also errors on zero rows: this function
  // cannot tell "gone" from "unreadable", and `assertCartMember` — which can, and answers 404
  // `no_cart` — proved this cart open one statement earlier. Unknowable is not a verdict.
  // PD10 — THE DB CLOCK, READ BEFORE THE LINES (D5, Codex round 4). The guest's pass counts a bump
  // as Served only once it is `KDS_UNDO_MS` old on the DB clock (`lib/kitchen-track.ts`), and that
  // comparison is honest only if the clock was read NO LATER than the lines: a clock read after them
  // can land past a bump's six seconds while the lines predate an Undo Mom sent inside them — the
  // pass would read Served (and the door, after the flip, would open) over a dish she took back. So
  // `mms_now()` rides beside the cart read, and both answer before the line read begins — no extra
  // round trip on the hot path. ADVISORY, like the lookups below: a failed clock read falls back to
  // this server's clock taken at the same point (still before the lines), logged — the authoritative
  // gate is `create-intent`'s own read, which fails CLOSED (`readServedGateInput`).
  const [{ data: cart, error: cartErr }, clockRes] = await Promise.all([
    db
      .from("qr_carts")
      .select("pickup_slot,fire_at,tab_type,counter_requested_at,table_sessions(table_number)")
      .eq("id", id)
      .single(),
    db.rpc("mms_now"),
  ]);
  if (cartErr) throw UNAVAILABLE();
  const dbNow =
    !clockRes.error &&
    typeof clockRes.data === "string" &&
    Number.isFinite(Date.parse(clockRes.data))
      ? clockRes.data
      : (() => {
          console.error(
            "[cart] getCartView: mms_now unreadable — the pass is timed on the app clock",
            {
              cartId: id,
              error: clockRes.error?.message,
            },
          );
          return new Date().toISOString();
        })();
  const { data: rows, error: rowsErr } = await db
    .from("qr_cart_items")
    .select(
      "id,menu_item_id,name,qty,modifiers,unit_price_cents,tax_cents,by_seat,state,fire_at,bumped_at,comped,fulfillment,notes,created_at",
    )
    .eq("cart_id", id)
    .order("created_at", { ascending: true });
  if (rowsErr) throw UNAVAILABLE();
  // Resolve which lines are now 86'd so the cart can disable their "+" (QA §D sold-out trap — a peer
  // can 86 an item that's already in a cart). menu_item_id is a soft text ref: a menu_items uuid for
  // restaurant lines, a barcode for grocery. Filter to UUID-shaped ids before the lookup — `id` is a
  // uuid column, so a barcode in the IN-list would error (invalid uuid); grocery lines stay not-sold-out.
  const uuidRe = /^[0-9a-f-]{36}$/i;
  const menuIds = [
    ...new Set((rows ?? []).map((r) => r.menu_item_id).filter((x) => uuidRe.test(x))),
  ];
  // #362 (Codex round 1) — WHY each dish can't be made, from the ONE predicate (`dishUnavailable`):
  // an 86 (`sold_out`), or delisted / gone from the catalog (`gone`). Null = it can be made, or the
  // catalog read failed (advisory: a blip marks NOTHING, never "gone" for every line).
  const unavailable = new Map<string, Unavailable>();
  // W13 — line media + Burmese names, keyed by the soft ref (menu uuid OR grocery barcode); the
  // keyspaces are disjoint by the uuidRe partition. Display-only; a failed lookup degrades to
  // placeholder/EN (same advisory posture as soldOut). `safeImageUrl` = containment only; W16d
  // removed the filename→placeholder filter that rode here (those rows are real photos — see
  // lib/media-url), so the cart and bill thumbs show the same dish photography the menu does.
  const media = new Map<string, { imageUrl: string | null; nameMy: string | null }>();
  const barcodes = [
    ...new Set((rows ?? []).map((r) => r.menu_item_id).filter((x) => !uuidRe.test(x))),
  ];
  // Lifecycle audit (out-of-stock 2) — the lines staff REMOVED, whose reason the audit holds.
  const voidedIds = (rows ?? []).filter((r) => r.state === "voided").map((r) => r.id);
  // getCartView runs in every mutation response — the two advisory reads go out TOGETHER
  // (review LOW: sequential awaits taxed the add/scan hot path with a second serial RTT).
  const [menuRes, groceryRes, nudgeRes, voidRes, droppedRes] = await Promise.all([
    menuIds.length
      ? // Deliberate swallow posture: sold-out is an advisory disable on the "+", not load-bearing;
        // a failed lookup degrades to "nothing sold-out" + no media rather than blocking the view.
        // image_url + name_my ride the SAME query — zero extra round trips on the menu side.
        db
          .from("menu_items")
          .select("id,is_sold_out,is_active,image_url,name_my,menu_categories(is_active)")
          .in("id", menuIds)
      : Promise.resolve({ data: null }),
    barcodes.length
      ? db.from("grocery_items").select("barcode,image_url,name_my").in("barcode", barcodes)
      : Promise.resolve({ data: null }),
    // PD1 — the "Let {host} know" stamp, ADVISORY like the two lookups beside it: a failed read
    // degrades to "no stamp known" (the host simply sees no waiting line), never the outage screen.
    // It is deliberately NOT a column on the cart read above, for two reasons. The stamp is UI-only
    // (no write, no amount, no gate reads it), so an unreadable stamp must not take a whole order
    // down. And the columns arrive with the OWNER's migration (20261008123000_pd1_send_nudge) on a
    // project the previews share with prod (docs/ENV.md, T3): until it is applied this read answers
    // 42703, and /cart must still render every order exactly as before.
    db.from("qr_carts").select("send_nudge_seat,send_nudge_at").eq("id", id).maybeSingle(),
    // Lifecycle audit (out-of-stock 2) — WHY staff removed a line, from the loss audit
    // (`mms_approvals`, written in the void's own transaction). ADVISORY like the reads beside it:
    // a failed read degrades to a bare "Removed", never the outage screen. Only when a line IS
    // voided (no cost on the ordinary view), and through the session index the ledger already has.
    voidedIds.length
      ? db
          .from("mms_approvals")
          .select("line_id,reason_code,created_at")
          .eq("session_id", sessionId)
          .eq("kind", "void")
          .in("line_id", voidedIds)
      : Promise.resolve({ data: null }),
    // #362 (blind pass 7) — the SETTLEMENT's own voids. `mms_settle_precheck_and_void` (W23c · M72)
    // voids a draft the capture found it cannot make and ledgers it here as `sold_out`, never in
    // `mms_approvals`; the cart stays OPEN after it whenever the capture is retried or the hold is
    // cancelled, so tablemates' phones apply that view and said "Our staff removed …" with no "we
    // ran out". Advisory and voided-only like the audit read beside it, through
    // `qr_dropped_lines_cart_idx (cart_id, dropped_at)`.
    voidedIds.length
      ? db
          .from("qr_dropped_lines")
          .select("line_id,reason_code,dropped_at")
          .eq("cart_id", id)
          .in("line_id", voidedIds)
      : Promise.resolve({ data: null }),
  ]);
  // A catalog read that FAILED (or was never needed) marks nothing; one that answered judges every
  // uuid line — a row it did not return is a dish gone from the catalog.
  const catalog = menuRes.data ? new Map(menuRes.data.map((f) => [f.id, f])) : null;
  if (catalog)
    for (const id of menuIds) {
      const why = dishUnavailable(catalog.get(id));
      if (why) unavailable.set(id, why);
    }
  for (const f of menuRes.data ?? [])
    media.set(f.id, { imageUrl: safeImageUrl(f.image_url), nameMy: f.name_my ?? null });
  for (const g of groceryRes.data ?? [])
    media.set(g.barcode, { imageUrl: safeImageUrl(g.image_url), nameMy: g.name_my ?? null });
  const removedReason = removedReasons([
    ...(voidRes.data ?? []),
    ...(droppedRes.data ?? []).map((d) => ({
      line_id: d.line_id,
      reason_code: d.reason_code,
      created_at: d.dropped_at,
    })),
  ]);
  const items: CartItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    menuItemId: r.menu_item_id,
    name: r.name,
    qty: r.qty,
    modifiers: Array.isArray(r.modifiers) ? (r.modifiers as string[]) : [],
    unitPriceCents: r.unit_price_cents,
    taxCents: r.tax_cents,
    bySeat: r.by_seat ?? undefined,
    // The GATE (either kind) and the WORDS (which kind) — one predicate, so they never disagree.
    // #362 blind pass 9 — UNKNOWN (undefined) for a dish line when the catalog read failed: `false`
    // there read as a fresh "available" on /menu and cleared a real sold-out mark
    // (`cartSoldOutReading`). Still falsy, so the advisory "+" gate is exactly as before.
    soldOut: catalog || !uuidRe.test(r.menu_item_id) ? unavailable.has(r.menu_item_id) : undefined,
    unavailable: unavailable.get(r.menu_item_id) ?? null,
    // Kitchen-life state (S2.2): drives the diner UI — a 'draft' line keeps its stepper, a fired/cooking/
    // served line shows its state + "Ask a server" (the server enforces the same rule via canMutateLine).
    lineState: (r.state ?? "draft") as LineState,
    fireAt: r.fire_at ?? null,
    // PD10 — the bump stamp, raw: the track reads it against `dbNow` (served only once it is
    // `KDS_UNDO_MS` old), so the pass never reads a bare `served` as Served.
    bumpedAt: r.bumped_at ?? null,
    // Comped (S2.3): the kitchen still makes it but the guest isn't charged — the cart shows a "Comped"
    // chip and the totals (getCartTotals) exclude it. Distinct from 'voided' (removed entirely).
    comped: r.comped ?? false,
    // S4 routing tag — drives the cart's destination grouping + the per-food-line for-here/to-go toggle.
    fulfillment: (r.fulfillment ?? "dinein") as CartItem["fulfillment"],
    // W3b: the diner's own kitchen note — visible so it's verifiable (and so a noted line reads
    // differently from an identical plain sibling; the two never merge).
    notes: r.notes ?? null,
    // W13 — line media + Burmese name (display-only; contained + fallback-filtered by
    // lib/media-url). ⚠️ nameMy is the LIVE catalog name_my while `name` is the add-time
    // snapshot — a catalog rename between add and pay can make the pair drift on the bill
    // (accepted with the same posture as soldOut/thumb freshness; registry S14 tracks a
    // name_my snapshot if it ever bites).
    imageUrl: media.get(r.menu_item_id)?.imageUrl ?? null,
    nameMy: media.get(r.menu_item_id)?.nameMy ?? null,
    // Lifecycle audit (out-of-stock 2) — a removed line says "we ran out" when that is what staff
    // picked; every other reason (and an unreadable audit) keeps the bare "Removed".
    removedReason: r.state === "voided" ? (removedReason.get(r.id) ?? null) : null,
  }));
  return {
    items,
    // ⚠️ W10c pre-PR review — retype the throw at this seam. `getCartTotals` raises a bare `Error` on
    // an unreadable cart (M30), but `/cart` discriminates the outage on `AuthzError.code ===
    // "unavailable"` — so a PARTIAL degradation (auth + membership reads fine, `qr_cart_items` or
    // `mms_promo_discount` times out) fell through to `didIPayForCart` → false → the exact copy W10a
    // exists to delete: "This order isn't available on this device. Start from the menu.", printed
    // over an intact order. Same 503 shape every other unknowable answer in the app uses.
    // M123 (b) — the QUOTE basis: the pin only while an intent is live, the live figure otherwise
    // (lib/totals.ts says why). The floor's settle quote makes this exact call, so the guest's pass
    // and Dad's pane stay one derivation (PD2).
    totals: await getCartTotals(id, 0, "quote").catch((e: unknown) => {
      // Pre-merge review — retyping loses WHICH read died, and `getCartTotals` is careful to say
      // (cart items / promo discount / reward discount). During a partial degradation — the case this
      // 503 exists for — that sentence is the only server-side signal there is. Keep it.
      console.error("[cart] getCartView totals unreadable", { cartId: id, error: e });
      throw new AuthzError(
        "We’re having trouble on our end — try again in a moment",
        503,
        "unavailable",
      );
    }),
    pickupSlot: cart?.pickup_slot ?? null,
    fireAt: cart?.fire_at ?? null,
    locked,
    lockedBy,
    mySeat: uid,
    settling,
    settleBy,
    tabType: (cart?.tab_type ?? "none") as "none" | "trust" | "secure",
    counterRequestedAt: cart?.counter_requested_at ?? null,
    tableNumber: cart?.table_sessions?.table_number ?? null,
    // PD1 — a stamp is BOTH halves or none: a seat with no time (or the reverse) is a row this
    // migration never writes, and reading it as a wait would put a line on the host's phone that
    // nothing clears. A failed read is null too (advisory; see the read).
    // …and a LIVE one only (the last blind pass on #335): a stamp whose dishes have all gone names
    // no wait, whatever was added since — `nudgeLive`, the one rule every reader of the view reads.
    sendNudge: nudgeLive(
      nudgeRes.error || !nudgeRes.data?.send_nudge_seat || !nudgeRes.data.send_nudge_at
        ? null
        : { seat: nudgeRes.data.send_nudge_seat, at: nudgeRes.data.send_nudge_at },
      (rows ?? []).map((r) => ({
        state: r.state,
        fulfillment: r.fulfillment,
        createdAt: r.created_at,
      })),
    ),
    // PD1 — whether that read answered at all: an unreadable stamp hides the nudge's offer.
    nudgeReady: !nudgeRes.error,
    // PD1 — the app server's clock as this view was made. NO READER since PD1's tail (#356): the
    // "Show a server" pass reads `dbNow` below, like the Bill's live pass. M282 drops the field.
    serverNow: new Date().toISOString(),
    // PD10 — the DB clock read before the lines (above): the one clock the guest's pass and its
    // served door compare `fire_at` / `bumped_at` against (lib/live-pass).
    dbNow,
    // Codex round 2 on #331 — the session's mode from the SAME fail-closed read that authorized this
    // view (`assertCartMember`, M108), so the Bill's parked phone-pay door never hangs off the
    // best-effort split context (`doorMode`, lib/checkout-stage).
    mode,
  };
}

/**
 * Release the pay-window lock the caller holds (the "Edit order" path). Authorized as a member, then
 * scoped to the caller's own seat AND to the attempt it names (lib/lock releasePayAttempt) — a
 * member can only release THEIR lock, and only for the tab that minted it. assertCartMember returns the lock (doesn't
 * throw on it), so this is callable on a locked-but-open cart. Idempotent + safe to call when unlocked.
 */
export async function releasePayLock(cartId: string, attempt?: string): Promise<PayLockRelease> {
  const { cartId: id, attempt: era } = releaseAttemptInput.parse({ cartId, attempt });
  const { uid } = await assertCartMember(id);
  // W1·Q6 flood guard — a rate-limited release just no-ops (the lock TTL is the backstop, so a
  // legit diner who somehow hits the cap recovers on the next tap or the TTL; never throw here).
  if (!(await withinMutationRate(uid))) return { released: false, reason: "rate_limited" };
  // M124 — ONE era-scoped statement. The old pair (`mms_release_promo_grant_for_holder` then
  // `releaseCartLock`) proved ownership with `locked_by = uid`, which cannot tell one diner's two
  // tabs apart: `acquireCartLock` lets the same uid re-acquire with a fresh era, so a stale tab
  // tapping "Edit order" cleared the LIVE tab's pin and unfroze its cart mid-checkout.
  //
  // The returned `released` is the honest answer to a superseded tab: false means this attempt no
  // longer owns the cart, so the caller says so rather than dropping the diner on a review step that
  // will refuse every edit (`cart.ts` throws "Order is locked while someone checks out").
  // ⚠️ THREE DIFFERENT FACTS, NOT ONE (adversarial pass on #244, and it was right).
  //
  // A bare `released: false` conflates a rate-limit short-circuit, a transport failure, and a
  // genuine zero-row match — and the caller then renders ONE sentence for all three. Two of them
  // are our outage, not the diner's tab being superseded, so telling them "this tab is no longer
  // the one checking out" is a fabricated diagnosis on a money surface: the exact class M116/M119
  // spent four PRs removing. Only a write that SUCCEEDED and matched nothing proves supersession.
  const ourEra = normalizeEra(era);
  // M151 — the intent this attempt minted is cancelled at Stripe BEFORE the one-statement release
  // drops lock, pin and link. A captured intent refuses with `paying` instead: the card is charged
  // or charging and the webhook is about to fulfil, so the cart must stay frozen under it.
  const res = await releasePayAttemptSafely(id, uid, ourEra);
  if (res.error)
    console.error("[cart] pay attempt not released", { cartId: id, error: res.error.message });
  if (!res.released && res.reason === "paying") return { released: false, reason: "paying" };
  if (!res.released && res.reason === "unknown") return { released: false, reason: "unknown" };
  // The zero-row read is LAZY — a second query only on the cold path where the release matched
  // nothing (an "Edit order" tap that did not own the lock), never on the ordinary success.
  return await classifyRelease(res, async () => {
    const { data } = await serviceClient()
      .from("qr_carts")
      .select("locked,locked_at")
      .eq("id", id)
      .maybeSingle();
    return classifyZeroRow(ourEra, data ?? null, Date.now(), CART_LOCK_TTL_MS);
  });
}

/**
 * W17c-3 — record the tip a KIOSK guest chose, so it survives the walk to the counter.
 *
 * The diner path never needs this: it sends a rate at create-intent time and the charge happens in
 * the same request. The kiosk hands off to the register, where a cashier takes the money minutes
 * later — so without somewhere to put it, a tip chosen at the kiosk is simply forgotten.
 *
 * What this writes is an INTENT, not a charge. The register pre-fills its tip field from it and the
 * cashier confirms or adjusts, because only the person who takes the money knows what was actually
 * handed over; W17c-2 put that authority in the cashier's entry and this does not move it. Passing
 * `null` clears back to "never asked", which the register renders differently from 0 = "asked, chose
 * to leave nothing" — collapsing those two would erase a real answer.
 *
 * Authorized like every other cart write: `assertCartMember` (the kiosk uid is a member of the
 * session it minted), refused while the cart is locked or settling — a tip must not move under a
 * cashier who is already counting against it.
 */
export async function setKioskTip(raw: unknown): Promise<{ ok: boolean }> {
  const parsed = setKioskTipInput.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const { cartId, tipCents } = parsed.data;
  let uid: string;
  try {
    const authz = await assertCartMember(cartId);
    if (authz.locked || authz.settling) return { ok: false };
    uid = authz.uid;
  } catch {
    return { ok: false };
  }
  await assertMutationRate(uid);
  const db = serviceClient();
  // Status-guarded IN THE STATEMENT, not just above it: a settle landing between the check and this
  // write must not repoint the tip a cashier is already reading.
  const { data, error } = await db
    .from("qr_carts")
    .update({ intended_tip_cents: tipCents })
    .eq("id", cartId)
    .eq("status", "open")
    .select("id");
  if (error) {
    console.error("[cart] setKioskTip failed", error.message);
    return { ok: false };
  }
  // `.update()` returns no row count, so the status predicate above can block the write and still
  // report success — the same trap `applyPromo` closes with `.select("id")`. If a settle landed in
  // the race window the guard did its job, and saying "ok" would claim an intent nobody recorded.
  if (!data || data.length === 0) return { ok: false };
  return { ok: true };
}
