import { CART } from "./i18n/cart";
import { TRACK, type TrackKey } from "./i18n/track";
import type { Entry } from "./i18n/types";
import { PICKED_UNDO_MS, pickedUndoOpen } from "./expo-rules";
import { undoTapHeld } from "./send-grace";
import { formatSlot, RESTAURANT_TZ } from "./pickupTime";

/**
 * PD3 — the pickup promise, ONE pure derivation (docs/path-design-2026-10-07/m3-pickup-promise.md).
 *
 * `pickupGuide` decides every state /track's pickup page can be in — the Now sentence, the current
 * stop on the path, the claim ticket's face, whether "I’m here" is offered — from the tracked order
 * and an injected clock. Nothing here renders; a value falsifies every rule (verify:slice
 * `pickup-promise/*`). The rules that bind:
 *
 *  - **`fired` gates every kitchen word (M65, the fix for guided's judged weakness).** A scheduled
 *    pickup is HELD until `fire_at = slot − prep` (20260620000100_pickup_scheduling.sql), while
 *    `togo_status = 'preparing'` lands at PAYMENT — so without this gate a noon-paid 6 PM pickup
 *    read "Your order’s with the kitchen." for hours. An as-soon-as-possible order carries
 *    `fire_at = null` and fired at settlement (20260722000000_pickup_asap.sql).
 *  - **Late is the slot alone (B6):** slot + `LATE_AFTER_MIN` with no bag yet. `fire_at ≤ slot` by
 *    construction, so a held order cannot be overdue, and requiring `fired` here would only strand
 *    a guest whose row carried no stamp.
 *  - **The arrival is offered on the pickup's own day, at every stage (decision 5)** — the day is
 *    the RESTAURANT's calendar day, never UTC's, and the server enforces the same predicate in its
 *    statement (lib/arrival.ts reads `pickupDayBounds`).
 *  - **No ETA is ever composed.** The countdown is arithmetic on the booked slot (1–90 min); from the
 *    slot onwards the line is empty. "any minute now" retired for pickup (decision 14).
 */

/** Fill the one Latin slot (`{t}` a clock, `{m}` a minute count) in both tongues of a TRACK pair. */
export function trackFill(key: TrackKey, slot: string): Entry {
  const e = TRACK[key];
  return { en: e.en.replace(/\{[tm]\}/, slot), my: e.my.replace(/\{[tm]\}/, slot) };
}

/** Minutes past the booked slot, with no bag yet, before /track says "isn’t bagged yet". The code's
 *  existing judgement (the old countdown's `mins < -15` drop), named once. */
export const LATE_AFTER_MIN = 15;

/** The take-back window before an arrival is written: the lane's own six seconds (decision 10). */
export const ARRIVAL_UNDO_MS = PICKED_UNDO_MS;

/** Has the kitchen got this ticket? `null` is an as-soon-as-possible order (fired at payment); a
 *  stamp is fired once it is reached. An unparseable stamp is NOT fired — the safe direction. */
export function isFired(fireAt: string | null, nowMs: number): boolean {
  if (fireAt === null) return true;
  const at = Date.parse(fireAt);
  return Number.isFinite(at) && at <= nowMs;
}

export type PickupStage = "confirming" | "booked" | "cooking" | "late" | "ready" | "pickedUp";
export type TicketFace = "time" | "code" | "rest";

export type PickupGuideInput = {
  /** Payment status (`paid` | `refunded` | …). */
  status: string;
  pickupSlot: string;
  fireAt: string | null;
  togoStatus: string | null;
  arrivedAt: string | null;
  createdAt: string;
};

export type PickupGuide = {
  stage: PickupStage;
  /** The current stop on the path: 0 Order placed · 1 In the kitchen · 2 Ready for pickup · 3 Picked up. */
  step: 0 | 1 | 2 | 3;
  /** The Now sentence (the h1), English leading. */
  now: Entry;
  /** The line under it, or null. */
  sub: Entry | null;
  face: TicketFace;
  /** "I’m here" is offered: the pickup's own day, any stage short of collected, a paid order. */
  arrivalOffered: boolean;
  /** Whole minutes to the slot while 1 ≤ n ≤ 90, else null. */
  countdownMin: number | null;
  /** The booked slot as the guest reads it ("6:20 PM", "Tomorrow 6:20 PM"). */
  slotLabel: string;
};

