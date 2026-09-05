import { catalogNameMy } from "./ticket-names";

/**
 * P6 — the wall TV's KITCHEN PULSE, derived in ONE place.
 *
 * `/board` has always been the LOBBY screen: takeout + grocery call-outs, first name + short code,
 * **dine-in deliberately absent** so a table's order is never broadcast (SPEC-KDS §6, and the
 * allowlist in `app/api/board/route.ts`). P6 keeps that column exactly as it is and adds a second
 * band for the OTHER audience in the same room — the kitchen and the floor — under the tightest
 * boundary that still makes the band worth hanging:
 *
 *   PUBLISHED   ticket count · the oldest live ticket's fire time · an UNATTRIBUTED dish rail
 *               ("Mohinga ×4") · dine-in rows as TABLE NUMBER + one of two coarse statuses.
 *   WITHHELD    every guest name, every session/cart/order id, every per-table dish list, every
 *               modifier, note, amount, seat, channel and staff attribution. None of them appears
 *               in this module's output type, so none of them can leak by a later edit at a call
 *               site — the shape is the boundary.
 *
 * WHY A TABLE NUMBER MAY CROSS AND A DISH LIST MAY NOT. The number is printed on the tent card in
 * front of the guest and spoken across the room all night; it identifies a piece of furniture, not
 * a person, and pairing it with `cooking`/`ready` says only what a runner walking past would see.
 * A dish list attributed to that number is a different fact: it is what those particular people
 * chose, which nothing in the room publishes today.
 *
 * ⚠️ THE RAIL AND THE TABLE STRIP TOGETHER ARE WHAT NEEDED A GUARD, not either alone. With ONE live
 * ticket the rail IS that ticket's order, and the strip names its table — the wall would state
 * "Table 2 is having Mohinga ×2", which is precisely the fact the paragraph above says may not
 * cross. With TWO, a guest who knows their own order subtracts it and reads the other ticket's
 * order exactly. So the rail is withheld below `PULSE_RAIL_MIN_TICKETS`. What that closes, stated
 * without overclaim: EXACT re-identification of a single party's order by a single observer. What
 * it does NOT close: a coalition of guests differencing their own orders out of a larger union.
 * It is a floor under the worst case, not anonymity, and it must not be described as anonymity.
 * The count itself is published either way — it names load, never a person.
 *
 * PURE, and not in the route, for the reason `lib/board-poll.ts` already argues one file over: a
 * rule written inside a route handler does not get guarded. Every predicate here is falsifiable by
 * a VALUE, and each carries a `verify:slice` mutant.
 */

/** How a table's kitchen state reads on the wall. Two values, both derived, neither invented. */
export type PulseTableStatus = "cooking" | "ready";

/** One all-day rail row: a dish and how many are on the wok, across the WHOLE kitchen. */
export type PulseDish = { name: string; nameMy: string | null; qty: number };

/** One dine-in row: the tent-card number and a coarse status. Nothing else may join this type. */
export type PulseTable = { table: number; status: PulseTableStatus };

export type BoardPulse = {
  /** Distinct tickets with food actually on the wok. HELD (future fire time) tickets are not. */
  tickets: number;
  /** The oldest live ticket's fire time, ISO. The screen ages it against `serverNow`. */
  oldestFiredAt: string | null;
  /** Largest first, capped. EMPTY below `PULSE_RAIL_MIN_TICKETS` — see the docblock. */
  allDay: PulseDish[];
  /** How many rail rows the cap dropped. Published so the screen can say so instead of truncating
   *  silently: a rail that shows five of nine dishes and says nothing is a wrong all-day count. */
  allDayMore: number;
  /** Ascending by table number. */
  tables: PulseTable[];
};

/**
 * The session modes whose tables may appear in the strip, written as the set it IS.
 *
 * Same doctrine as `BOARD_MODES` in the route and for the same reason, pointed the other way: there
 * the board is takeout-only and dine-in must stay off; here the strip is dine-in-only and everything
 * else must stay off. Both are ALLOWLISTS, so a fourth value added to `table_sessions.mode`'s CHECK
 * later appears in NEITHER place until somebody decides it should. `!== "pickup"`-shaped thinking is
 * what put names on this wall twice before.
 */
export const PULSE_TABLE_MODES: ReadonlySet<string> = new Set(["dinein"]);

