import { isCounterOrder, kdsLineGate } from "./counter-order";
import type { KitchenRound } from "./kitchen-types";
import { cardStamp, ticketKey } from "./kitchen-rounds";
import { groupStage, rollUp, trackStage, type KitchenStage } from "./kitchen-track";
import { catalogNameMy } from "./ticket-names";
import {
  PULSE_COOKING_STATES,
  PULSE_PASS_LINGER_MS,
  PULSE_TABLE_MODES,
  type PulseCartRow,
  type PulseSessionRow,
} from "./board-pulse";

/**
 * PD9 — THE TV BOARD'S TABLES (PATH_DESIGN 2026-10-07 decision 11; spec
 * `docs/path-design-2026-10-07/m9-tv-board.md`). Every dine-in table with food in the kitchen, per
 * Send, per dish, on the ONE KITCHEN TRACK (Sent · Cooking · Served), shaped in ONE place.
 *
 * THE BOUNDARY IS THIS MODULE'S OUTPUT TYPE, and it is the owner's 2026-10-07 reversal of the one
 * this wall shipped with (OPEN-ITEMS K32(b), P6a; `lib/board-pulse.ts` keeps the record):
 *
 *   PUBLISHED   a table number · per Send, its round number (or "next round") · per dish row, the
 *               snapshot name, the catalog's Burmese, the stage and a to-go flag · whether the table
 *               is all served.
 *   WITHHELD    every guest name, every id (session, cart, line, order, batch), every quantity,
 *               modifier, note, seat, comp, void, amount and staff attribution, every time and age.
 *               None has a field below, so none can leak by a later edit at a call site.
 *
 * A QUANTITY IS NEVER PUBLISHED, NOR IMPLIED: two bowls of Mohinga in one Send are ONE row (the
 * group key is the Send, the snapshot name and the fulfillment — Codex round 4 on #319: a to-go bowl
 * of the same dish gets its own row with the to-go tag, and a dine-in row never borrows it). A
 * row's stage is the LEAST advanced of its lines (`groupStage`), so it reads Cooking until every
 * bowl of it is out.
 *
 * WHAT DECIDES THE STAGE IS NOT HERE. `lib/kitchen-track.ts` derives the stage, a group's stage and a
 * pass's roll-up for every surface (m9 critic B8): Served waits out `KDS_UNDO_MS` on the DB clock,
 * so a dish Mom can still take back with one tap never reads Served on the wall, and a table never
 * celebrates it. This module only gates, filters and shapes:
 *
 *   · the KDS's own gate (`kdsLineGate`): a cleared table and a Send inside its grace never appear —
 *     the wall never shows a dish the KDS does not;
 *   · the stage allowlist (Sent · Cooking · Served): a draft (unsent), a voided dish and a grocery
 *     line never appear;
 *   · dine-in only (`PULSE_TABLE_MODES`, an ALLOWLIST); a session past its TTL is a ghost and stays
 *     off (`lib/board-pulse.ts`, the ghost rule); a session with no table number has nothing to show;
 *   · the linger: a Send stays while any of its dishes is not served, or for `PULSE_PASS_LINGER_MS`
 *     after its last bump; a table stays while any Send stays;
 *   · rounds: one Send is one round (`ticketKey`, the KDS's own card key), numbered by the KDS's own
 *     read (`roundOf` — `lib/kitchen-round-read.ts`), so the wall and Mom's board give one card one
 *     number. An unknown number reads "next round" only beside an older round on the same pass.
 *
 * Two sessions on one number (a re-seat inside the linger, a merge) share one pass: their Sends
 * merge by stamp, and the table is all served only when every dish of both is (cooking wins).
 *
 * PURE: every rule is falsified by a value in `board-tables.test.ts` and by a `board-tables/*`
 * mutant.
 */

/** The wall's three stamps: Sent · Cooking · Served — the ONE `KitchenStage` (`@mms/ui`), minus the
 *  two a wall never draws (unsent, and sending inside the grace). A subset, never a second vocabulary. */
export type BoardDishStage = Extract<KitchenStage, "sent" | "cooking" | "served">;

/** One dish row: a name and its stage. No quantity, modifier, note or id — the shape is the boundary. */
export type BoardDish = {
  name: string;
  nameMy: string | null;
  stage: BoardDishStage;
  togo: boolean;
};

/** One Send of the table: its round number when known (`n`), or "next round" (`next`) when the
 *  number is unknown and an older round is on the pass. Round 1 draws no stub (the screen's rule). */
