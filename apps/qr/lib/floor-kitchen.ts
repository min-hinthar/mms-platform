import { PULSE_COOKING_STATES, PULSE_PASS_LINGER_MS } from "./board-pulse";
import { kdsUrgency } from "./kds-urgency";
import { staffOwedSendUnits, staffSendCounts } from "./staff-send-view";
import { ERR_DWELL_MS } from "./kds-errors";
import { servedSettled } from "./kitchen-track";
import type { FloorKitchen } from "./floor-types";
import type { KdsThresholds } from "./kitchen-types";

/**
 * Phase 2d · floor — what the FLOOR may say about a table's kitchen, decided ONCE and pure.
 *
 * A server on the floor could not see which tables were waiting on food, for how long, or whose
 * food had just come out, without walking to the kitchen tablet. The card's kitchen row says it now
 * — and every word in it is a rule that already lives somewhere else, READ from there, never
 * restated:
 *
 *   in the kitchen  `PULSE_COOKING_STATES` (fired · in_progress) — the KDS's set. (The wall reads
 *                   the ONE KITCHEN TRACK since PD9, which also waits out Mom's undo window.)
 *   send grace      a line whose `fire_at` is still ahead is invisible, exactly as the KDS and the
 *                   wall skip it (the 10-second undo, a held pickup). `nowMs` is the DATABASE clock.
 *   ready to serve  served with `bumped_at` inside `PULSE_PASS_LINGER_MS` — the window the wall keeps
 *                   a served Send for. Never a claim that anyone RAN the food: no runner event exists.
 *                   The lifecycle audit (2026-10-13): and only once that bump has left Mom's undo
 *                   window (`servedSettled`, the ONE track's predicate) — inside it the dish is still
 *                   COOKING, exactly as the wall and the guest's pass say. A dine-in table's TO-GO
 *                   dish is never "ready to serve": it is bagged (`bagUp`, the counter card's verb).
 *   sold out        a dish in the kitchen whose menu item has been 86'd since it was sent (`soldOut`
 *                   on the row, the floor's advisory menu read). Still COUNTED in the kitchen: the
 *                   86's own words are "orders already on the board stay — tell the counter if you
 *                   can't make them", so the flag is a question for the kitchen, never a cancel.
 *   refunded        a dish in the kitchen on a cart whose order was refunded IN FULL (`refunded` on the
 *                   row, `lib/refunded-cart.ts`). Still COUNTED: the KDS keeps the card (a full refund
 *                   can be a goodwill comp at a table still eating) and says "check with the counter
 *                   before cooking" — the floor says the same of the same dishes (#360, CRITICAL 1).
 *   not sent        2a's ONE count (plan conflict "floor × send-kitchen"): `staffOwedSendUnits(
 *                   hostPresent, staffSendCounts(…))` over the OPEN cart — every sendable dish on a
 *                   hostless table, only staff-added ones on a host table (owner decision 5c) — plus,
 *                   on a counter order whose food already reached the kitchen, its `counterDraft`.
 *   late            `kdsUrgency` with the kitchen's own thresholds (`floorWait`).
 *
 * Plain module (no "server-only"): `lib/floor.ts` folds server-side; the card renders the result.
 */

/** A `qr_cart_items` row as the floor reads it, flagged by which cart it came from. */
export type FloorKitchenRow = {
  /** The line's id — half of its ready key (`upKey`), so BOTH line reads select it. */
  id: string;
  qty: number;
  state: string;
  fulfillment: string;
  fire_at: string | null;
  bumped_at: string | null;
  /** Who added it (`null` = staff) — the host-table half of the "not sent" rule reads it. */
  by_seat: string | null;
  /** The table's OPEN cart (true) or one of its paid carts (false). Only the open cart can owe a
   *  Send: a paid cart's leftovers are fired by settlement. */
  onOpenCart: boolean;
  /** The lifecycle audit — the dish has been 86'd since it was sent (the floor's ADVISORY menu
   *  read; absent or false when unknown). */
  soldOut?: boolean;
  /** The lifecycle audit — the line's cart was refunded IN FULL (`refundedCarts`); absent = no. */
  refunded?: boolean;
};

export type FloorKitchenContext = {
  /** The session's mode — the floor holds dine-in only (K21), and the send rule reads it anyway. */
  mode: string;
  /** The session has a diner host (`host_seat` set). */
  hostPresent: boolean;
  /** P2do — the table has asked to pay at the counter (the floor's `status === "counter"`): every
   *  unsent dish is then the counter's to count (`staffOwedSendUnits`). Absent off the floor's rows
   *  (a counter order's own fold) reads false. */
  counterAsk?: boolean;
  /** The DATABASE clock (`mms_now`), the one the grace and the linger are measured against. */
  nowMs: number;
};

/**
 * Phase 2d · Codex round 1 · ready — one BUMP of one served line: `<line id>@<bumped_at>`. The
 * floor's "Ready to serve" cue is keyed to this, never to the `up` count: a count cannot tell "one
 * dish left the window and another came out" from "nothing happened". `mms_recall_ticket` nulls
 * `bumped_at` and the next bump stamps a new one, so food that comes out AGAIN is a new key.
 */
