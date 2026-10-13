import type { CartItem } from "@mms/db";
import { nameList } from "./catalog-freshness";

/**
 * Lifecycle audit (out-of-stock 0 · 5) — is a dish on /menu sold out, from the FRESHEST thing this
 * phone knows? Pure, so the rule carries `verify:slice` mutants; `MenuBrowser` only feeds it.
 *
 * /menu holds three readings of the same fact, each read at a different moment:
 *
 *   • the CATALOG the page rendered (`is_sold_out`), stamped `catalogStamp`. It moves only when the
 *     route re-renders (a pull, a wake, the Refresh button);
 *   • the CART view, whose every line carries its dish's live `soldOut` (`getCartView` reads
 *     `menu_items` on every view — 86'd or no longer on the menu), stamped `dbNow`, read before
 *     the lines;
 *   • a REFUSAL this phone just met (`addItemOutcome`'s `sold_out` / `gone`), stamped as it refused.
 *
 * ⚠️ ONE CLOCK (#362 blind pass 9). All three are the DATABASE clock (`mms_now()`): the cart view's
 * own read, and `dbClockIso` for the render and the refusal. Their first version stamped the render
 * and the refusal with the APP server's `Date.now()` — another machine's clock, a different instance
 * per request on serverless — so two readings close together were ordered by skew, not by time.
 *
 * The shipped rule ORed the catalog with the cart (`liveSoldOut = soldOut || myLines.some(...)`),
 * which is fresh in ONE direction only: a dish put back on the menu stayed dead on /menu — the
 * stale render's `true` outvoted a fresher cart read saying `false` — while /cart's "+" was live.
 * And the refusal was not a reading at all: "We couldn't confirm Mohinga" over a card that stayed
 * live, so every retry met the same hedge. The freshest reading now wins, in BOTH directions.
 *
 * A tie (the same instant) reads sold out: an Add that is refused costs a tap and is named; an
 * Add offered for a dish the kitchen cannot make is the trap the gate exists for.
 */
export type SoldOutReading = { soldOut: boolean; atMs: number };

export function freshestSoldOut(
  readings: ReadonlyArray<SoldOutReading | null | undefined>,
): boolean {
  let best: SoldOutReading | null = null;
  for (const r of readings) {
    if (!r || !Number.isFinite(r.atMs)) continue;
    if (best === null || r.atMs > best.atMs || (r.atMs === best.atMs && r.soldOut)) best = r;
  }
  return best?.soldOut ?? false;
}

/**
 * The cart's reading for one dish: any FOOD line of it (the viewer's or a tablemate's — every line
 * carries the dish's live flag), stamped with the view's DB clock. Null when the cart holds none of
 * the dish, or the view has no clock.
 *
 * `canClear` — may this reading say AVAILABLE? The catalog's `is_sold_out` also folds in "a
 * required choice has nothing left to choose" (`requiredChoiceUnavailable`, the menu page), which
 * the cart's flag (`menu_items.is_sold_out` alone) cannot see. So for a dish with a required group
 * the cart may only ever ADD a sold-out fact, never clear the catalog's.
 */
export function cartSoldOutReading(
  items: ReadonlyArray<Pick<CartItem, "menuItemId" | "soldOut" | "fulfillment">>,
  menuItemId: string,
  dbNow: string | null,
  canClear: boolean,
): SoldOutReading | null {
  if (!dbNow) return null;
  const atMs = Date.parse(dbNow);
  if (!Number.isFinite(atMs)) return null;
  const lines = items.filter((i) => i.menuItemId === menuItemId && i.fulfillment !== "grocery");
  if (lines.length === 0) return null;
  const soldOut = lines.some((i) => i.soldOut === true);
  if (!soldOut && !canClear) return null;
  return { soldOut, atMs };
}

/**
 * Lifecycle audit (out-of-stock 1 · kitchen-board-sync 6) — the sentence a Send refused for dishes
 * the kitchen can no longer make says, naming the dishes (the refusal is a dead end without them)
 * and WHY (#362 Codex round 1): "sold out now" for an 86, "no longer on the menu" for a delisting,
 * and — when the batch holds both — the fact they share, "can’t be made now", rather than one kind's
 * word stretched over the other. Read aloud, so the list caps at two names (`nameList`).
 */
export function unavailableSendNotice(
  dishes: ReadonlyArray<{ name: string; why: "sold_out" | "gone" }>,
): string {
  if (dishes.length === 0) return "Something in your order just sold out — check your order below.";
  const one = dishes.length === 1;
  const kinds = new Set(dishes.map((d) => d.why));
  const state =
    kinds.size > 1
      ? "can’t be made now"
      : kinds.has("gone")
        ? `${one ? "is" : "are"} no longer on the menu`
        : `${one ? "is" : "are"} sold out now`;
  return `${nameList(dishes.map((d) => d.name))} ${state} — remove ${one ? "it" : "them"} to send the rest.`;
}
