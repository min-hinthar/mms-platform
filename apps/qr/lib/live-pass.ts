import type { CartItem } from "@mms/db";
import { kitchenTrackLit } from "@mms/ui";
import { KDS_UNDO_MS } from "./kds-undo";
import { rollUp, trackStage, type KitchenStage, type TrackLine } from "./kitchen-track";
import { RESTAURANT_TZ } from "./pickupTime";

/**
 * The margin every pass's ONE scheduled re-read lands past the instant it waits for (a Send leaving
 * its grace, a bump leaving Mom's undo window), so the read lands AFTER it on the server rather than
 * a tick before — where it would read the line still "Sending…" and schedule nothing more. Shared by
 * this live pass (`settleRereadDelayMs`) and the "Show a server" pass (`graceRereadDelayMs`,
 * lib/show-server — which imports it from here, since PD1's tail made that module read the track
 * through this one).
 */
export const GRACE_REREAD_MARGIN_MS = 300;

/**
 * PD10 (PATH_DESIGN_2026-10-07 decision 10; spec `docs/path-design-2026-10-07/m10-live-pass-pay.md`)
 * — the guest's LIVE ONE PASS on the Bill, decided as values. Pure: no React, no I/O.
 *
 * The Bill's receipt rows became the One Pass body (post-pay's `CounterPass`, rendered — never
 * redrawn), each dish carrying the ONE KITCHEN TRACK. WHAT DECIDES A STAGE IS NOT HERE:
 * `lib/kitchen-track.ts` derives a line's stage and the pass's roll-up for every surface (m10 B3),
 * and this module only feeds it the cart view's lines and the view's clock, then says when to look
 * again and what may move.
 *
 * THE CLOCK IS THE VIEW'S DB CLOCK (`getCartView.dbNow`, `mms_now()` read before the lines), held
 * FIXED for the life of the view: a stage never advances on this phone's clock. Inside the Send's
 * grace a line stays "Sending…", and a served line stays "Cooking" until its bump is `KDS_UNDO_MS`
 * old — then ONE scheduled re-read (`settleRereadDelayMs`) asks the server again, and the stage
 * moves on an OBSERVED view (D5, Codex round 4: Mom's bump she takes back inside her six seconds
 * never reads Served, never opens a door, never plays a moment).
 */

/** A cart-view line as the track reads it: the raw columns `getCartView` carries, never re-shaped. */
export function trackLineOf(
  i: Pick<CartItem, "lineState" | "fireAt" | "bumpedAt" | "fulfillment">,
): TrackLine {
  return {
    state: i.lineState,
    fire_at: i.fireAt ?? null,
    bumped_at: i.bumpedAt ?? null,
    fulfillment: i.fulfillment,
  };
}

/**
 * The view's clock as the ISO every comparison reads. An UNKNOWN clock is "" — never this phone's
 * time: `Date.parse("")` is NaN, so every comparison against it fails CLOSED (a line in its grace
 * stays "Sending…", a bump stays unsettled, the door stays held) until a view brings a clock.
 */
export function viewClockIso(ms: number | null): string {
  return ms !== null && Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

/** One dish row's stage on the pass — null when the line is off the track (voided, grocery). */
export function passRowStage(i: CartItem, nowIso: string): KitchenStage | null {
  return trackStage(trackLineOf(i), nowIso);
}

/** The pass head: the least-advanced stage across the dishes (the roll-up), and its Sent stamp. */
export function passHead(
  items: ReadonlyArray<CartItem>,
  nowIso: string,
): { stage: KitchenStage | null; sentAt: string | null } {
  return rollUp(items.map(trackLineOf), nowIso);
}

/**
 * The ONE re-read the live pass schedules: how long (ms, from the receipt of this view) until the
 * earliest stage change the CLOCK alone will cause — a Send leaving its grace (`fire_at`), or a
 * bump leaving Mom's undo window (`bumped_at + KDS_UNDO_MS`) — on the view's DB clock, plus the
 * shared margin so the read lands after the instant, never on it. Null when nothing is waiting on
 * the clock (realtime brings every other change). A DURATION between two server stamps, never a
 * server stamp against this device's clock (lib/send-grace's rule). An unknown clock schedules
 * nothing: there is no duration to measure, and the next view brings one.
 */
export function settleRereadDelayMs(
  // The four columns the clock acts on — a Pick, so /track's post-order kitchen read
  // (lib/order-kitchen.ts) schedules its re-read through this ONE rule rather than a copy of it.
  items: ReadonlyArray<Pick<CartItem, "fulfillment" | "lineState" | "fireAt" | "bumpedAt">>,
  nowMs: number | null,
): number | null {
  if (nowMs === null || !Number.isFinite(nowMs)) return null;
  let soonest: number | null = null;
  const consider = (left: number) => {
    if (left > 0 && (soonest === null || left < soonest)) soonest = left;
  };
  for (const i of items) {
    if (i.fulfillment === "grocery") continue;
    if (i.lineState === "fired" && i.fireAt != null) {
      const fire = Date.parse(i.fireAt);
      if (Number.isFinite(fire)) consider(fire - nowMs);
    }
    if (i.lineState === "served" && i.bumpedAt != null) {
      const bumped = Date.parse(i.bumpedAt);
      if (Number.isFinite(bumped)) consider(bumped + KDS_UNDO_MS - nowMs);
    }
  }
  return soonest === null ? null : soonest + GRACE_REREAD_MARGIN_MS;
}

/**
 * The stub's Sent stamp: the restaurant's wall clock ("6:14 PM"), never the device's zone — the
 * same rule as every date surface (`RESTAURANT_TZ`). Latin digits. The narrow no-break space newer
 * ICU puts before "PM" is folded to a plain space, so the server's render and the browser's agree
 * byte for byte (a hydration mismatch is otherwise ICU-version roulette). "" for an unreadable stamp.
 */
const CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: RESTAURANT_TZ,
  hour: "numeric",
  minute: "2-digit",
});
export function passClock(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? CLOCK.format(new Date(ms)).replace(/\u202f/g, " ") : "";
}