export type BoardRound = { n: number | null; next: boolean; dishes: BoardDish[] };

/** One table pass. `out`: every dish on it is served (the roll-up), the one celebration's trigger. */
export type BoardTable = { table: number; out: boolean; rounds: BoardRound[] };

/** A kitchen line, exactly the columns the route reads (server-only; never published as is). */
export type BoardLineRow = {
  id: string;
  cart_id: string;
  menu_item_id: string;
  name: string;
  state: string;
  fire_at: string | null;
  fire_batch: string | null;
  fulfillment: string | null;
  created_at: string;
  bumped_at: string | null;
};

export type ShapeTablesInput = {
  lines: readonly BoardLineRow[];
  cartById: ReadonlyMap<string, PulseCartRow>;
  sessionById: ReadonlyMap<string, PulseSessionRow>;
  /** `menu_items.name_my` by id — ADVISORY. An absent entry draws the English snapshot name alone. */
  nameMyByItem: ReadonlyMap<string, string | null | undefined>;
  /** The Send's round from the KDS's own read (`roundFor`); `unknown` when it did not answer. */
  roundOf: (sessionId: string, batch: string | null) => KitchenRound;
  /** The DATABASE clock. */
  nowIso: string;
};

/** The wall's stamps, positively: the only `kitchen-track` stages a dish may wear here. */
const WALL_STAGES: ReadonlySet<string> = new Set<BoardDishStage>(["sent", "cooking", "served"]);

type Send = { key: string; table: number; sessionId: string; lines: BoardLineRow[] };

export function shapeBoardTables(input: ShapeTablesInput): BoardTable[] {
  const { lines, cartById, sessionById, nameMyByItem, roundOf, nowIso } = input;
  const nowMs = Date.parse(nowIso);
  const lingerFloorMs = nowMs - PULSE_PASS_LINGER_MS;

  const sends = new Map<string, Send>();
  for (const l of lines) {
    const cart = cartById.get(l.cart_id);
    if (!cart) continue; // cancelled/cleared cart, or one the status filter excluded
    const sess = sessionById.get(cart.session_id);
    if (!sess) continue; // unplaceable — never published
    // ALLOWLIST: a table's food is on the wall, a pickup's or scan-and-go's never (their codes are).
    if (!PULSE_TABLE_MODES.has(sess.mode)) continue;
    // An unregistered sticker has no number to show; a session past its TTL is a ghost (the diners
    // themselves can no longer act on it, and nothing closes it — `board-pulse.ts`'s ghost rule).
    if (sess.table_number === null) continue;
    const expiresMs = Date.parse(sess.expires_at);
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) continue;
    // The KDS's own gate: a cleared table, and a Send inside its 10 s grace, are not on the KDS — so
    // they are not on the wall.
    const gate = kdsLineGate({
      mode: sess.mode,
      counterOrder: false,
      sessionStatus: sess.status,
      cartStatus: cart.status,
      slotted: false,
      line: { state: l.state, fire_at: l.fire_at, fulfillment: l.fulfillment ?? "dinein" },
      cartOwes: false,
      nowMs,
    });
    if (!gate.show) continue;
    // The stage allowlist: a draft (unsent), a voided dish and a grocery line are not food the
    // kitchen has.
    const stage = trackStage(l, nowIso);
    if (stage === null || !WALL_STAGES.has(stage)) continue;
    const key = ticketKey(l);
    const send = sends.get(key);
    if (send) send.lines.push(l);
    else
      sends.set(key, {
        key,
        table: sess.table_number,
        sessionId: cart.session_id,
        lines: [l],
      });
  }

  // Tables: each Send that still has something to say, oldest first.
  const byTable = new Map<number, Send[]>();
  for (const send of sends.values()) {
    if (lingeredOut(send.lines, nowIso, lingerFloorMs)) continue;
    const list = byTable.get(send.table);
    if (list) list.push(send);
    else byTable.set(send.table, [send]);
  }

  return [...byTable.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([table, list]) => {
      const ordered = [...list].sort(
        (a, b) => cmp(cardStamp(a.lines), cardStamp(b.lines)) || cmp(a.key, b.key),
      );
      const rounds = ordered.map((send, i): BoardRound => {
        const round = roundOf(send.sessionId, send.lines[0]?.fire_batch ?? null);
        return {
          n: round.kind === "n" ? round.n : null,
          // "Next round" only for an UNKNOWN number with an older round on this pass (decision 17).
          next: round.kind === "unknown" && i > 0,
          dishes: shapeDishes(send.lines, nameMyByItem, nowIso),
        };
      });
      const all = ordered.flatMap((s) => s.lines);
      return { table, out: rollUp(all, nowIso).stage === "served", rounds };
    });
}

