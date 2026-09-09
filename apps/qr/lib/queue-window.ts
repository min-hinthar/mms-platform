/**
 * M180 · M181 — the service window both live boards read, and what an empty result is allowed to mean.
 *
 * ## The failure this closes
 *
 * The KDS reads `state in (fired,in_progress)` oldest-first with `limit(500)`; expo reads
 * `togo_status in (preparing,ready)` oldest-first with `limit(200)`. Both caps are applied by SQL,
 * BEFORE the filters that would discard dead rows (the KDS's cart-status join is two reads later;
 * expo has no prune at all). And both queues leak:
 *
 *   • `clearTable` flips the cart to `cancelled` and never touches `qr_cart_items`, so every line that
 *     had fired on that table stays `fired` forever and no job prunes it.
 *   • `picked_up` is written only by the manual expo bump, so every bag handed over without that tap
 *     stays `ready` forever.
 *
 * So the oldest-first read eventually returns nothing BUT dead rows, the live-row filter empties, and
 * the board renders "all clear" over a working kitchen — the exact lie the KDS's own W10b comment says
 * it refuses.
 *
 * ## Two rules, named once, because both boards need both
 *
 * `queueFloorIso` bounds the dead population to one day's worth rather than all time, which at teahouse
 * volume cannot approach either cap. It is the same 24h bound `/api/board`'s `pulseDayFloor` already
 * applies to the same table.
 *
 * `queueEmptiness` is the belt: past the cap, "we saw no live rows" is not a fact about the kitchen, it
 * is a fact about the read. Kept separate from the floor because they fail in opposite directions — the
 * floor could be right while the cap still truncates, and a board that trusted either alone would still
 * be able to lie.
 */

/** One service day. Not configurable on purpose: it is a bound on GARBAGE, not a business rule, and a
 *  knob here would invite tuning it down until real tickets fell out. */
export const QUEUE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The oldest timestamp a live-queue read may return, given the server's own clock.
 *
 * ⚠️ Callers apply it with `gte`, which leaves FUTURE timestamps untouched — that matters for the KDS,
 * whose HELD tickets are lines with a `fire_at` deliberately in the future. A window expressed as a
 * range would have dropped every scheduled pickup off the board.
 */
export function queueFloorIso(nowIso: string): string {
  const now = Date.parse(nowIso);
  // An unparseable clock must not silently become 1970 — that floor admits everything, which is the
  // unbounded read this exists to end. Fall back to the local clock: skewed by seconds at worst,
  // where the alternative is skewed by decades.
  const basis = Number.isFinite(now) ? now : Date.now();
  return new Date(basis - QUEUE_WINDOW_MS).toISOString();
}

/** What a read that produced NO live rows is entitled to claim. */
export type QueueEmptiness =
  /** The read saw the whole window and there is genuinely nothing live. Render the empty board. */
  | "empty"
  /** The read hit its cap, so whether a live row exists is a question it did not answer. */
  | "cannot-say";

/**
 * @param rowsRead how many rows the capped SQL read returned.
 * @param cap      that read's `limit`.
 *
 * ⚠️ `>=`, not `===`. A cap is a ceiling, and a read that somehow returns more than it asked for is
 * even less entitled to claim completeness than one that exactly reaches it. `===` would answer
 * `empty` for the worse case of the two.
 *
 * ⚠️ AND THE OVER-BLOCKING DIRECTION IS ASSERTED, NOT ASSUMED. An unsaturated read really did see the
 * whole window, so a genuinely cleared kitchen must still answer `empty` — a rule that returned
 * `cannot-say` whenever there were no live rows would freeze every board at every quiet moment of
 * every day, which is worse than the lie it replaces.
 */
export function queueEmptiness(rowsRead: number, cap: number): QueueEmptiness {
  return rowsRead >= cap ? "cannot-say" : "empty";
}
