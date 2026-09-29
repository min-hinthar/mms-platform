import type { FloorTable } from "./floor-types";
import type { RegisterQueueRow } from "./register-queue";

/**
 * A4·2 — the counter's ONE list: tables and counter orders, keyed by session, in one order.
 *
 * The floor arrives already sorted (A1: the longest "pay at the counter" ask first, above every
 * table that has not asked) and the counter queue arrives oldest first (`readRegisterQueue`). This
 * rule only decides where the two meet — it never re-sorts either, so there is still exactly one
 * definition of each order. A table that asked to pay is a party waiting to leave, so it stays on
 * top; the counter orders being built come next, because they are the work in front of the person
 * holding the tablet; the rest of the room follows in the floor's own order.
 */
export type FloorRow =
  | { kind: "table"; table: FloorTable }
  | { kind: "counter"; order: RegisterQueueRow };

export function mergeFloorRows(
  tables: readonly FloorTable[],
  counter: readonly RegisterQueueRow[],
): FloorRow[] {
  // Partition on the floor's STATUS, never the stamp (Codex round 1 on A4·2): `counterRequestedAt`
  // outlives the ask — a table that asked, then started a fresh card or split payment, keeps the
  // stamp while `deriveFloorStatus` reports `paying` / `settling`, and the floor's own sort (A1)
  // lifts only status `counter`. Partitioned on the stamp, this lifted a table staff cannot settle
  // above the orders they are building.
  const asks = tables.filter((t) => t.status === "counter");
  const rest = tables.filter((t) => t.status !== "counter");
  return [
    ...asks.map((table): FloorRow => ({ kind: "table", table })),
    ...counter.map((order): FloorRow => ({ kind: "counter", order })),
    ...rest.map((table): FloorRow => ({ kind: "table", table })),
  ];
}

/** The row's key — a session id in both arms, and the floor never carries a counter session. */
export function floorRowKey(row: FloorRow): string {
  return row.kind === "table" ? row.table.sessionId : row.order.sessionId;
}

// ── Phase 2d · floor ──
/**
 * The table strip (owner decision 5c): one tile per ACTIVE registered table number, ascending, each
 * carrying the live session on that number or null when the table is free. Built from the SAME
 * snapshot the cards render, so a tile and its card can never disagree about a table.
 *
 * A number outside the registry (a host-mint join code, an unregistered sticker) has no tile — it
 * keeps its card. Two live sessions on one number is a data anomaly; the tile opens the one that
 * needs a person soonest (`STRIP_RANK`), then the latest activity.
 */
export type StripTile = { n: number; table: FloorTable | null };

/** Lower first: a table waiting on the register beats money in flight beats ordering beats rest. */
export const STRIP_RANK: Readonly<Record<FloorTable["status"], number>> = {
  counter: 0,
  paying: 1,
  settling: 2,
  ordering: 3,
  paid: 4,
  seated: 5,
};

export function tableStrip(
  registry: readonly number[],
  tables: readonly FloorTable[],
): StripTile[] {
  return registry.map((n) => {
    let pick: FloorTable | null = null;
    for (const t of tables) {
      if (t.tableNumber !== n) continue;
      if (
        pick === null ||
        STRIP_RANK[t.status] < STRIP_RANK[pick.status] ||
        (STRIP_RANK[t.status] === STRIP_RANK[pick.status] &&
          Date.parse(t.lastActivityAt) > Date.parse(pick.lastActivityAt))
      )
        pick = t;
    }
    return { n, table: pick };
  });
}

/**
 * The flip guard. A tile that turned FREE within the last `FLIP_GUARD_MS` ignores a tap: another
 * tablet cleared the table between polls, and the person was reaching for an OCCUPIED tile to open
 * it — that tap must not become a start. (The reverse flip is harmless: a tap on a tile that just
 * turned occupied navigates, and a stale start converges on the sticker's session server-side.)
 */
// A starting value (the spec's), unmeasured on a device: a poll's flip under a finger already moving
// lands inside it; a deliberate tap on a table that was free all along is never refused by it.
export const FLIP_GUARD_MS = 600;

export function freeTapAllowed(
  freeSinceMs: number | null,
  tapMs: number,
  guardMs: number = FLIP_GUARD_MS,
): boolean {
  return freeSinceMs === null || tapMs - freeSinceMs >= guardMs;
}

/**
 * The strip's flip memory: which tiles turned FREE, and when. `observe` is called after every
 * committed render with the tiles on screen (idempotent — only an occupied → free change stamps a
 * time; a tile that is occupied again forgets); `allows` is the tap-time question, answered by
 * `freeTapAllowed`. The clock is injected so the rule is falsifiable by a value, and it is read here
 * rather than in the component, which only ever asks.
 */
export type FlipGuard = {
  observe: (tiles: readonly StripTile[]) => void;
  allows: (n: number) => boolean;
};

export function createFlipGuard(now: () => number = Date.now): FlipGuard {
  let seen: Map<number, boolean> | null = null;
  const freeSince = new Map<number, number>();
  return {
    observe(tiles) {
      const at = now();
      const next = new Map(tiles.map((t) => [t.n, t.table !== null] as const));
      for (const [n, occupied] of next) {
        if (occupied) freeSince.delete(n);
        else if (seen?.get(n) === true) freeSince.set(n, at);
      }
      seen = next;
    },
    allows(n) {
      return freeTapAllowed(freeSince.get(n) ?? null, now());
    },
  };
}
