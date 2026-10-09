import type { KitchenStage } from "@mms/ui";
import { KDS_UNDO_MS } from "./kds-undo";

/**
 * PD5 — ONE KITCHEN TRACK, three stamps (PATH_DESIGN_2026-10-07, round 3). Sent (past the grace),
 * Cooking (Mom's Start), Served (Mom's Done or All done). This is the one pure derivation of a
 * line's stage, a same-name group's stage and a pass's roll-up. No surface imports it YET: the TV
 * board (PD9), the guest's live pass and Dad's pane (PD10) and the guides (PD11, PD12) are to read
 * it and never derive their own (m9 B8, m10 B3 — "name it ONCE"). Mom's KDS draws no track: her
 * rows and taps are its source.
 *
 * Pure: no React, no I/O. The input is the RAW row shape every reader already selects
 * (`qr_cart_items.state / fire_at / bumped_at / fulfillment`), so a route or a Server Component
 * feeds it straight from the database, and the clock is the DB clock it was read with.
 */

/**
 * The stage union is the `@mms/ui` `KitchenTrack` primitive's — ONE declaration, imported as a
 * TYPE (erased at build, so this module stays free of React) and re-exported for its readers, so a
 * sixth stamp can never grow on one side alone. Order matters: `STAGE_RANK` below is the "least
 * advanced" ladder, and its `Record` type makes a stamp added there a compile error here until it
 * is ranked.
 */
export type { KitchenStage };

/** The raw columns the track reads. `fulfillment` null is the dine-in default (`kitchen.ts`). */
export type TrackLine = {
  state: string;
  fire_at: string | null;
  bumped_at: string | null;
  fulfillment: string | null;
};

const STAGE_RANK: Readonly<Record<KitchenStage, number>> = {
  unsent: 0,
  sending: 1,
  sent: 2,
  cooking: 3,
  served: 4,
};

/**
 * Mom's undo window, on the DB clock: a served line counts as SERVED only once its `bumped_at` is
 * at least `KDS_UNDO_MS` old (D5, m9's data section — the TV's TURN and the phone's pay door wait
 * it out too), so a Bill that mounts inside those six seconds still reads held, and a mis-tap she
 * takes back never opened a door. A served line with NO bump stamp has nothing to settle and
 * nothing to recall; it is not up (m9: "up requires bumped_at").
 *
 * ONE start instant (Codex round 2 on #328): the board's Undo pill and Bring-back chip measure their
 * windows from the All done TAP (`KdsBoard.tsx`, `RecallEntry.tappedAt` — elapsed time on the
 * device's clock), and the server stamps `bumped_at` after the tap, so the pill's deadline falls no
 * later than the moment this reads served. The pill leaves on a timer set to that deadline, and its
 * handler refuses a tap at or past it (the blind pass on #328), so an Undo is never SENT once this
 * reads served. What that does not cover: an Undo sent just inside the window can still LAND just
 * after it, like any write in flight (a reader re-reads on its next poll), and a device clock
 * stepped mid-window (an NTP correction) moves the device's deadline with it.
 */
export function servedSettled(bumpedAt: string | null, nowIso: string): boolean {
  if (bumpedAt === null) return false;
  const bumped = Date.parse(bumpedAt);
  if (!Number.isFinite(bumped)) return false;
  return Date.parse(nowIso) - bumped >= KDS_UNDO_MS;
}

/**
 * One line's stamp, or null when the line is not on the track at all: a voided line (nothing is
 * cooking) and a grocery line (it never fires). Only food that cooks has a stage.
 */
export function trackStage(line: TrackLine, nowIso: string): KitchenStage | null {
  if (line.fulfillment === "grocery") return null;
  switch (line.state) {
    case "draft":
      return "unsent";
    case "fired": {
      // A fired line with no fire time was fired at or before now (the KDS read's M2 reading), so
      // it is past any grace; only a FUTURE fire time is the diner's undo window.
      const fire = line.fire_at === null ? Number.NaN : Date.parse(line.fire_at);
      return Number.isFinite(fire) && fire > Date.parse(nowIso) ? "sending" : "sent";
    }
    case "in_progress":
      return "cooking";
    case "served":
      return servedSettled(line.bumped_at, nowIso) ? "served" : "cooking";
    default:
      // voided — and any state this module was not written for: off the track, never guessed.
      return null;
  }
}

/** The least-advanced stage among the given lines; null when none of them is on the track. */
function leastAdvanced(lines: readonly TrackLine[], nowIso: string): KitchenStage | null {
  let least: KitchenStage | null = null;
  for (const l of lines) {
    const s = trackStage(l, nowIso);
    if (s === null) continue;
    if (least === null || STAGE_RANK[s] < STAGE_RANK[least]) least = s;
  }
  return least;
}

/**
 * A same-name group's stage (two Mohinga on one pass are one row): the LEAST advanced of its
 * lines, so a row never reads Served while a second portion is still on the wok. Lines off the
 * track (voided, grocery) never pull a group down.
 */
export function groupStage(lines: readonly TrackLine[], nowIso: string): KitchenStage | null {
  return leastAdvanced(lines, nowIso);
}

/**
 * The Sent stamp a pass prints: the earliest fire time that has cleared its grace among the lines on
 * the track — a Send still inside its grace is not sent, and a line with no fire time has no time to
 * print. Null when nothing has been sent.
 */
export function passSentAt(lines: readonly TrackLine[], nowIso: string): string | null {
  let earliest: { iso: string; ms: number } | null = null;
  for (const l of lines) {
    if (l.fire_at === null) continue;
    // The ONE grace rule is `trackStage`'s: a line still "sending" has not been sent.
    const s = trackStage(l, nowIso);
    if (s === null || s === "unsent" || s === "sending") continue;
    const ms = Date.parse(l.fire_at);
    if (!Number.isFinite(ms)) continue;
    if (earliest === null || ms < earliest.ms) earliest = { iso: l.fire_at, ms };
  }
  return earliest?.iso ?? null;
}

/**
 * The pass head: the least-advanced stage across every line on the pass, plus its Sent stamp. Round
 * 1 served and round 2 inside its grace reads SENDING (m10 C), because the pass is only as far along
 * as its slowest dish — a head that read Served over an unsent row would open the pay door early.
 */
export function rollUp(
  lines: readonly TrackLine[],
  nowIso: string,
): { stage: KitchenStage | null; sentAt: string | null } {
  return { stage: leastAdvanced(lines, nowIso), sentAt: passSentAt(lines, nowIso) };
}
