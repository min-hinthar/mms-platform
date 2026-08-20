/**
 * W22e — "your usual", and the rules that keep it from being flattery.
 *
 * The arrival beat can offer a returning diner the thing they actually order. That is a RECOGNITION
 * claim, and this repo has one standing bar for those (`mostLoved.ts`, the rank seals): the claim must
 * be backed by counted, paid history, tie-aware, and it must never invent an affinity. This module is
 * the same bar applied to ONE diner instead of the room — which is harder, because a single person's
 * history is small enough that one coincidence looks like a pattern.
 *
 * PURE by design. The server read lives in `your-usual-read.ts` behind `server-only`, because
 * `apps/qr/vitest.config.ts` is `environment: "node"` and a `server-only` import breaks the runner —
 * so a rule left on the read side could not be guarded at all (the W17 "decision logic belongs in
 * lib/" rule, one layer in).
 *
 * ── The five rules ───────────────────────────────────────────────────────────────────────────────
 *
 * 1. **An occurrence is a DISTINCT ORDER, never a quantity.** Three teas on one visit is one order of
 *    tea, not a habit. Counting qty would let a single large party crown a dish for the person who
 *    happened to pay — exactly the failure `mostLoved`'s MIN_DISTINCT_ORDERS exists to prevent.
 *
 * 2. **A PAIR must have actually co-occurred.** The proposal's copy is "Mohinga + Tea — add both",
 *    and a `+` asserts they were ordered TOGETHER. If Mohinga appears in orders A and B while Tea
 *    appears in C and D, they are two separate habits and joining them with a `+` states something
 *    that never happened. So a pair is only offered when the two items share ≥2 of the same orders.
 *
 * 3. **Ties break on RECENCY, not on arbitrary order.** When several dishes sit at the same count,
 *    picking the first one the database returned would invent a preference out of row order. The most
 *    recently ordered is a fact the history actually holds, so that is the tiebreak — and the copy
 *    never claims a ranking either way ("Your usual?", not "Your #1").
 *
 * 4. **Unavailable dishes are removed BEFORE ranking, not after.** Offering something 86'd today is
 *    the W23a anti-pattern this app already paid for — a diner builds an order around a dish they
 *    cannot have and meets the refusal at the last tap. Filtering first also means a sold-out
 *    favourite does not suppress the runner-up: the diner gets their second-most-usual instead of
 *    nothing at all.
 *
 * 5. **Say nothing rather than something thin.** Below the threshold the outcome is `none` and the
 *    arrival beat renders exactly what a first-timer sees. A card that appears for someone with one
 *    visit is not recognition, it is a guess wearing recognition's clothes.
 */

/** One line of the caller's own paid history, already narrowed to menu dishes by the read. */
export type UsualRow = {
  /** `qr_order_items.menu_item_id` — uuid-shaped only; grocery barcode lines never reach here. */
  menuItemId: string;
  /** The order this line belonged to. DISTINCT counting is done on this, never on qty. */
  orderId: string;
  /** `qr_orders.created_at`, ISO. Used only to break ties on recency (rule 3). */
  orderedAt: string;
};

/** What today's catalog says about a dish — the availability gate (rule 4) and the display name. */
export type UsualCandidate = { id: string; name: string; soldOut: boolean };

export type UsualOutcome =
  | { state: "none" }
  | { state: "single"; items: [UsualCandidate] }
  /** Both items qualified independently AND shared ≥2 orders — see rule 2. */
  | { state: "pair"; items: [UsualCandidate, UsualCandidate] };

/** A dish must appear in at least this many DISTINCT paid orders before it is anyone's "usual". */
export const MIN_DISTINCT_ORDERS = 2;

/**
 * How far back history counts.
 *
 * Deliberately LONGER than `mostLoved`'s 60 days, and the divergence is the point: that aggregate
 * sees every diner in the room, so 60 days is plenty of volume, while one person's history at the
 * same window might hold two visits total. 90 days is roughly a season — long enough that a
 * fortnightly regular clears the threshold, short enough that "usual" still describes who they are
 * now rather than who they were last year.
 */
