/**
 * W22e — "your usual", and the rules that keep it from being flattery.
 *
 * The arrival beat can offer a returning diner the thing they actually order. That is a RECOGNITION
 * claim, and this repo has one standing bar for those (`mostLoved.ts`, the rank seals): counted, paid
 * history, tie-aware, never an invented affinity. This module is the same bar applied to ONE diner
 * instead of the room — harder, because a single person's history is small enough that one
 * coincidence looks like a pattern, and a wrong guess lands on someone who knows the truth.
 *
 * PURE by design. The server read lives in `your-usual-read.ts` behind `server-only`, because
 * `apps/qr/vitest.config.ts` is `environment: "node"` and a `server-only` import breaks the runner —
 * so a rule left on the read side could not be guarded at all (the W17 "decision logic belongs in
 * lib/" rule, one layer in).
 *
 * ── The six rules ────────────────────────────────────────────────────────────────────────────────
 *
 * 1. **An occurrence is a distinct DAY — never a quantity, and never an order.** Three teas on one
 *    visit is not a habit, but neither is two orders in one sitting, and this app produces those
 *    routinely: the session mints a fresh cart after each payment, so a second dine-in round or a
 *    forgotten drink is a second order id an hour later. `ArrivalBeat` already encodes the correct
 *    doctrine ("two orders in one sitting are two orders"), so counting orders would have made
 *    exactly the claim its neighbour is careful to avoid. Days are counted in LA time, because a late
 *    evening in Covina is already tomorrow in UTC and one dinner must never split into two.
 *
 * 2. **A PAIR must have actually co-occurred.** The copy joins dishes with a `+`, which asserts they
 *    were ordered TOGETHER. If Mohinga rode one day and Tea rode another, they are two separate
 *    habits and the `+` states a meal that never happened.
 *
 * 3. **Ties break on RECENCY, then on NAME — never on whatever order the rows arrived in.** Recency
 *    is a fact the history holds; row order is an accident of the query.
 *
 * 4. **A dish that cannot be added is not offered.** Two ways that happens, both filtered BEFORE
 *    ranking so an unofferable favourite cannot crowd out the runner-up:
 *      · sold out, or gone from the menu — offering it is the W23a anti-pattern the app already paid
 *        for (assemble an order around a dish that is gone, meet the refusal at the last tap);
 *      · **requires a choice.** `priceItem` runs with `enforceCardinality`, which THROWS for any item
 *        holding a `min_select >= 1` group, and this card adds with no modifiers. The menu row already
 *        knows — it renders a "Choose" pill instead of Add. Seven seeded dishes qualify, including
 *        Burmese Milk Tea via its required `drink_temp` group, which means the proposal's own
 *        canonical example ("Mohinga + Tea") was precisely the broken case.
 *
 * 5. **Say nothing rather than something thin.** Below the threshold the outcome is `none` and the
 *    arrival beat renders exactly what a first-timer sees.
 *
 * 6. **Only history where the payer is certainly the eater counts** — enforced in the read.
 *    `earned_by` is who PAID, and `qr_order_items` carries no seat, so a dine-in host who picks up
 *    the tab for a four-top owns every guest's dish in this data. Two such visits and the card would
 *    name a dish they have never once ordered — and hand a stranger's diet, religion or allergy back
 *    to them as their own taste. The read counts to-go and pickup lines only. That is a real cost (a
 *    solo dine-in regular is the archetype, and is excluded), and it is the same call `/staff/tips`
 *    already makes about `settled_by`: some things genuinely cannot be attributed, and guessing is
 *    worse than saying so.
 */

/** One line of the caller's own paid history, already narrowed by the read. */
export type UsualRow = {
  /** `qr_order_items.menu_item_id` — uuid-shaped only; grocery barcode lines never reach here. */
  menuItemId: string;
  /** The order this line belonged to. Kept for provenance; counting is by DAY, never by order. */
  orderId: string;
  /** `qr_orders.created_at`, ISO. Counted as an LA-local DAY (rule 1), compared for recency (rule 3). */
  orderedAt: string;
};

/** What today's catalog says about a dish. `soldOut` and `needsChoice` are both rule-4 gates. */
export type UsualCandidate = {
  id: string;
  name: string;
  soldOut: boolean;
  /** Holds a `min_select >= 1` modifier group, so a bare add throws server-side. */
  needsChoice: boolean;
};