const upKey = (id: string, bumpedAt: string): string => `${id}@${bumpedAt}`;

const parse = (iso: string | null): number | null => {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * #360 (Codex P2) — a SERVED line the ONE track does not call settled (`servedSettled`): the fold
 * counts it as COOKING, and the floor's sold-out lookup must flag it for exactly as long — one
 * predicate, so "in kitchen · marked sold out" never loses its flag mid-window. That is a bump still
 * inside Mom's undo window AND (Codex P2, round 3) a served row with no or an unreadable bump stamp:
 * the expo (`bumpSettled`) and the table page (`trackStage`) read that legacy row as still cooking,
 * and a floor that read it as `done` said "Kitchen done" over the same dish. Never a second copy of
 * the rule: the negation of `servedSettled`, nothing more.
 */
export function servedUnsettled(r: { bumped_at: string | null }, nowIso: string): boolean {
  return !servedSettled(r.bumped_at, nowIso);
}

export function foldFloorKitchen(
  rows: readonly FloorKitchenRow[],
  ctx: FloorKitchenContext,
  lingerMs: number = PULSE_PASS_LINGER_MS,
): FloorKitchen | null {
  const counts = staffSendCounts(
    ctx.mode,
    rows.filter((r) => r.onOpenCart),
    ctx.nowMs,
  );
  // Phase 2f review PT1 — a COUNTER order (mode pickup) owes nothing by `staffOwedSendUnits` (its
  // `sendable` is 0: a walk-up's drafts are pay-first). But once its food reached the kitchen, the
  // drafts left beside it are the ones the table page's "send the rest" asks for — so they are
  // "not sent", and the card can never read "Kitchen done" over an order still owing a Send.
  // `counterDraft` is 0 off a pickup session, so a table's count is untouched.
  const notSent =
    staffOwedSendUnits(ctx.hostPresent, counts, ctx.counterAsk === true) +
    (counts.counterSentPastGrace ? counts.counterDraft : 0);
  let inKitchen = 0;
  let up = 0;
  const upKeys: string[] = [];
  let bagUp = 0;
  let soldOut = 0;
  let refunded = 0;
  let done = 0;
  let oldestMs = Number.POSITIVE_INFINITY;
  let oldestFireAt: string | null = null;
  const nowIso = new Date(ctx.nowMs).toISOString();
  // A dish ON THE WOK — fired, started, or bumped inside Mom's undo window: counted, flagged when 86'd,
  // and the oldest one's fire time is what the wait pill counts from.
  const cooking = (r: FloorKitchenRow, fireMs: number) => {
    inKitchen += r.qty;
    if (r.soldOut === true) soldOut += r.qty;
    if (r.refunded === true) refunded += r.qty;
    if (fireMs < oldestMs) {
      oldestMs = fireMs;
      oldestFireAt = r.fire_at ?? new Date(fireMs).toISOString();
    }
  };
  // Every other count is ONE of two state sets: cooking (`PULSE_COOKING_STATES`) or `served`. A
  // draft (whose only word is "not sent", counted above) and a voided line are in neither, so they
  // fall through below without a skip of their own — a guard nothing can reach is decoration, and
  // `verify:slice` would report its mutant surviving (CLAUDE.md, "A guard that cannot be reached").
  // `comped` is never consulted: a comped dish is still cooked and still owed by the kitchen.
  for (const r of rows) {
    // A line with NO fire_at was fired at or before now (Phase 2f review M2 — the reading the KDS,
    // the no-show and Clear share). Drafts carry none too; the state sets below never count them.
    const fireMs = r.fire_at === null ? ctx.nowMs : parse(r.fire_at);
    if (fireMs === null) continue;
    // Held, or inside the send's undo grace: the kitchen has not seen it, so the floor must not.
    if (fireMs > ctx.nowMs) continue;
    if (PULSE_COOKING_STATES.has(r.state)) {
      cooking(r, fireMs);
      continue;
    }
    if (r.state === "served") {
      const bumpedMs = parse(r.bumped_at);
      // The lifecycle audit — a bump inside Mom's undo window is still COOKING on the ONE track
      // (`servedSettled`): the floor no longer cues "ready to serve" for food she can take back with
      // one tap. A served line with no (or an unreadable) stamp is not settled either, so it is
      // cooking too (#360, Codex P2) — never `done`, which the expo and the table page never say of it.
      if (servedUnsettled(r, nowIso)) {
        cooking(r, fireMs);
        continue;
      }
      if (bumpedMs !== null && bumpedMs >= ctx.nowMs - lingerMs) {
        // A dine-in table's TO-GO dish is bagged, never served to the table: it is the expo lane's
        // (the KDS tags it "Bag it"), so it never rings the floor's "Ready to serve — Table N".
        if (ctx.mode === "dinein" && r.fulfillment === "togo") bagUp += r.qty;
        else {
          up += r.qty;
          upKeys.push(upKey(r.id, r.bumped_at!));
        }
      } else done += r.qty;
    }
  }
  if (notSent === 0 && inKitchen === 0 && up === 0 && bagUp === 0 && done === 0) return null;
  return { notSent, inKitchen, up, upKeys, bagUp, soldOut, refunded, done, oldestFireAt };
}

/** One segment of the card's kitchen row — a count key with its `{n}`, or the all-done word. */
export type KitchenSegment =
  | {
      k:
        | "floor.kitchen.notSent"
        | "floor.kitchen.inKitchen"
        | "floor.kitchen.soldOut"
        | "floor.kitchen.refunded"
        | "floor.kitchen.up"
        | "floor.kitchen.up.pickup";
      n: number;
    }
  | { k: "expo.kitchenDone" };

/**
 * The row's words, in the order the card shows them. "Kitchen done" (the expo's word) stands alone
 * and only when nothing is unsent, cooking or ready — a table still owing a Send is never "done".
 * The lifecycle audit — "N marked sold out" follows "in kitchen" (it is a part of it, a question for
 * the kitchen), and a table's finished TO-GO food says the counter card's verb, "ready to bag".
 */
export function kitchenSegments(k: FloorKitchen | null): KitchenSegment[] {
  if (k === null) return [];
  const bagUp = k.bagUp ?? 0;
  const soldOut = k.soldOut ?? 0;
  const refunded = k.refunded ?? 0;
  const out: KitchenSegment[] = [];
  if (k.notSent > 0) out.push({ k: "floor.kitchen.notSent", n: k.notSent });
  if (k.inKitchen > 0) out.push({ k: "floor.kitchen.inKitchen", n: k.inKitchen });
  if (soldOut > 0) out.push({ k: "floor.kitchen.soldOut", n: soldOut });
  if (refunded > 0) out.push({ k: "floor.kitchen.refunded", n: refunded });
  if (k.up > 0) out.push({ k: "floor.kitchen.up", n: k.up });
  if (bagUp > 0) out.push({ k: "floor.kitchen.up.pickup", n: bagUp });
  if (k.notSent === 0 && k.inKitchen === 0 && k.up === 0 && bagUp === 0 && k.done > 0)
    out.push({ k: "expo.kitchenDone" });
  return out;
}

export type FloorWaitLevel = "ok" | "amber" | "red";

/**
 * The wait pill: how long the table's OLDEST in-kitchen line has been cooking, in WHOLE minutes (a
 * glance surface — per-second digits on every card would be perpetual motion), from one whole
 * minute. The level is the KDS's own dine-in rule, `kdsUrgency`, with the configured thresholds.
 */
export function floorWait(
  k: FloorKitchen | null,
  nowMs: number,
  th: KdsThresholds,
): { min: number; level: FloorWaitLevel } | null {
  if (k === null || !(k.inKitchen > 0)) return null;
  const oldestMs = parse(k.oldestFireAt);
  if (oldestMs === null) return null;
  const ageMs = Math.max(0, nowMs - oldestMs);
  const min = Math.floor(ageMs / 60_000);
  if (min < 1) return null;
  return { min, level: kdsUrgency("dinein", ageMs, th) };
}

/** The wait levels in rising order — a pill replays its pop only when the rank RISES. */
export const FLOOR_WAIT_RANK: Readonly<Record<FloorWaitLevel, number>> = {
  ok: 0,
  amber: 1,
  red: 2,
};

/**
 * Did food come OUT at this table since the last poll — a ready key (`upKey`) the table has not
 * heard? First sight is never news (a table already showing food up when the screen loads must not
 * ring), and a key LEAVING — the window closing, a recall — never cues: only food coming out is an
 * event a server can act on. Phase 2d · Codex round 1 · ready — keyed, never counted: the old
 * `next > prev` over the `up` count stayed silent when a dish came out in the same poll another's
 * window closed, because the count held.
 */
export function upRose(heard: ReadonlySet<string> | undefined, now: readonly string[]): boolean {
  if (heard === undefined) return false;
  return now.some((k) => !heard.has(k));
}

/**
 * What the table has now been told: every key it heard before, plus this poll's. Kept, never
 * replaced by the last poll alone — the floor's open-cart and paid-order reads are two requests, so
 * a table paying between them can drop its lines from ONE poll, and a dish that comes back must not
 * ring a second time. A stamp only moves forward (a re-bump is a new key), so a kept key can never
 * mask real news; the set lives only as long as the table is on the floor.
 */
export function heardUp(
  heard: ReadonlySet<string> | undefined,
  now: readonly string[],
): ReadonlySet<string> {
  return new Set([...(heard ?? []), ...now]);
}

/**
 * How long "Ready to serve — Table 7" holds the floor's one region. Its own fact (a cue, not a
 * refusal), set EQUAL to the refusal dwell on purpose (`ERR_DWELL_MS`, kitchen-10): both are a
 * sentence in a region the 5 s poll would otherwise replace at any moment, so both must outlive the
 * poll that follows them by the same reader's clock. Change one and say why the other differs.
 */
export const UP_NOTICE_DWELL_MS = ERR_DWELL_MS;
