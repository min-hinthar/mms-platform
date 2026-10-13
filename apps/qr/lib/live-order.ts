import type { TrackedOrder } from "./track-order";
import { isFired } from "./pickup-promise";

// K4 — the shared vocabulary + link builders for the diner's LIVE (in-flight) orders (the orders tray +
// /account "Today"). Pure + isomorphic (no "use server"/"use client" directive): the server read
// (getMyLiveOrders) derives these once, and the tray/section render them — ONE source for the status
// words and the /track deep-link, so the tray never invents a status /track wouldn't show.

export type LiveOrderKind = "dinein" | "pickup" | "togo" | "grocery";

export type LiveOrder = {
  id: string;
  kind: LiveOrderKind;
  /** /track-aligned status word (see liveOrderStatusWord) — server-derived, never a client guess. */
  statusWord: string;
  togoStatus: string | null; // null | 'preparing' | 'ready' ('picked_up' is terminal → filtered out)
  tableNumber: number | null;
  pickupSlot: string | null; // ISO — pickup mode's scheduled slot
  /** M65 — when the kitchen gets a held pickup (`slot − prep`), or null (fired at payment). J's
   *  re-poll counts a bag as moving only once it is fired (`liveOrdersMoving`). */
  fireAt: string | null;
  createdAt: string; // ISO
  hasTogoFood: boolean;
  hasGrocery: boolean;
  arrivedAt: string | null;
  /** The /track keys for the diner's OWN order — single-pay carries the PI; split-tender has none and
   *  resumes via cart+paid. Both are the diner's own keys (RLS-gated on /track), safe to hand back. */
  paymentIntent: string | null;
  cartId: string | null;
};

/**
 * The honest live-status word, matching /track's vocabulary (OrderTracker chips / the pill's statusWord).
 * Never invents progress the data can't back: a paid to-go/pickup order the kitchen hasn't touched
 * (togo_status null) is "Order received", not "Preparing". A pure grocery basket is self-scanned + already
 * in hand at payment — no kitchen wait — so it reads "Ready to go" (its /track shows an exit pass). A
 * DINE-IN order never carries togo_status (that's the to-go/pickup bagging signal), and it's paid at
 * settle, so "Order received" would read wrong for hours at the table — it says "At your table" instead
 * (unless a to-go box on the same order is being bagged, when the togo word wins).
 */
export function liveOrderStatusWord(
  o: Pick<LiveOrder, "togoStatus" | "kind" | "hasTogoFood"> & {
    /** M65 (PD3) — has the kitchen GOT the ticket (`isFired`, lib/pickup-promise.ts)? `togo_status =
     *  'preparing'` lands at PAYMENT, so a scheduled pickup held until `slot − prep` read "Preparing"
     *  for hours in the chip, the tray and /track. REQUIRED, not defaulted: a caller that forgot it
     *  would silently restore that defect, and the header pill morphs into /track's chip, so the two
     *  readers must agree about the very same row. */
    fired: boolean;
  },
): string {
  // Terminal for EVERY kind, so it is checked BEFORE the grocery short-circuit — a collected basket
  // has been collected. `getMyLiveOrders` filters these out so the tray never sees one, but /track
  // keeps showing an order after hand-off, and a total function is what lets both surfaces read this
  // one derivation instead of keeping a second ladder that drifts from it.
  if (o.togoStatus === "picked_up") return "Picked up";
  if (o.kind === "grocery") return "Ready to go";
  // ⚠️ `togo_status` is only a KITCHEN signal when the order actually carries to-go FOOD.
  // `mms_init_togo_status` stamps 'preparing' for `fulfillment in ('togo','grocery')`, so a basket of
  // self-scanned groceries sets the same column — and on a DINE-IN order carrying groceries but no
  // to-go box, reading the column raw told a seated diner their shopping was "Preparing", then
  // "Ready". Gating on `hasTogoFood` is the one predicate that separates a kitchen bag from an
  // exit-pass check, and it is the same rule /track's own `pureGrocery` branch applies. (Two
  // reviewers found this independently on #198 — one traced it unreachable today, the other did not;
  // rather than bet on reachability, the rule now lives in ONE place for every caller.)
  const kitchen = o.hasTogoFood ? o.togoStatus : null;
  switch (kitchen) {
    case "ready":
      return o.kind === "pickup" ? "Ready for pickup" : "Ready";
    case "preparing":
      // M65 — a HELD scheduled pickup is booked, not preparing: the wok has not got it. Ready is
      // never gated (only the bagger's tap moves it, and a bagged order is bagged).
      return o.fired ? "Preparing" : "Scheduled";
    default:
      // No kitchen bag in flight. Dine-in reads neutrally; to-go/pickup are freshly placed.
      return o.kind === "dinein" ? "At your table" : "Order received";
  }
}