/**
 * A dine-in ticket belongs to a table only while its session is live; a cleared table drops off.
 *
 * ⚠️ `active` AND NOTHING ELSE — deliberately the KDS's liveness test, not the floor board's. The
 * floor also filters `table_sessions.expires_at`, so a session past its 4-hour mint TTL that nobody
 * closed ("a ghost") still reads live HERE, exactly as it does at the pass. That divergence is the
 * intended one: `expires_at` bounds a JWT, not a meal, and a party still eating at hour five has a
 * live table. The cost is that a genuinely abandoned table with an unbumped line keeps a `cooking`
 * row on the wall — which is TRUE (the kitchen does have an open ticket for it) and is the same
 * thing the KDS says, and a wall that disagreed with the pass would be the worse failure. Recorded
 * as a known limitation shared with the KDS rather than fixed on one screen only.
 */
export const PULSE_LIVE_SESSION_STATUS = "active";

/**
 * The line states that mean "food is on the wok right now" (`qr_cart_items.state`).
 *
 * The same two the KDS queue reads, so the wall and the pass count the same tickets. `voided` and
 * `draft` are absent because neither is cooking; `comped` is NOT a state and is not consulted at
 * all — a comped dish is still cooked, still plated and still owed by the kitchen, so it counts.
 */
export const PULSE_COOKING_STATES: ReadonlySet<string> = new Set(["fired", "in_progress"]);

/**
 * How long a table keeps reading `ready` after its last line was bumped.
 *
 * This is a BOUND ON STALENESS, not a claim about the food. Nothing records whether a runner
 * actually carried the plate out — `qr_cart_items` has `bumped_at` (stamped by `mms_bump_ticket`
 * and by `mms_line_transition` on the `served` edge, cleared again by `mms_recall_ticket`) and
 * nothing after it. So the honest reading of `ready` is "the pass finished this table's food within
 * the last five minutes", and after that the wall stops saying anything rather than keep asserting
 * a state it can no longer see. Without the bound a table would read `ready` from the bump until it
 * paid — half an hour of a screen stating something nobody checked.
 */
export const PULSE_READY_LINGER_MS = 5 * 60 * 1000;

/** The rail's exposure floor. See the module docblock — this is the whole privacy argument. */
export const PULSE_RAIL_MIN_TICKETS = 3;

/** Rail rows the wall can carry at TV scale. The remainder is COUNTED, never silently dropped. */
export const PULSE_RAIL_MAX_ROWS = 8;

/** A live kitchen line, exactly the columns the route reads. */
export type PulseLineRow = {
  cart_id: string;
  menu_item_id: string;
  name: string;
  qty: number;
  state: string;
  fire_at: string | null;
  bumped_at: string | null;
};

/** The parent cart. `status` is already filtered to open/paid by the read; carried for clarity. */
export type PulseCartRow = { id: string; session_id: string };

/**
 * The session behind a cart: what decides whether it is a TABLE, and which one.
 *
 * `mode` and `status` are non-null because `table_sessions` declares them `not null` with a CHECK
 * (`20260618000000_qr_platform_init.sql`); `table_number` is the nullable one — it was added later
 * (`20260713000000_k2_table_registry.sql`) as an optional FK, so a dine-in session started at an
 * UNREGISTERED sticker genuinely has no number, and that case is handled rather than assumed away.
 */
export type PulseSessionRow = {
  id: string;
  mode: string;
  status: string;
  table_number: number | null;
};

export type ShapePulseInput = {
  lines: readonly PulseLineRow[];
  cartById: ReadonlyMap<string, PulseCartRow>;
  sessionById: ReadonlyMap<string, PulseSessionRow>;
  /** `menu_items.name_my` by id — ADVISORY. An absent entry renders the English snapshot name. */
  nameMyByItem: ReadonlyMap<string, string | null | undefined>;
  /** The DATABASE clock in ms. The route reads `mms_now` for this; see the route's comment. */
  nowMs: number;
};

/**
 * Shape the pulse from raw rows.
 *
 * Every line must resolve to a known cart AND a known session to be counted at all. A row we could
 * not place is dropped rather than counted anonymously — the same "publish what is known to belong,
 * never what was merely not seen" the orders allowlist already holds to, applied to an aggregate so
 * the two halves of this payload cannot disagree about what a missing row means.
 */
