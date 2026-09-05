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
 * "Table 2 is having Mohinga x2", which is precisely the fact the paragraph above says may not
 * cross. With TWO, a guest who knows their own order subtracts it and reads the other exactly. So
 * the rail is withheld below `PULSE_RAIL_MIN_TICKETS`.
 *
 * ⚠️ WHAT THAT FLOOR CLOSES, STATED NARROWLY BECAUSE AN EARLIER DRAFT OF THIS PARAGRAPH OVERCLAIMED
 * IT. It closes exact attribution **from a single frame** — one look at the wall — by an observer
 * who cannot already resolve any of the tickets counted in it. It is a bound on the worst single
 * reading. It is NOT anonymity, and it must never be described as anonymity, because these channels
 * remain open and are accepted rather than hidden:
 *
 *   · **Frame deltas.** The screen repolls every 5s and `tickets` is published unconditionally, so
 *     an observer who watches CONTINUOUSLY and differences two frames in which `tickets` moved by
 *     exactly one reads that one ticket's whole order — at any ticket count. Closing it means
 *     decoupling the rail's cadence from the strip's or quantising the counts, which costs the
 *     kitchen the live number the band exists to show; the trade is the owner's, and it is filed as
 *     an OPEN-ITEMS row rather than papered over here. What the floor still buys is that a GLANCE
 *     is never enough.
 *   · **A shrinking residual.** The anonymity set is `tickets` minus the tickets the observer can
 *     already resolve — their own, their friends', and (because the Ready column names takeaway
 *     customers on the same screen) any named order they happen to know. The floor counts tickets,
 *     not unknowns, so three tickets of which two are known is a set of one.
 *   · **`allDayMore`** is an aggregate over rows nobody was shown: the number of distinct dishes
 *     past the display cap. Kept anyway, because a rail that truncates in SILENCE states a wrong
 *     all-day count, which is the one number the rail exists for.
 *   · **Absence, and the linger.** A table number that never appears has not ordered; one that
 *     appears and vanishes was cleared. A table that reads `up` and then drops bounds that party's
 *     plate-up instant to a five-minute public window. Both are inherent in showing tables at all,
 *     which is what the band was asked for.
 *
 * PURE, and not in the route, for the reason `lib/board-poll.ts` already argues one file over: a
 * rule written inside a route handler does not get guarded. Every predicate here is falsifiable by
 * a VALUE, and each carries a `verify:slice` mutant.
 */

/**
 * How a table's kitchen state reads on the wall. Two values, both derived, neither invented.
 *
 * ⚠️ `up`, NOT `ready` — the word is the finding, not a style choice. Nothing in this schema records
 * that a plate reached a table: `bumped_at` is written by `mms_bump_ticket` and by
 * `mms_line_transition`'s served edge, and both mean THE PASS FINISHED IT. There is no runner event
 * anywhere. "Ready" on a screen a dining room reads is also aimed at the wrong person — a guest
 * reads it as an instruction, and dine-in is table service, so there is nothing for them to do. `up`
 * is the kitchen's own word for the fact the stamp actually holds: the food has come out.
 */
export type PulseTableStatus = "cooking" | "up";

/** One all-day rail row: a dish and how many are on the wok, across the WHOLE kitchen. */
export type PulseDish = { name: string; nameMy: string | null; qty: number };

/** One dine-in row: the tent-card number and a coarse status. Nothing else may join this type. */
export type PulseTable = { table: number; status: PulseTableStatus };