/**
 * W22b — the SAME kind precedence as the server read (`getMyLiveOrders`, lib/orders.ts), expressed once
 * so a CLIENT-tracked order and a SERVER-listed one can never disagree about what mode they are. The
 * ladder was hand-copied in three places (the server read, OrderTracker's `isDineIn`/`isPickup`, and an
 * implicit one in the header pill's label) — this is the "name it ONCE" rule applied to identity, the
 * same move `lib/track-order.ts` made for the tracked-order shape.
 *
 * Precedence, deliberately: a dine-in line makes it a dine-in order (session-bound) EVEN alongside a
 * to-go box; else a pickup slot ⇒ pickup; else to-go food ⇒ to-go; else a pure self-scanned basket.
 * `tableNumber` is NOT part of it — the server read doesn't use it, and an all-to-go order placed at a
 * seated table is genuinely a to-go order (OrderTracker keeps its own separate `isDineIn` for the page
 * HEADING, which deliberately does count a registered table).
 */
export function kindFromTrackedOrder(
  t: Pick<TrackedOrder, "hasDineInFood" | "pickupSlot" | "hasTogoFood">,
): LiveOrderKind {
  if (t.hasDineInFood) return "dinein";
  if (t.pickupSlot) return "pickup";
  if (t.hasTogoFood) return "togo";
  return "grocery";
}

/** The mode's short label for a tray/Today row. */
export function liveOrderModeLabel(kind: LiveOrderKind): string {
  switch (kind) {
    case "dinein":
      return "Dine-in";
    case "pickup":
      return "Pickup";
    case "grocery":
      return "Grocery";
    default:
      return "To-go";
  }
}

/** The mode's decorative glyph (aria-hidden at the call site — the accessible name carries the mode word). */
export function liveOrderGlyph(kind: LiveOrderKind): string {
  switch (kind) {
    case "dinein":
      return "🍽️";
    case "pickup":
      return "🛍️";
    case "grocery":
      return "🛒";
    default:
      return "🥡";
  }
}

/**
 * Build the /track deep-link for the diner's OWN order — the SAME URL shape the header pill has always
 * used (single-pay carries the PI; split-tender has no PI and resumes via cart+paid). Centralised here so
 * the pill, the tray, and /account "Today" all link identically.
 *
 * ⚠️ **Every link this builds is a RESUME, never an arrival** — that is what this whole module is: the
 * live chip, the tray and /account "Today" all mean "check on the order you already placed". The URL
 * has to keep Stripe's `payment_intent` + `redirect_status=succeeded` shape because that is what
 * resolves the tracker, so `resume=1` is the only thing separating it from Stripe's own return. Without
 * it /track cannot tell them apart and replays the arrival celebration — confetti, the celebrate
 * haptic, "Payment confirmed" and (W22f) the pay chime — on a tap that moved no money, hours later.
 * Lifecycle audit (2026-10-13), I — and the cart branch carries it too. "`paid=1` is already a distinct
 * shape" was true of the URL and false of the page: /track treats `?cart=…&paid=1` as the counter's
 * or the split's own ARRIVAL (`justPaid`), so every resume of a counter-paid table replayed "Paid —
 * thank you!", the receipt's print-on, the goodbye beat — and in a fresh tab the confetti, the haptic
 * and the chime — and the store re-captured the order, sliding its TTL. `HomeResumeCard` builds its
 * link here now rather than by hand.
 */
export function liveOrderTrackHref(o: Pick<LiveOrder, "paymentIntent" | "cartId">): string {
  if (o.paymentIntent) {
    const cart = o.cartId ? `&cart=${encodeURIComponent(o.cartId)}` : "";
    return `/track?payment_intent=${encodeURIComponent(o.paymentIntent)}&redirect_status=succeeded&resume=1${cart}`;
  }
  return cartTrackHref(o.cartId ?? "", true);
}

/**
 * I — the cart branch's /track link (`?cart=…&paid=1`: the counter's and the split's landing), as an
 * arrival or as a RESUME. ONE builder, because the page links to itself too: its "Payment received"
 * interstitial offers a Refresh, and a Refresh that dropped `resume=1` turned one tap into an arrival
 * — the store re-captured the pointer, reset its TTL and cleared the open cart, and `justPaid`
 * replayed the confetti and the chime (the blind pass on #359).
 */
export function cartTrackHref(cartId: string, resume: boolean): string {
  const base = `/track?cart=${encodeURIComponent(cartId)}&paid=1`;
  return resume ? `${base}&resume=1` : base;
}

// ── the device's own order pointer (ActiveOrderProvider) — its rules, decided here ──────────────

/** How long the device remembers a placed order for the pill and the home card, from its capture —
 *  and, for a pickup, from its SLOT (`activeOrderExpiresAt`). */
export const ACTIVE_ORDER_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Lifecycle audit (2026-10-13), E — when the device forgets its order. Four hours from the capture
 * was right for a meal and wrong for a pickup booked hours (or a day) ahead: the guest who paid at
 * noon for 6:20 PM and closed the tab came back at 5:50 to no pill, no home card and no way to "I’m
 * here". A pickup is remembered until its slot plus the same four hours — never less than the capture
 * rule. An unreadable slot is no slot.
 */
