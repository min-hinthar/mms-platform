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
  /** Read only by the SEND's gate (`sendBlockingDishes`): a comp no diner can remove. */
  comped?: boolean;
};

export type CatalogItemish = {
  id: string;
  name_en: string;
  is_sold_out: boolean;
  is_active: boolean;
};

/** Why a dish cannot be made now: 86'd today (`sold_out`), or delisted / gone from the catalog. */
export type Unavailable = "sold_out" | "gone";

/**
 * The ONE availability predicate, and it returns the KIND — read by the add-time refusal in
 * `priceItem`, the charge-time re-read below, the Send's gate, the single-dish pre-read and the cart
 * view's per-line mark. Two spellings of "can we still make this?" would drift the day a third
 * availability flag lands, and the answers would disagree at exactly the moment a diner is holding a
 * phone.
 *
 * #362 (Codex round 1) — the KIND travels because the two are different facts with different words:
 * an 86 is today's ("Sold out"), a delisting is not coming back ("No longer on the menu"). Folding
 * them into one "sold out" told a diner a dish they will never see again was a temporary shortage.
 * A missing row is `gone` too (`menu_item_id` is a SOFT ref: a deleted dish leaves a dangling line,
 * and a dish with no catalog row cannot be made). A delisted dish that was also 86'd is `gone`: the
 * delisting is the fact that outlives the 86.
 */
export function dishUnavailable(
  i: { is_sold_out: boolean; is_active: boolean } | null | undefined,
): Unavailable | null {
  if (!i || !i.is_active) return "gone";
  return i.is_sold_out ? "sold_out" : null;
}

/** Can the kitchen make it now — `dishUnavailable`'s projection, never a second spelling. */
export function itemSellable(i: { is_sold_out: boolean; is_active: boolean }): boolean {
  return dishUnavailable(i) === null;
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
    (l) =>
      l.state === "draft" &&
      l.menu_item_id != null &&
      !l.menu_item_id.startsWith(CUSTOM_ITEM_REF) &&
      FOOD_FULFILLMENTS.has(l.fulfillment),
  );
}

/**
 * OA4 — a manager's CUSTOM item (`custom-item.ts`, `CUSTOM_ITEM_PREFIX`; restated here because this
 * module imports nothing — `availability.test.ts` pins the two equal) has no catalog row by design,
 * so nothing can 86 it. Left in, its `custom:<key>` ref reached the uuid-typed `menu_items.id` read,
 * which FAILED rather than answering, and every charge path that refuses an unreadable availability
 * read (cash settle, the terminal, the authorised-pickup capture) could not take the payment (Codex
 * round 1 on #373, P1); a read that did answer would call it `gone`.
 */
const CUSTOM_ITEM_REF = "custom:";

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

/** One dish that can no longer be made: the catalog id the cart line points at, what to call it, and
 *  why (`dishUnavailable`'s kind — the sentence differs). */
export type UnavailableLine = { id: string; name: string; why: Unavailable };

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
  const catalog = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const out: UnavailableLine[] = [];
  for (const l of live) {
    const id = l.menu_item_id as string;
    if (seen.has(id)) continue;
    const row = catalog.get(id);
    const why = dishUnavailable(row);
    if (why === null) continue;
    seen.add(id);
    out.push({ id, name: row?.name_en ?? l.name, why });
  }
  return out;
}

/** The distinct menu ids a cart's blockable lines reference — what the catalog re-read asks about. */
export function foodMenuIds(lines: CartLineish[]): string[] {
  return [...new Set(blockableLines(lines).map((l) => l.menu_item_id as string))];
}

/**
 * Lifecycle audit (out-of-stock 1 · kitchen-board-sync 6) — the dishes a dine-in SEND would put on
 * the kitchen's board that the kitchen has already said it cannot make.
 *
 * `mms_fire_cart` fires every `dinein` draft and reads no availability, so a dish 86'd while it sat
 * in a guest's cart went to the board anyway: a ticket for food the kitchen had just said no to, the
 * guest's phone saying "Sent to kitchen" for a dish nobody would cook, and the verbal relay the 86
 * hint asks for ("tell the counter"). The Send now refuses, naming these, until the guest removes
 * them. ONLY `dinein` drafts: those are exactly what the Send fires — a to-go draft waits for the
 * payment (and its own charge-boundary gate), so it must not hold the table's Send.
 *
 * The same sellability rule as every other gate (`pickUnavailable` → `dishUnavailable`). Read-then-
 * fire leaves a race window (an 86 landing between this read and the RPC); closing it needs the RPC
 * to skip sold-out drafts in SQL, which is a migration — filed (M298), not guessed at here.
 *
 * ⚠️ `dinein` IS EXACTLY THE FIRE'S OWN FILTER, not a guess at it (#362 blind pass 2c): the live
 * `mms_fire_cart` (20261008123000_pd1_send_nudge.sql) updates `ci.state = 'draft' and ci.fulfillment
 * = 'dinein'` — a to-go line at the table never rides the Send; it fires at the pay (behind
 * create-intent's own availability gate) or through "Send to kitchen now" (behind `makeItNow`'s).
 *
 * ⚠️ A COMPED draft never blocks (#362 blind pass 2b). No diner can remove a comp (`canMutateLine`),
 * so a sold-out comp held the whole table's Send with no way through — where, before this gate, the
 * Send fired it. Staff comped it, so staff own it: it fires as it always did, and the kitchen's board
 * shows the 86. (The CHARGE boundary keeps blocking it — `blockableLines`'s rule — because there the
 * remedy is staff's void, and the comp is still a dish the kitchen would be asked to make.)
 */
export function sendBlockingDishes(
  lines: CartLineish[],
  items: CatalogItemish[],
): UnavailableLine[] {
  return pickUnavailable(
    lines.filter((l) => l.fulfillment === "dinein" && !l.comped),
    items,
  );
}
