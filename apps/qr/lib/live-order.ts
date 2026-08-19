import type { TrackedOrder } from "./track-order";

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
export function liveOrderStatusWord(o: Pick<LiveOrder, "togoStatus" | "kind">): string {
  // Terminal for EVERY kind, so it is checked BEFORE the grocery short-circuit — a collected basket
  // has been collected. `getMyLiveOrders` filters these out so the tray never sees one, but /track
  // keeps showing an order after hand-off, and a total function is what lets both surfaces read this
  // one derivation instead of keeping a second ladder that drifts from it.
  if (o.togoStatus === "picked_up") return "Picked up";
  if (o.kind === "grocery") return "Ready to go";
  switch (o.togoStatus) {
    case "ready":
      return o.kind === "pickup" ? "Ready for pickup" : "Ready";
    case "preparing":
      return "Preparing";
    default:
      // null / anything else = no bagging status. Dine-in reads neutrally; to-go/pickup are freshly placed.
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
 */
export function liveOrderTrackHref(o: Pick<LiveOrder, "paymentIntent" | "cartId">): string {
  if (o.paymentIntent) {
    const cart = o.cartId ? `&cart=${encodeURIComponent(o.cartId)}` : "";
    return `/track?payment_intent=${encodeURIComponent(o.paymentIntent)}&redirect_status=succeeded${cart}`;
  }
  return `/track?cart=${encodeURIComponent(o.cartId ?? "")}&paid=1`;
}