export function activeOrderExpiresAt(o: { createdAt: number; pickupSlot?: string | null }): number {
  const base = o.createdAt + ACTIVE_ORDER_TTL_MS;
  const slot = o.pickupSlot ? Date.parse(o.pickupSlot) : Number.NaN;
  return Number.isFinite(slot) ? Math.max(base, slot + ACTIVE_ORDER_TTL_MS) : base;
}

/**
 * I — is this /track URL the order the device already holds? Single-pay is keyed by its
 * PaymentIntent; the cart branch (split / counter) by its cart, with no PI. A resume of the SAME
 * order keeps the stored pointer as it is (its capture time, its slot) instead of re-capturing it.
 */
export function sameActiveOrder(
  stored: { paymentIntent: string | null; cartId: string | null } | null,
  url: { paymentIntent: string | null; cartId: string | null },
): boolean {
  if (!stored) return false;
  if (stored.paymentIntent) return url.paymentIntent === stored.paymentIntent;
  return url.paymentIntent === null && stored.cartId !== null && url.cartId === stored.cartId;
}

/**
 * F — what a STALE live read means for the device's order (the row was there, and a later read that
 * SUCCEEDED found none: the session closed or lapsed, `useOrderStatus`). A dine-in order has no
 * pick-up signal — its session closing IS the end of the meal, the same rule `getMyLiveOrders`'
 * session gate applies — so it is finished, and the pill and the home card stop saying "At your
 * table" about a meal eaten hours ago. Any other kind may still have a bag waiting: what changed is
 * only that this device can no longer SEE it, so the status is unknown (the honest floor, "Placed").
 */
export function staleOrderFate(kind: LiveOrderKind | null): "finished" | "unknown" {
  return kind === "dinein" ? "finished" : "unknown";
}

/**
 * F (the blind pass on #359) — the KIND the device's order pointer implies when no row has been read
 * in this mount (the pill's fresh subscription after a cleared table finds none): the door it was
 * placed through. Only `dinein` is a kind on its own — the to-go door navigates with `mode=pickup`
 * (W22b), so "pickup" names no kind, and a stale order of no known kind stays "unknown".
 */
export function pointerKind(mode: string | null): LiveOrderKind | null {
  return mode === "dinein" ? "dinein" : null;
}

/**
 * E — may a listed order stand WITHOUT a live session? `getMyLiveOrders` drops an order whose session
 * has closed or lapsed, because /track could not read it; PD3 made that premise false for the uid's own
 * orders (`getMyOrderFallback`, earned_by / payer). A PICKUP whose slot is on the restaurant's today or
 * later is still the guest's to collect, and its session lapses 2–4 h after payment — long before a
 * slot booked that evening or the next day. Every other kind keeps the session gate (a dine-in's
 * session closing is its end; a to-go bag fires at payment and is collected inside the session).
 */
export function liveWithoutSession(
  o: { kind: LiveOrderKind; pickupSlot: string | null },
  todayStartIso: string,
): boolean {
  if (o.kind !== "pickup" || !o.pickupSlot) return false;
  const slot = Date.parse(o.pickupSlot);
  return Number.isFinite(slot) && slot >= Date.parse(todayStartIso);
}

/**
 * E — a past order's way back to /track from /account's history: a PICKUP not yet collected whose slot
 * is on the restaurant's today or later (the window `liveWithoutSession` stands on), and not wholly
 * refunded — its claim ticket and "I’m here" still have a job to do. Every other row is a receipt, and
 * gets no tracker link (a pickup nobody marked collected last week is not "in progress").
 */
export function uncollectedPickupHref(
  o: {
    pickupSlot: string | null;
    togoStatus: string | null;
    refundedInFull: boolean;
    paymentIntent: string | null;
    cartId: string | null;
  },
  todayStartIso: string,
): string | null {
  if (o.togoStatus === "picked_up" || o.refundedInFull) return null;
  if (!liveWithoutSession({ kind: "pickup", pickupSlot: o.pickupSlot }, todayStartIso)) return null;
  if (!o.paymentIntent && !o.cartId) return null;
  return liveOrderTrackHref(o);
}

/**
 * J — is any listed order still MOVING on its own, at `nowMs`? A to-go bag the kitchen HAS (fired:
 * `fire_at` null or reached — the `isFired` rule) that is not yet Ready: the expo's tap is coming.
 * /account "Today" has no Realtime and the header pill is off there, so it re-polls while one is.
 *
 * A HELD pickup is not moving (the blind pass on #359): `togo_status` reads 'preparing' from PAYMENT,
 * and since E a next-day pickup stays in the live set, so counting it re-polled a page for a day or
 * more over a word that cannot change until its `fire_at`. A dine-in "At your table" and a grocery
 * "Ready to go" do not move; a Ready bag waits on the guest, not the kitchen.
 */
export function liveOrdersMoving(
  orders: ReadonlyArray<Pick<LiveOrder, "hasTogoFood" | "togoStatus" | "fireAt">>,
  nowMs: number,
): boolean {
  return orders.some((o) => o.hasTogoFood && o.togoStatus !== "ready" && isFired(o.fireAt, nowMs));
}