export function pickupGuide(o: PickupGuideInput, nowMs: number): PickupGuide {
  const slot = slotLabel(o.pickupSlot, nowMs);
  const fired = isFired(o.fireAt, nowMs);
  const bagged = o.togoStatus === "ready";
  const collected = o.togoStatus === "picked_up";
  const overdue = nowMs >= Date.parse(o.pickupSlot) + LATE_AFTER_MIN * 60_000;
  const stage: PickupStage = collected
    ? "pickedUp"
    : bagged
      ? "ready"
      : overdue
        ? "late"
        : fired
          ? "cooking"
          : "booked";
  const step = stage === "pickedUp" ? 3 : stage === "ready" ? 2 : stage === "booked" ? 0 : 1;
  const now: Entry =
    stage === "pickedUp"
      ? TRACK.pickedUp
      : stage === "ready"
        ? TRACK.ready
        : stage === "late"
          ? trackFill("late", slot)
          : stage === "cooking"
            ? CART.orderWithKitchen
            : trackFill("booked", slot);
  const sub: Entry | null =
    stage === "booked" ? TRACK.bookedSub : stage === "late" ? TRACK.lateSub : null;
  const face: TicketFace = stage === "pickedUp" ? "rest" : stage === "ready" ? "code" : "time";
  const arrivalOffered = o.status === "paid" && !collected && pickupIsToday(o.pickupSlot, nowMs);
  const countdownMin =
    stage === "booked" || stage === "cooking" ? pickupCountdownMin(o.pickupSlot, nowMs) : null;
  return { stage, step, now, sub, face, arrivalOffered, countdownMin, slotLabel: slot };
}

/** Whole minutes to the slot while 1 ≤ n ≤ 90; null beyond 90 (the absolute time says it better)
 *  and from the slot onwards (an implied ETA the code cannot keep). */
export function pickupCountdownMin(slotIso: string, nowMs: number): number | null {
  const mins = Math.round((Date.parse(slotIso) - nowMs) / 60_000);
  if (mins > 90) return null;
  return mins >= 1 ? mins : null;
}

// ── the restaurant's calendar day ────────────────────────────────────────────────────────────────

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: RESTAURANT_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function wall(instantMs: number): { y: number; m: number; d: number; asUtc: number } {
  const p = PARTS.formatToParts(new Date(instantMs));
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(p.find((x) => x.type === t)?.value);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  return { y, m, d, asUtc: Date.UTC(y, m - 1, d, get("hour"), get("minute"), get("second")) };
}

/** The restaurant's UTC offset at `instantMs` (negative west of Greenwich), to the second. */
function tzOffsetMs(instantMs: number): number {
  return wall(instantMs).asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** The instant of the restaurant's local midnight for the wall date `y-m-d`. Guessed from the offset
 *  at the naive midnight, then corrected with the offset AT the guess — so the day a clock change
 *  falls on (2 AM in Los Angeles) still starts at its own midnight. */
function localMidnight(y: number, m: number, d: number): number {
  const naive = Date.UTC(y, m - 1, d);
  const guess = naive - tzOffsetMs(naive);
  return naive - tzOffsetMs(guess);
}

/** The restaurant's calendar day containing `nowMs`, as a half-open instant range [start, end). */
export function pickupDayBounds(nowMs: number): { start: string; end: string } {
  const { y, m, d } = wall(nowMs);
  const start = localMidnight(y, m, d);
  const end = localMidnight(y, m, d + 1); // Date.UTC rolls the month over
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

/** Is the slot on the restaurant's calendar day that contains `nowMs`? */
export function pickupIsToday(slotIso: string, nowMs: number): boolean {
  const { start, end } = pickupDayBounds(nowMs);
  const at = Date.parse(slotIso);
  return at >= Date.parse(start) && at < Date.parse(end);
}

/** `formatSlotLong`'s rule with an injected clock: the time alone on the pickup day, "Tomorrow"
 *  prefixed the day before, else the short date. */
export function slotLabel(slotIso: string, nowMs: number): string {
  if (pickupIsToday(slotIso, nowMs)) return formatSlot(slotIso);
  if (pickupIsToday(slotIso, nowMs + 86_400_000)) return `Tomorrow ${formatSlot(slotIso)}`;
  const day = new Date(slotIso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: RESTAURANT_TZ,
  });
  return `${day} ${formatSlot(slotIso)}`;
}

// ── the take-back window ─────────────────────────────────────────────────────────────────────────

/** Is the deferred arrival write due at `nowMs`? The window starts at the tap and slides by the time
 *  a keyboard user has held it on Undo (`lib/undo-hold.ts`, capped there). */
export function arrivalCommitDue(startedMs: number, heldMs: number, nowMs: number): boolean {
  return !pickedUndoOpen(startedMs + heldMs, nowMs, ARRIVAL_UNDO_MS);
}

/** "I’m here" and its Undo swap in ONE slot: a tap on the control that just mounted, inside the
 *  same gesture as the swap, is the first tap's echo, not a change of mind (A2 / B2). */
export function arrivalTapHeld(armedAt: number | null, nowMs: number): boolean {
  return undoTapHeld(armedAt, nowMs);
}