export type BoardPulse = {
  /** Distinct tickets with food actually on the wok. HELD (future fire time) tickets are not. */
  tickets: number;
  /**
   * The oldest live ticket's age in WHOLE MINUTES, or null when nothing is cooking.
   *
   * A MINUTE COUNT, never the fire timestamp it came from. At one live ticket beside one table on
   * the strip, an exact `fire_at` would state that party's order instant to the room; a minute
   * figure states what anyone watching the table already knows. It also removes a two-clock
   * subtraction from the screen — both endpoints are the DATABASE clock here, in one place, so
   * there is no drift to clamp and no negative age to render.
   */
  oldestMinutes: number | null;
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
export const PULSE_DINEIN_MODE = "dinein";
export const PULSE_TABLE_MODES: ReadonlySet<string> = new Set([PULSE_DINEIN_MODE]);

/**
 * A dine-in ticket belongs to a table only while its session is live; a cleared table drops off.
 *
 * ⚠️ `active` IS ONLY HALF THE TEST HERE — the ghost rule in `shapeBoardPulse` is the other half,
 * and an earlier draft of this comment argued the opposite, so the correction is worth keeping.
 * That draft said the strip should copy the KDS (status alone) rather than the floor board (status
 * AND `expires_at > now`), on the ground that the TTL "bounds a JWT, not a meal". Measured, that is
 * wrong in the way that matters: `is_member` (`20260618000000_qr_platform_init.sql`) requires
 * `expires_at > now()`, so past the TTL the DINERS THEMSELVES can no longer act on their own cart.
 * The session is not a live table with an inconvenient clock; it is dead, and nothing closes it —
 * `app/api/session/route.ts` states there is no background sweeper, and nothing anywhere extends
 * the four hours. One unbumped line on such a session would pin its number to a public wall for
 * good.
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
 * How long a table keeps reading `up` after its last line was bumped.
 *
 * A DISPLAY WINDOW over a fact, not a bound on a claim — which is the difference the `up` wording
 * buys. `bumped_at` (stamped by `mms_bump_ticket` and by `mms_line_transition`'s served edge,
 * cleared again by `mms_recall_ticket`) says the pass finished the food, and that stays true; what
 * stops being USEFUL is a five-minute-old announcement, so the wall stops repeating it. Without the
 * window a table would read `up` from the bump until it paid — half an hour of a wall repeating an
 * announcement nobody still needs.
 */
export const PULSE_PASS_LINGER_MS = 5 * 60 * 1000;

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

/**
 * The parent cart. `status` is CARRIED, not merely filtered upstream — the read narrows it to
 * open/paid, but the two are not interchangeable and the load rule below has to tell them apart.
 * An earlier version of this type dropped the column and left a comment saying it was "carried for
 * clarity", which is mechanically why the shaper could not restate `kitchen.ts`'s rule at all.
 */
export type PulseCartRow = { id: string; session_id: string; status: string };

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
  /**
   * The 4-hour mint TTL. `not null` in the schema (`20260618000000_qr_platform_init.sql`) and NEVER
   * extended by anything in this repo — see the ghost rule below. Typed non-nullable so this module
   * grows no branch for a state the column forbids: it rejects a zero-clamp two screens down for
   * exactly that reason, and an unreachable guard is one no mutant can make fail.
   */
  expires_at: string;
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
  const passFloorMs = nowMs - PULSE_PASS_LINGER_MS;

  const cookingCarts = new Set<string>();
  /** session id → has food on the wok / has food just out of it. */
  const cookingSessions = new Set<string>();
  const passSessions = new Set<string>();
  const dishes = new Map<string, PulseDish>();
  let oldestFiredMs = Number.POSITIVE_INFINITY;

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
    // ⚠️ THE KDS'S PER-CHANNEL LIVENESS RULE, RESTATED — and it was MISSING here, while this file,
    // the CHANGELOG and an OPEN-ITEMS row all claimed the load figures used it. What the omission
    // actually published: a dine-in table pays (its cart flips open→paid), one line is never bumped
    // (`mms_bump_ticket` serves only the lines the cook SAW, so this is ordinary), staff clear the
    // table — and `clearTable` cancels only the OPEN cart (`.eq("status","open")`, lib/floor.ts)
    // before closing the session, so that paid cart's `fired` line survives untouched. With no
    // liveness test the wall then counted it as live kitchen work for a full 24 hours, climbing
    // `Oldest` toward 1440, while the KDS beside it correctly showed nothing.
    const dineIn = sess.mode === PULSE_DINEIN_MODE;
    if (dineIn) {
      if (sess.status !== PULSE_LIVE_SESSION_STATUS) continue; // cleared/closed table
    } else if (cart.status !== "paid") {
      continue; // non-dine-in food only legitimately fires at settlement
    }

    if (PULSE_COOKING_STATES.has(l.state)) {
      cookingCarts.add(l.cart_id);
      cookingSessions.add(cart.session_id);
      if (fireMs < oldestFiredMs) oldestFiredMs = fireMs;
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
      if (Number.isFinite(bumpedMs) && bumpedMs >= passFloorMs) passSessions.add(cart.session_id);
    }
  }

  const byTable = new Map<number, PulseTableStatus>();
  for (const sess of sessionById.values()) {
    // ALLOWLIST — the strip is dine-in and nothing else, and an unregistered sticker (a dine-in
    // session with no `table_number`) has no number to show, so it stays off the wall while still
    // counting toward the load figures above.
    if (!PULSE_TABLE_MODES.has(sess.mode)) continue;
    if (sess.status !== PULSE_LIVE_SESSION_STATUS) continue; // the strip's half of the test
    // …AND not a GHOST. `status` alone is what the KDS uses; the FLOOR board — the surface that owns
    // table state — pairs it with `expires_at > now`, because nothing in this repo closes an
    // abandoned session (`app/api/session/route.ts`: "there's no background sweeper") and nothing
    // ever extends the 4-hour TTL. Past it `is_member` refuses the diners themselves, so the table
    // is functionally dead while its row still says `active` — and one unbumped line would otherwise
    // pin its number to a public wall indefinitely. The strip is about TABLES, so it follows the
    // table authority. The load figures above deliberately do NOT, so the wall and the pass keep
    // counting the same tickets; the residual disagreement is stated in OPEN-ITEMS rather than
    // resolved on one screen only.
    const expiresMs = new Date(sess.expires_at).getTime();
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) continue;
    if (sess.table_number === null) continue;
    const cooking = cookingSessions.has(sess.id);
    const up = passSessions.has(sess.id);
    if (!cooking && !up) continue;
    // Two sessions can share a number across a re-seat, and one table can hold a paid cart beside a
    // fresh open one. COOKING WINS in either case: there is still food on the wok for that number,
    // and a wall that said `up` would send a runner to collect a plate that is not out yet.
    const next: PulseTableStatus = cooking ? "cooking" : "up";
    if (byTable.get(sess.table_number) === "cooking") continue;
    byTable.set(sess.table_number, next);
  }

  const ranked = [...dishes.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  // ⚠️ SESSIONS, NOT CARTS — the floor is about how many PARTIES the rail could be attributed to,
  // and one party can hold two carts at once (a paid cart with unbumped lines beside a fresh open
  // one; the strip's own comment below contemplates exactly that). Counting carts let two parties
  // look like three and opened the rail one party early, which is the one thing the floor exists to
  // prevent. `tickets` stays a CART count, because a ticket is what the kitchen and the KDS mean by
  // one — the two numbers measure different things and must not be collapsed.
  const railOpen = cookingSessions.size >= PULSE_RAIL_MIN_TICKETS;
  const allDay = railOpen ? ranked.slice(0, PULSE_RAIL_MAX_ROWS) : [];

  return {
    tickets: cookingCarts.size,
    // No zero-clamp, deliberately: `oldestFiredMs` is only ever assigned INSIDE the cooking branch,
    // which sits below `if (fireMs > nowMs) continue`, so the subtraction cannot be negative. A
    // clamp here would be unreachable defensive code — a branch no mutant could make fail, which is
    // the shape this repo calls decorative.
    oldestMinutes: Number.isFinite(oldestFiredMs)
      ? Math.floor((nowMs - oldestFiredMs) / 60_000)
      : null,
    allDay,
    allDayMore: railOpen ? ranked.length - allDay.length : 0,
    tables: [...byTable.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([table, status]) => ({ table, status })),
  };
}