export type UsualOutcome =
  | { state: "none" }
  | { state: "single"; items: [UsualCandidate] }
  /** Both qualified independently AND shared >= MIN_DISTINCT_DAYS days — see rule 2. */
  | { state: "pair"; items: [UsualCandidate, UsualCandidate] };

/** A dish must appear on at least this many DISTINCT DAYS before it is anyone's "usual". */
export const MIN_DISTINCT_DAYS = 2;

/**
 * How far back history counts. Deliberately LONGER than `mostLoved`'s 60 days: that aggregate sees
 * every diner in the room, while one person's history at the same window might hold two visits total.
 * 90 days is roughly a season — long enough for a fortnightly regular to clear the threshold, short
 * enough that "usual" still describes who they are now rather than who they were last year.
 */
export const USUAL_WINDOW_DAYS = 90;

/** The restaurant's own day boundary. An 11pm order in Covina is still tonight, not tomorrow. */
const LA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** ISO instant → `YYYY-MM-DD` in LA time. "" for an unparseable stamp, which the caller drops. */
export function laDayKey(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : LA_DAY.format(new Date(t));
}

/**
 * Decide what — if anything — to offer this diner.
 *
 * `rows` is their own paid, attributable history (the read scopes it); `catalog` is today's menu.
 * Anything absent from `catalog` has left the menu and is dropped with the unofferable ones.
 */
export function yourUsual(rows: UsualRow[], catalog: UsualCandidate[]): UsualOutcome {
  // Rule 4 — offerability first, so an unofferable dish can neither be shown nor crowd out one that
  // can be. `needsChoice` matters as much as `soldOut`: a bare add of a required-choice item throws.
  const offerable = new Map(
    catalog.filter((c) => !c.soldOut && !c.needsChoice).map((c) => [c.id, c]),
  );

  // Rule 1 — count distinct LA DAYS. The same set carries the co-occurrence rule 2 needs; `newest`
  // carries the recency rule 3 needs.
  const byItem = new Map<string, { days: Set<string>; newest: string }>();
  for (const row of rows) {
    if (!offerable.has(row.menuItemId)) continue;
    const day = laDayKey(row.orderedAt);
    if (!day) continue; // an unparseable stamp is not a day we can honestly count
    const seen = byItem.get(row.menuItemId);
    if (seen) {
      seen.days.add(day);
      if (row.orderedAt > seen.newest) seen.newest = row.orderedAt;
    } else {
      byItem.set(row.menuItemId, { days: new Set([day]), newest: row.orderedAt });
    }
  }

  const qualified = [...byItem.entries()]
    .filter(([, v]) => v.days.size >= MIN_DISTINCT_DAYS)
    // Rule 3. The name rung is load-bearing, not decoration: a comparator MUST answer 0 for equal
    // entries, and the first draft returned -1 instead. That does not merely look untidy — it makes
    // the output implementation-defined (measured on this V8: returning -1 for equals REVERSES the
    // input; returning 0 preserves it). Either way the resulting order is a sort artifact rather
    // than a fact about the diner, which is what this rule forbids — so equal entries now land
    // alphabetically: still arbitrary, but deterministic and visibly not a preference.
    .sort(
      (a, b) =>
        b[1].days.size - a[1].days.size ||
        b[1].newest.localeCompare(a[1].newest) ||
        (offerable.get(a[0])?.name ?? "").localeCompare(offerable.get(b[0])?.name ?? ""),
    );

  const top = qualified[0];
  if (!top) return { state: "none" }; // rule 5

  const topItem = offerable.get(top[0]);
  if (!topItem) return { state: "none" }; // unreachable — the loop gated on `offerable`; belt for a future edit

  // Rule 2 — a pair is only a pair if it happened. The partner must share >= MIN_DISTINCT_DAYS days
  // with the top dish; candidates are already sorted, so the first match is the strongest.
  for (const [id, v] of qualified) {
    if (id === top[0]) continue;
    let together = 0;
    for (const day of v.days) if (top[1].days.has(day)) together += 1;
    if (together >= MIN_DISTINCT_DAYS) {
      const partner = offerable.get(id);
      if (partner) return { state: "pair", items: [topItem, partner] };
    }
  }

  return { state: "single", items: [topItem] };
}

/**
 * The card's copy.
 *
 * "Your usual?" keeps the question mark on purpose. Two days is enough to ASK and nowhere near enough
 * to TELL — the diner is the authority on what their usual is, and the phrasing leaves them holding
 * that. It also makes a wrong guess harmless: a question that misses is a shrug, while a statement
 * that misses is the app claiming to know someone it does not.
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
