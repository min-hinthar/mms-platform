import type { KitchenLine, KitchenStation, KitchenTicket } from "./kitchen-types";

/**
 * The lifecycle audit (2026-10-13, kitchen ↔ floor ↔ board) — a dish taken off the board while the
 * kitchen may still be cooking it, said ONCE, until a cook taps Got it.
 *
 * A server's Remove of a sent dish (`mms_void_line`) and a refund of a paid order reached the KDS only
 * as a silent disappearance: the board's read holds fired and cooking lines alone, so the row simply
 * was not there on the next poll — no flash, no chime, no words. A cook head-down at the wok kept
 * cooking a dish nobody would pay for, or carried it to the table. The durable answer is a per-line
 * stop record written by the void and the refund themselves (a migration — OPEN-ITEMS); until then the
 * board diffs two consecutive snapshots of its own read and names what LEFT:
 *
 *   refunded  the line's order was refunded (the read reports its ids — `KitchenQueue.refunded`),
 *             whatever the rest of its card did: a refunded order's whole card leaves.
 *   removed   the line left a card that is STILL ON the board (its session live, its cart live), it
 *             was not bumped from THIS device, and the served rail carries no bump of it — so no
 *             cook served it anywhere. What is left is a void (or a fulfillment change, which the
 *             kitchen must hear about all the same).
 *
 * What it can NOT tell, and so never says: a whole card that leaves without a refund (a cleared table
 * has its own stop card; a merged one reappears under its new table by line id; a closed session
 * hides its lines) — and anything at all while the served rail is unreadable (`served === null`): a
 * teammate's Done on another tablet would read as a void, and a false "stop" is its own harm. Both
 * gaps close with the durable stop record.
 *
 * Pure: no React, no I/O. The board owns the snapshots, its own bumps and the acknowledgements.
 */

export type KdsRemovalWhy = "removed" | "refunded";

/** One dish the board says left it. `key` is the line's own (one line, one marker). */
export type KdsRemoval = {
  key: string;
  why: KdsRemovalWhy;
  line: KitchenLine;
  /** The card it stood on, for the name the marker says ("Table 6", "#A1B2C3", "Min"). */
  ticket: Pick<
    KitchenTicket,
    "key" | "channel" | "tableNumber" | "label" | "shortCode" | "customerName" | "unpaid"
  >;
};

export type KdsRemovalInput = {
  /** The board's previous GOOD snapshot. */
  prev: readonly KitchenTicket[];
  /** This good snapshot. */
  next: readonly KitchenTicket[];
  /** Line ids THIS device bumped (All done, or a line's Done) — their leaving is the cook's own tap. */
  ownBumps: ReadonlySet<string>;
  /** Line ids on this snapshot's served rail (a bump stamp exists), or null when that read failed. */
  served: ReadonlySet<string> | null;
  /** Line ids this snapshot reports on a refunded order (`KitchenQueue.refunded`). */
  refunded: ReadonlySet<string>;
};

/** The dishes that left the board between `prev` and `next` and must be called out (see above). */
export function kdsRemovals(i: KdsRemovalInput): KdsRemoval[] {
  const nowOn = new Set<string>();
  const liveCards = new Set<string>();
  for (const t of i.next) {
    liveCards.add(t.key);
    for (const l of t.lines) nowOn.add(l.id);
  }
  const out: KdsRemoval[] = [];
  const said = new Set<string>();
  for (const t of i.prev) {
    for (const l of t.lines) {
      // Still on the board — under this card or any other (a merge re-keys, a Cook now re-keys).
      if (nowOn.has(l.id) || said.has(l.id)) continue;
      // The cook's own tap on this tablet: never an alarm about her own bump.
      if (i.ownBumps.has(l.id)) continue;
      let why: KdsRemovalWhy | null = null;
      if (i.refunded.has(l.id)) why = "refunded";
      else if (liveCards.has(t.key) && i.served !== null && !i.served.has(l.id)) why = "removed";
      if (why === null) continue;
      said.add(l.id);
      out.push({
        key: `${why}:${l.id}`,
        why,
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

/** The markers standing after a poll: every one not yet acknowledged, each line once (the newest
 *  wave's word wins — a removed line later reported refunded is the same dish). */
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

/** This device's pending bumps after a good snapshot: only those still on the board stay pending — a
 *  bump whose line has left was consumed by the diff above (never an alarm about the cook's own tap). */
export function ownBumpsAfter(
  ownBumps: ReadonlySet<string>,
  next: readonly KitchenTicket[],
): Set<string> {
  const on = new Set(next.flatMap((t) => t.lines.map((l) => l.id)));
  return new Set([...ownBumps].filter((id) => on.has(id)));
}