// ── The pass's motion, decided as a VALUE (the ONE MOTION LANGUAGE; PD9's `board-motion.ts` shape) ──

/**
 * What the pass may move, one thing at a time, in a FIXED order:
 *   FILL  a dish row's newly reached segment lands (`--dur-slow`), row by row in cart order when
 *         several land together (m10 B7) — never on a first read; an un-fill is instant;
 *   TURN  the head's roll-up reaches Served (the pass's stage completes);
 *   DOOR  the served door opens (D5): the Pay control POPs (0.96 → 1, 180 ms) and the view's one
 *         region says "Ready to pay." once.
 * Inside Mom's undo window nothing moves: the server's view does not call a bump Served until it is
 * `KDS_UNDO_MS` old, so every step here is an observed, settled change.
 */
export type PassStep = { kind: "fill"; id: string } | { kind: "turn" } | { kind: "door" };

/** How long each step holds the stage, matched to its CSS (pass.css FILL `--dur-slow`; TURN two
 *  `--dur-base` halves; the door's POP `--dur-fast` × 1.5 in globals.css). */
export const PASS_STEP_MS: Readonly<Record<PassStep["kind"], number>> = {
  fill: 480,
  turn: 480,
  door: 180,
};

/**
 * What the pass remembers between applied views: each dish row's stage (by line id, in cart order),
 * the head's roll-up, and whether the served door was open — `null` when there is no door to watch
 * (the phone-pay door is parked, or the Bill is not on screen), so its first sighting is a first read.
 */
export type PassMemory = {
  stages: ReadonlyMap<string, KitchenStage | null>;
  head: KitchenStage | null;
  door: boolean | null;
};

export function passMemory(
  items: ReadonlyArray<CartItem>,
  nowIso: string,
  door: boolean | null,
): PassMemory {
  const stages = new Map<string, KitchenStage | null>();
  for (const i of items) stages.set(i.id, passRowStage(i, nowIso));
  return { stages, head: passHead(items, nowIso).stage, door };
}

/**
 * The steps one applied view plays. `prev === null` is the pass's first read, and `quiet` a view
 * read when the phone came back to the foreground (m10 A4: "a door already open on mount or on a
 * foreground re-read is drawn open, with no TURN, POP or announcement"; the motion language: never
 * on a first read or a revisit): both play nothing, and the memory they leave is the new baseline.
 *
 * Every rule is an EDGE, never a latch: a recall (or a new round) un-fills and closes the door
 * instantly, and the next time the head reaches Served or the door opens, it is news again.
 */
export function planPassMotion(
  prev: PassMemory | null,
  next: PassMemory,
  quiet: boolean,
): PassStep[] {
  if (prev === null || quiet) return [];
  const steps: PassStep[] = [];
  for (const [id, stage] of next.stages) {
    const was = prev.stages.get(id);
    // A row seen for the first time lands at its final frame; only an ADVANCE that lights a new
    // segment fills (unsent → sending lights none: the dashed grace segment is not a landing).
    if (was === undefined || was === null || stage === null) continue;
    if (kitchenTrackLit(stage) > kitchenTrackLit(was)) steps.push({ kind: "fill", id });
  }
  if (next.head === "served" && prev.head !== null && prev.head !== "served")
    steps.push({ kind: "turn" });
  if (next.door === true && prev.door === false) steps.push({ kind: "door" });
  return steps;
}