/**
 * A Send leaves the wall once every dish on it is served AND its last bump is older than the linger:
 * the announcement has been made. A Send with anything still cooking stays, whatever its age.
 */
function lingeredOut(lines: readonly BoardLineRow[], nowIso: string, floorMs: number): boolean {
  let lastBumpMs = Number.NEGATIVE_INFINITY;
  for (const l of lines) {
    if (trackStage(l, nowIso) !== "served") return false;
    const ms = l.bumped_at === null ? Number.NaN : Date.parse(l.bumped_at);
    if (Number.isFinite(ms) && ms > lastBumpMs) lastBumpMs = ms;
  }
  return lastBumpMs < floorMs;
}

/** The Send's dish rows: one per (snapshot name, to-go), at the group's least-advanced stage. */
function shapeDishes(
  lines: readonly BoardLineRow[],
  nameMyByItem: ReadonlyMap<string, string | null | undefined>,
  nowIso: string,
): BoardDish[] {
  const groups = new Map<
    string,
    { name: string; togo: boolean; nameMy: string | null; at: string; lines: BoardLineRow[] }
  >();
  for (const l of lines) {
    const togo = l.fulfillment === "togo";
    const key = `${togo ? "t" : "d"}|${l.name}`;
    const at = l.fire_at ?? l.created_at;
    const g = groups.get(key);
    if (g) {
      g.lines.push(l);
      if (at < g.at) g.at = at;
      // The first Burmese the catalog gives for the row wins and never flips mid-poll.
      g.nameMy ??= catalogNameMy(nameMyByItem.get(l.menu_item_id), l.name);
    } else
      groups.set(key, {
        name: l.name,
        togo,
        nameMy: catalogNameMy(nameMyByItem.get(l.menu_item_id), l.name),
        at,
        lines: [l],
      });
  }
  return [...groups.values()]
    .sort((a, b) => cmp(a.at, b.at) || cmp(a.name, b.name) || Number(a.togo) - Number(b.togo))
    .map((g) => ({
      name: g.name,
      nameMy: g.nameMy,
      // Every line passed the stage allowlist, so the least advanced is one of the three.
      stage: groupStage(g.lines, nowIso) as BoardDishStage,
      togo: g.togo,
    }));
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * PD9 (the blind pass on #336) — whether the kitchen has NO food on the wok, of ANY channel: the one
 * fact behind the wall's "All clear". The tables are dine-in only, so an empty table list is not an
 * empty kitchen — a pickup or scan-and-go bag cooking, a counter order sent before it was paid, or a
 * table the wall does not draw (an unnumbered sticker, a session past its TTL) all mean the wok is
 * busy, and "All clear" over them is the lie the route refuses (`tables: null`, never all-clear).
 *
 * The rule is the KDS's own (`kdsLineGate`, with the counter predicate): a fired or in-progress line
 * the kitchen board shows, not HELD (a scheduled pickup is not on the wok yet) — so the wall and Mom's
 * board agree on "nothing to cook". A served line is out of the wok. A line whose cart is absent was
 * cancelled or cleared (the read keeps only open and paid carts). A line whose SESSION is absent cannot
 * be judged, and the answer is "not idle": silence is the safe failure of an "All clear".
 */
export function kitchenIdle(input: {
  lines: readonly BoardLineRow[];
  cartById: ReadonlyMap<string, PulseCartRow>;
  sessionById: ReadonlyMap<string, PulseSessionRow>;
  nowIso: string;
}): boolean {
  const nowMs = Date.parse(input.nowIso);
  for (const l of input.lines) {
    if (!PULSE_COOKING_STATES.has(l.state)) continue;
    const cart = input.cartById.get(l.cart_id);
    if (!cart) continue;
    const sess = input.sessionById.get(cart.session_id);
    if (!sess) return false;
    const gate = kdsLineGate({
      mode: sess.mode,
      counterOrder: isCounterOrder({ mode: sess.mode, qrCode: sess.qr_code }),
      sessionStatus: sess.status,
      cartStatus: cart.status,
      // A paid counter cart's in-grace line is hidden or held either way — neither is on the wok.
      slotted: false,
      line: { state: l.state, fire_at: l.fire_at, fulfillment: l.fulfillment ?? "dinein" },
      cartOwes: false,
      nowMs,
    });
    if (gate.show && !gate.held) return false;
  }
  return true;
}
