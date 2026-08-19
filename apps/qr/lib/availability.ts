/**
 * W23a — the availability question, asked at the charge boundary.
 *
 * A cart sits open while the diner reads the menu, talks to the table and decides, and the 86 lands in
 * the middle of it. Every line was available when it went in; the basket is unsellable now. Only a
 * re-read against the live catalog can see that, and it has to happen before `paymentIntents.create` —
 * after it, the only remedy is a refund, which is the thing this slice exists to avoid.
 *
 * SCOPE — the single-pay charge boundary (`create-intent`) and the add boundary (`priceItem`). The
 * SPLIT-tender path (`create-share-intent`) is deliberately NOT gated, and that is a decision rather
 * than an omission: a split is dine-in only, its shares are frozen from the breakdown at split-open,
 * and dine-in food fires from the OPEN cart — so by the time anyone settles a share, every line the
 * shares actually charge for has been fired and made. A draft line added after the split opened is in
 * nobody's share, so refusing that payment would block money for food nobody is being charged for.
 *
 * PURE MODULE — no `server-only`, no client directive, no imports at all. The DECISION lives here and
 * the two reads live in `availability-read.ts`, the same split `lib/track-order.ts` uses. It is not
 * tidiness: `@mms/db/server` pulls in `server-only`, which throws the moment a node test imports it,
 * so a rule co-located with its reads cannot be pinned by a test in this repo (every suite is a pure
 * node `.test.ts`) and cannot carry a `verify:slice` mutant. `check-money-coverage` treats all of
 * `apps/qr/lib/` as a money path for exactly this reason.
 */

/** Only FOOD lines can be unavailable. Grocery is self-scanned — the shopper is already holding it. */
const FOOD_FULFILLMENTS = new Set(["dinein", "togo"]);

export type CartLineish = {
  menu_item_id: string | null;
  name: string;
  state: string;
  fulfillment: string;
};

export type CatalogItemish = {
  id: string;
  name_en: string;
  is_sold_out: boolean;
  is_active: boolean;
};

/**
 * The ONE sellability predicate — read by the add-time refusal in `priceItem` and by the charge-time
 * re-read below. Two spellings of "can we still make this?" would drift the day a third availability
 * flag lands, and the two answers would disagree at exactly the moment a diner is holding a phone.
 */
export function itemSellable(i: { is_sold_out: boolean; is_active: boolean }): boolean {
  return !i.is_sold_out && i.is_active;
}

/**
 * The lines an 86 can actually block: FOOD, still `draft`.
 *
 * `draft` is the whole rule, and it is a REMEDY constraint before it is a kitchen one. `permissions.ts`
 * lets a diner mutate a draft line and nothing else — so blocking on a `fired`/`in_progress`/`served`
 * line would tell a dine-in table "remove it to keep going" about a line they have no control to
 * remove, and the only way out of the screen would be to flag down a server. It is also the wrong
 * question: a fired line is already being made (a served one is on the table and possibly eaten), so
 * the 86 does not threaten it. What the 86 governs is what the kitchen makes NEXT, and next is exactly
 * the draft batch. Pickup and scan-and-go lose nothing to this — those lines stay `draft` until the
 * payment fires them (`mms_fire_pending_food`), so the gate sees every one of them.
 *
 * A `comped` line is not a state — it is a separate boolean column and is not read here. A comped line
 * that is still `draft` therefore blocks like any other, which is right: comped or not, the kitchen
 * still makes it, and it cannot make a dish it does not have. Staff void it to clear the block.
 */
function blockableLines(lines: CartLineish[]): CartLineish[] {
  return lines.filter(
    (l) => l.state === "draft" && l.menu_item_id != null && FOOD_FULFILLMENTS.has(l.fulfillment),
  );
}

/**
 * The names of any cart lines whose menu item is no longer sellable — sold out, delisted, or gone from
 * the catalog entirely (`menu_item_id` is a SOFT ref, so a deleted row leaves a dangling line; a dish
 * with no catalog row cannot be made either).
 *
 * Names, not ids: the only consumer is a sentence shown to a diner, and a refusal that cannot name
 * the dish is a dead end ("something in your order is unavailable" leaves them hunting). Deduplicated
 * and stably ordered so two lines of the same dish read as one problem.
 */
export function pickUnavailableNames(lines: CartLineish[], items: CatalogItemish[]): string[] {
  return pickUnavailable(lines, items).map((u) => u.name);
}

/** One dish that can no longer be made: the catalog id the cart line points at, and what to call it. */
export type UnavailableLine = { id: string; name: string };

/**
 * W23c — the same verdict as `pickUnavailableNames`, keeping the ID alongside the name.
 *
 * The charge-boundary gate only ever needed names, because all it does is refuse and say which dish.
 * The manual-capture path needs to ACT on the lines — void them, then capture the reduced total — so
 * it needs the ids too. One traversal, one rule: `pickUnavailableNames` is now a projection of this,
 * because two functions deciding "is this sellable?" would eventually disagree, and the surface they
 * would disagree on is a charge.
 */
export function pickUnavailable(lines: CartLineish[], items: CatalogItemish[]): UnavailableLine[] {
  const live = blockableLines(lines);
  if (live.length === 0) return [];

  // Name from the CATALOG, not the line's stamped `name`: the line carries a snapshot that may
  // predate a rename, and the diner is about to go looking for this dish on the menu in front of
  // them. Fall back to the line's name when the catalog has no row at all.
  const sellable = new Set(items.filter(itemSellable).map((i) => i.id));
  const catalogName = new Map(items.map((i) => [i.id, i.name_en]));
  const seen = new Set<string>();
  const out: UnavailableLine[] = [];
  for (const l of live) {
    const id = l.menu_item_id as string;
    if (sellable.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: catalogName.get(id) ?? l.name });
  }
  return out;
}

/** The distinct menu ids a cart's blockable lines reference — what the catalog re-read asks about. */
export function foodMenuIds(lines: CartLineish[]): string[] {
  return [...new Set(blockableLines(lines).map((l) => l.menu_item_id as string))];
}
