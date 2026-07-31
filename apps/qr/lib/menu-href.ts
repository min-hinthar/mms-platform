/**
 * W9a — the ONE place a "back to the menu" destination is decided.
 *
 * Why this exists: a bare `/menu` is not neutral. `useTableSession` resolves the mode from the URL,
 * so `/menu` with no `?mode=` falls through to the **scan-&-go** default — which means every
 * "Back to menu" link in the app silently converted a dine-in or pickup diner into a grocery
 * shopper, minting a fresh solo session and orphaning their table (F9). Post-W5f that got sharper:
 * every food door now enters at `pickup`, so a returning diner landed in a mode no door offers.
 *
 * The rule: carry the mode the diner is actually in, or send them to the **door picker** — never
 * guess. An unknown mode routing to `/` costs one tap; guessing costs them their table.
 *
 * `scango` maps to `/grocery`, not `/menu?mode=scango`: the market is its own surface, and the
 * restaurant menu is the wrong shelf for someone holding a basket (G13).
 */
export type OrderMode = "dinein" | "pickup" | "scango";

/** Is this a mode we can route confidently? Anything else (null, a stale/garbled value) is unknown. */
function known(mode?: string | null): mode is OrderMode {
  return mode === "dinein" || mode === "pickup" || mode === "scango";
}

/**
 * The destination for a "back to ordering" link. Pass the mode from server truth where you have it
 * (the tracked order's own lines, the cart's split context) in preference to any device-persisted
 * "last door" — a two-door diner's device remembers the wrong one.
 */
export function menuHref(mode?: string | null): string {
  if (!known(mode)) return "/"; // the door picker — honest about not knowing
  if (mode === "scango") return "/grocery";
  return `/menu?mode=${mode}`;
}

/**
 * Link text that matches where the link actually goes. A link to `/` must not say "Back to menu", and
 * a link to `/grocery` must not say "Browse the menu" — that is the same class of small dishonesty
 * the destination bug came from. ALWAYS pair this with `menuHref` on the same mode so the label
 * cannot drift from the destination.
 *
 * `tone` picks the phrasing for the link's direction — `"back"` for a return affordance (post-pay,
 * account, a dead end), `"browse"` for a forward CTA (an empty cart inviting the first item). An
 * unknown mode reads the same either way: it names the door picker, which is both where you came
 * from and where you are going.
 */
export function menuLinkText(mode?: string | null, tone: "back" | "browse" = "back"): string {
  if (!known(mode)) return "Choose how you’re ordering";
  if (mode === "scango") return tone === "browse" ? "Browse the market" : "Back to the market";
  return tone === "browse" ? "Browse the menu" : "Back to menu";
}

/**
 * Derive the ordering mode from an ORDER's own line fulfillments — the only mode signal that
 * survives the table session being closed (a server clearing the table for the next party) or the
 * 4h anon TTL. `qr_orders` carries no mode column; `qr_order_items.fulfillment` is the immutable
 * snapshot that routing and tax already key on, so it is the same truth the kitchen used.
 *
 * Precedence is deliberate: a pickup slot is an explicit commitment, so it wins. Otherwise a dine-in
 * line means the diner is (or was) at a table — that is where "back to the menu" belongs, even on a
 * S4 unified basket that also carries a to-go bag or groceries.
 */
export function modeFromOrder(o: {
  pickupSlot: string | null;
  hasDineInFood: boolean;
  hasGrocery: boolean;
  hasTogoFood: boolean;
  tableNumber?: number | null;
}): OrderMode | null {
  if (o.pickupSlot) return "pickup";
  // A registered table number is a POSITIVE dine-in signal (it is only ever stamped from a seated
  // session), so an all-to-go order placed AT a table still routes back to that table's menu — the
  // party is still sitting there. It is not usable as the sole test (null for an unregistered
  // sticker), which is why it supplements the line snapshot rather than replacing it.
  if (o.hasDineInFood || o.tableNumber != null) return "dinein";
  if (o.hasGrocery && !o.hasTogoFood) return "scango";
  if (o.hasTogoFood) return "pickup";
  return null;
}