export const USUAL_WINDOW_DAYS = 90;

/**
 * Decide what — if anything — to offer this diner.
 *
 * `rows` is their own paid history (the read scopes it to their uid); `catalog` is today's menu.
 * Anything not in `catalog` is a dish that has left the menu, and is dropped with the sold-out ones.
 */
export function yourUsual(rows: UsualRow[], catalog: UsualCandidate[]): UsualOutcome {
  // Rule 4 — availability first. A dish that is 86'd or gone from the menu is removed before any
  // counting, so it can neither be offered nor crowd out the dish that can be.
  const sellable = new Map(catalog.filter((c) => !c.soldOut).map((c) => [c.id, c]));

  // Rule 1 — count DISTINCT orders per dish, and remember which orders those were (rule 2 needs the
  // sets) plus the newest timestamp (rule 3 needs the recency).
  const byItem = new Map<string, { orders: Set<string>; newest: string }>();
  for (const row of rows) {
    if (!sellable.has(row.menuItemId)) continue;
    const seen = byItem.get(row.menuItemId);
    if (seen) {
      seen.orders.add(row.orderId);
      if (row.orderedAt > seen.newest) seen.newest = row.orderedAt;
    } else {
      byItem.set(row.menuItemId, { orders: new Set([row.orderId]), newest: row.orderedAt });
    }
  }

  const qualified = [...byItem.entries()]
    .filter(([, v]) => v.orders.size >= MIN_DISTINCT_ORDERS)
    // Rule 3 — count, then RECENCY, then NAME. The third rung is not decoration: without it the
    // comparator returned a non-zero value for genuinely equal entries, which is an invalid
    // comparator (a correct one must answer 0), and the order then fell through to Map insertion
    // order — i.e. whatever sequence the database happened to return the rows in. That is precisely
    // the invented preference this rule exists to forbid, so the last rung is alphabetical: still
    // arbitrary, but DETERMINISTIC and visibly not a claim about what the diner likes more.
    .sort(
      (a, b) =>
        b[1].orders.size - a[1].orders.size ||
        b[1].newest.localeCompare(a[1].newest) ||
        (sellable.get(a[0])?.name ?? "").localeCompare(sellable.get(b[0])?.name ?? ""),
    );

  const top = qualified[0];
  if (!top) return { state: "none" }; // rule 5

  const topItem = sellable.get(top[0]);
  if (!topItem) return { state: "none" }; // unreachable — `sellable` gated the loop; belt for a future edit

  // Rule 2 — a pair is only a pair if it happened. Look for the best partner that shares ≥2 of the
  // top dish's own orders; the candidates are already sorted, so the first match is the strongest.
  for (const [id, v] of qualified) {
    if (id === top[0]) continue;
    let together = 0;
    for (const orderId of v.orders) if (top[1].orders.has(orderId)) together += 1;
    if (together >= MIN_DISTINCT_ORDERS) {
      const partner = sellable.get(id);
      if (partner) return { state: "pair", items: [topItem, partner] };
    }
  }

  return { state: "single", items: [topItem] };
}

/**
 * The card's copy.
 *
 * "Your usual?" keeps the question mark on purpose. Two orders is enough to ASK and nowhere near
 * enough to TELL — the diner is the authority on what their usual is, and the phrasing leaves them
 * holding that. It also makes a wrong guess harmless: a question that misses is a shrug, while a
 * statement that misses is the app claiming to know someone it does not.
 *
 * No count is shown. "You've ordered this 7 times" is equally true and reads like surveillance;
 * recognition should feel like being known by a host, not audited by a system.
 */
export const USUAL_HEADING = "Your usual?";

/** The dish line — a real `+` only when rule 2 proved they were ordered together. */
export function usualDishes(outcome: UsualOutcome): string {
  if (outcome.state === "none") return "";
  return outcome.items.map((i) => i.name).join(" + ");
}

/** The action label, agreeing with how many dishes are actually being added. */
export function usualAction(outcome: UsualOutcome): string {
  return outcome.state === "pair" ? "Add both" : "Add it";
}
