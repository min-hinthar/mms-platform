/**
 * W23a — the availability question, asked at the charge boundary.
 *
 * `priceItem` refuses a sold-out dish when it is ADDED, which is the better guest moment. This exists
 * because that check cannot cover the window that actually produces refunds: a cart sits open while
 * the diner reads the menu, talks to the table and decides, and the 86 lands in the middle of it.
 * Every line was available when it went in; the basket is unsellable now. Only a re-read against the
 * live catalog can see that, and it has to happen before `paymentIntents.create` — after it, the only
 * remedy is a refund, which is the thing this slice exists to avoid.
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
 * The names of any cart lines whose menu item is no longer sellable — sold out OR delisted.
 *
 * Names, not ids: the only consumer is a sentence shown to a diner, and a refusal that cannot name
 * the dish is a dead end ("something in your order is unavailable" leaves them hunting). Deduplicated
 * and stably ordered so two lines of the same dish read as one problem.
 */
export function pickUnavailableNames(lines: CartLineish[], items: CatalogItemish[]): string[] {
  // A VOIDED line is already out of the charge and out of the kitchen — it cannot block a payment.
  // A COMPED line is $0 but still MADE, so a comped line that just sold out IS a problem: the
  // kitchen cannot produce it, and letting it through means promising a dish that does not exist.
  // That is why `comped` is deliberately not filtered here.
  const live = lines.filter(
    (l) => l.state !== "voided" && l.menu_item_id != null && FOOD_FULFILLMENTS.has(l.fulfillment),
  );
  const blocked = new Set(items.filter((i) => i.is_sold_out || !i.is_active).map((i) => i.id));
  if (blocked.size === 0) return [];

  // Name from the CATALOG, not the line's stamped `name`: the line carries a snapshot that may
  // predate a rename, and the diner is about to go looking for this dish on the menu in front of
  // them. Fall back to the line's name only if the catalog somehow has none.
  const catalogName = new Map(items.map((i) => [i.id, i.name_en]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of live) {
    const id = l.menu_item_id as string;
    if (!blocked.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(catalogName.get(id) ?? l.name);
  }
  return out;
}

/** The distinct menu ids a cart's live FOOD lines reference — what the catalog re-read asks about. */
export function foodMenuIds(lines: CartLineish[]): string[] {
  return [
    ...new Set(
      lines
        .filter(
          (l) =>
            l.state !== "voided" && l.menu_item_id != null && FOOD_FULFILLMENTS.has(l.fulfillment),
        )
        .map((l) => l.menu_item_id as string),
    ),
  ];
}
