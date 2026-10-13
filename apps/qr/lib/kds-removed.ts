import type { KitchenLine, KitchenStation, KitchenTicket } from "./kitchen-types";

/**
 * The lifecycle audit (2026-10-13, kitchen ↔ floor ↔ board) — a dish VOIDED off the board while the
 * kitchen may still be cooking it, said ONCE, until a cook taps Got it.
 *
 * A server's Remove of a sent dish (`mms_void_line`) reached the KDS only as a silent disappearance:
 * the board's read holds fired and cooking lines alone, so the row simply was not there on the next
 * poll — no flash, no chime, no words. A cook head-down at the wok kept cooking a dish nobody would
 * pay for, or carried it to the table. The durable answer is a per-line stop record written by the
 * void itself (a migration — OPEN-ITEMS M306); until then the board works in two steps:
 *
 *   1. CANDIDATES (`removalCandidates`) — the lines on the previous good snapshot that are on no card
 *      of this one, that this device did not bump, and that no stop card already strikes (a cleared
 *      table has its own card). A line can leave for many reasons: a bump on another tablet, a merge
 *      folding it into another line, a session closing, a void. The diff cannot tell them apart.
 *   2. CONFIRMATION (`confirmRemovals`) — ONE read of `qr_cart_items` by those ids, for each line's
 *      CURRENT state. Only `voided` is a removal. A line now `served` was bumped (a teammate's Done —
 *      the served rail is a different statement from the line read, so a bump landing between the two
 *      used to read as a void: the blind pass on #360, CRITICAL 4). A line the read does not return
 *      (a merge folded it away), any other state, or a read that failed says NOTHING — a false "stop"
 *      is its own harm.
 *
 * Because the confirmation is by id, it holds for a whole card that left too: a one-dish card whose
 * dish was voided, or a card whose every dish was, is said like any other.
 *
 * A FULL REFUND IS NOT HERE. A refunded order's food stays on the board, tagged (`refundedCarts`); it
 * never leaves, so it is never a removal (the blind pass on #360, CRITICAL 1).
 *
 * Pure: no React, no I/O. The board owns the snapshots, its own bumps, the read and the
 * acknowledgements.
 */

/** One dish the board says was voided off it. `key` is the line's own (one line, one marker). */
export type KdsRemoval = {
  key: string;
  line: KitchenLine;
  /** The card it stood on, for the name the marker says ("Table 6", "#A1B2C3", "Min"). */
  ticket: Pick<
    KitchenTicket,
    "key" | "channel" | "tableNumber" | "label" | "shortCode" | "customerName" | "unpaid"
  >;
};

export type KdsCandidateInput = {
  /** The board's previous GOOD snapshot. */
  prev: readonly KitchenTicket[];
  /** This good snapshot. */
  next: readonly KitchenTicket[];
  /** Line ids THIS device bumped (All done, or a line's Done) — their leaving is the cook's own tap. */
  ownBumps: ReadonlySet<string>;
  /** Line ids a stop card of this snapshot strikes (a cleared table's card says it already). */
  stopped: ReadonlySet<string>;
};

/** Step 1 — the lines that left the board without this device's bump: each a removal only if the
 *  confirmation read says the line is now `voided`. */
export function removalCandidates(i: KdsCandidateInput): KdsRemoval[] {
  const nowOn = new Set<string>();
  for (const t of i.next) for (const l of t.lines) nowOn.add(l.id);
  const out: KdsRemoval[] = [];
  const seen = new Set<string>();
  for (const t of i.prev) {
    for (const l of t.lines) {
      // Still on the board — under this card or any other (a merge re-keys, a Cook now re-keys).
      if (nowOn.has(l.id) || seen.has(l.id)) continue;
      // The cook's own tap on this tablet: never an alarm about her own bump.
      if (i.ownBumps.has(l.id)) continue;
      // A cleared table's stop card already strikes it: one word per dish, never two.
      if (i.stopped.has(l.id)) continue;
      seen.add(l.id);
      out.push({
        key: `removed:${l.id}`,
        line: l,
        ticket: {
          key: t.key,
          channel: t.channel,
          tableNumber: t.tableNumber,
          label: t.label,
          shortCode: t.shortCode,
          customerName: t.customerName,
          unpaid: t.unpaid,
        },
      });
    }
  }
  return out;
}