export function shapeBoardPulse(input: ShapePulseInput): BoardPulse {
  const { lines, cartById, sessionById, nameMyByItem, nowMs } = input;
  const readyFloorMs = nowMs - PULSE_READY_LINGER_MS;

  const cookingCarts = new Set<string>();
  /** session id → does it have food on the wok / food just bumped. */
  const cookingSessions = new Set<string>();
  const readySessions = new Set<string>();
  const dishes = new Map<string, PulseDish>();
  let oldestFiredMs = Number.POSITIVE_INFINITY;
  let oldestFiredAt: string | null = null;

  for (const l of lines) {
    const cart = cartById.get(l.cart_id);
    if (!cart) continue; // cancelled/cleared cart, or one the status filter excluded
    const sess = sessionById.get(cart.session_id);
    if (!sess) continue; // unplaceable — never counted, never published
    if (l.fire_at === null) continue;
    const fireMs = new Date(l.fire_at).getTime();
    if (!Number.isFinite(fireMs)) continue;
    // A line whose fire time has not arrived is HELD (a scheduled pickup) or inside the dine-in
    // send's 10-second undo grace — the kitchen has not seen it, so the wall must not either. This
    // is the one comparison in this module that is sensitive to clock skew, which is why `nowMs`
    // is the DATABASE clock and not the app's (`lib/kitchen.ts` documents the same reasoning).
    if (fireMs > nowMs) continue;

    if (PULSE_COOKING_STATES.has(l.state)) {
      cookingCarts.add(l.cart_id);
      cookingSessions.add(cart.session_id);
      if (fireMs < oldestFiredMs) {
        oldestFiredMs = fireMs;
        oldestFiredAt = l.fire_at;
      }
      // The rail counts what is COOKING. A bumped line has left the wok, so counting it would
      // overstate the kitchen's obligation — the one number this rail exists to state.
      const cur = dishes.get(l.name);
      if (cur) {
        cur.qty += l.qty;
        // "The most Burmese we know for this key" (the `allDayRows` rule, restated): the first
        // non-null wins and a later value never overwrites it, so one key never flips tongues
        // mid-poll.
        if (cur.nameMy === null)
          cur.nameMy = catalogNameMy(nameMyByItem.get(l.menu_item_id), l.name);
      } else {
        dishes.set(l.name, {
          name: l.name,
          nameMy: catalogNameMy(nameMyByItem.get(l.menu_item_id), l.name),
          qty: l.qty,
        });
      }
      continue;
    }

    // `served`, and recently enough that saying so is still a statement about now. `bumped_at` is
    // nulled by `mms_recall_ticket`, so a recalled ticket cannot linger here — it goes back to
    // `in_progress` and reads `cooking` again, which is what the pass is actually doing.
    if (l.state === "served" && l.bumped_at !== null) {
      const bumpedMs = new Date(l.bumped_at).getTime();
      if (Number.isFinite(bumpedMs) && bumpedMs >= readyFloorMs) readySessions.add(cart.session_id);
    }
  }

  const byTable = new Map<number, PulseTableStatus>();
  for (const sess of sessionById.values()) {
    // ALLOWLIST — the strip is dine-in and nothing else, and an unregistered sticker (a dine-in
    // session with no `table_number`) has no number to show, so it stays off the wall while still
    // counting toward the load figures above.
    if (!PULSE_TABLE_MODES.has(sess.mode)) continue;
    if (sess.status !== PULSE_LIVE_SESSION_STATUS) continue;
    if (sess.table_number === null) continue;
    const cooking = cookingSessions.has(sess.id);
    const ready = readySessions.has(sess.id);
    if (!cooking && !ready) continue;
    // Two sessions can share a number across a re-seat, and one table can hold a paid cart beside a
    // fresh open one. COOKING WINS in either case: there is still food on the wok for that number,
    // and a wall that said `ready` would send a runner to collect a plate that is not up yet.
    const next: PulseTableStatus = cooking ? "cooking" : "ready";
    if (byTable.get(sess.table_number) === "cooking") continue;
    byTable.set(sess.table_number, next);
  }

  const ranked = [...dishes.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  const railOpen = cookingCarts.size >= PULSE_RAIL_MIN_TICKETS;
  const allDay = railOpen ? ranked.slice(0, PULSE_RAIL_MAX_ROWS) : [];

  return {
    tickets: cookingCarts.size,
    oldestFiredAt,
    allDay,
    allDayMore: railOpen ? ranked.length - allDay.length : 0,
    tables: [...byTable.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([table, status]) => ({ table, status })),
  };
}