/** The most candidates one confirmation read asks about. A poll that loses more than this many lines
 *  at once is a clear or a merge, not a void; the rest say nothing (never guessed). */
export const FATE_CAP = 50;

/** The ids the confirmation read asks about — the first `FATE_CAP` candidates. */
export function fateIds(candidates: readonly KdsRemoval[]): string[] {
  return candidates.slice(0, FATE_CAP).map((c) => c.line.id);
}

/**
 * Step 2 — the candidates the read CONFIRMS: the line's current state is `voided`. `fates` maps a
 * line id to its state as the read returned it; `null` is a read that failed or never answered, and
 * a candidate the read did not return (folded away, past the cap) is unknown. Unknown says nothing.
 */
export function confirmRemovals(
  candidates: readonly KdsRemoval[],
  fates: ReadonlyMap<string, string> | null,
): KdsRemoval[] {
  if (fates === null) return [];
  return candidates.filter((c) => fates.get(c.line.id) === "voided");
}

/** The markers standing after a confirmation: every one not yet acknowledged, each line once. */
export function mergeRemovals(
  standing: readonly KdsRemoval[],
  arrived: readonly KdsRemoval[],
): KdsRemoval[] {
  const fresh = new Set(arrived.map((r) => r.line.id));
  return [...standing.filter((r) => !fresh.has(r.line.id)), ...arrived];
}

/** What a station's view draws: the all-stations view every marker, a station only its own dishes
 *  (a drinks screen is never told to stop a Mohinga — the tickets' own station rule). */
export function removalsForStation(
  removals: readonly KdsRemoval[],
  station: "all" | KitchenStation,
): KdsRemoval[] {
  return station === "all" ? [...removals] : removals.filter((r) => r.line.station === station);
}

/**
 * This device's own bumps, each with the fetch sequence current when its write answered ok
 * (`landedAt`), or null while it is still out. A bump suppresses its line's departure in the diff
 * (never an alarm about the cook's own tap) — but only for THAT departure (#360, Codex P2).
 */
export type OwnBumps = ReadonlyMap<string, number | null>;

/**
 * The pending bumps after a good snapshot fetched as `seq`. A bump stays pending only while its
 * departure has not been seen:
 *   · its line is OFF this snapshot — the departure is this diff's, consumed;
 *   · its line is ON this snapshot and the snapshot was fetched AFTER the bump landed — the line came
 *     BACK (another tablet recalled it before this one ever saw it leave): the suppression ends, so a
 *     later void of the restored line is said, never swallowed as this tablet's old bump;
 *   · its line is ON a snapshot fetched before the bump landed (the read raced the write), or the
 *     bump is still out — pending.
 */
export function ownBumpsAfter(
  ownBumps: OwnBumps,
  next: readonly KitchenTicket[],
  seq: number,
): Map<string, number | null> {
  const on = new Set(next.flatMap((t) => t.lines.map((l) => l.id)));
  const out = new Map<string, number | null>();
  for (const [id, landedAt] of ownBumps) {
    if (!on.has(id)) continue;
    if (landedAt !== null && seq > landedAt) continue;
    out.set(id, landedAt);
  }
  return out;
}

/** The line ids the stop cards of a read strike — none when the stop read did not answer. */
export function stoppedLineIds(
  stops: readonly { lines: readonly { id: string }[] }[] | null,
): Set<string> {
  return new Set((stops ?? []).flatMap((s) => s.lines.map((l) => l.id)));
}
