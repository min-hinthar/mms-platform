import type { BoardDish, BoardDishStage, BoardRound, BoardTable } from "./board-tables";

/**
 * PD9 — the wall's motion, decided as a VALUE (m9 critic B6; PATH_DESIGN round 3's ONE MOTION
 * LANGUAGE). The TV moves only when food changes state, one thing at a time:
 *
 *   FILL   a dish row's newly reached segment lands (480 ms). An un-fill (a recall) is instant.
 *   TURN   a table's roll-up turns over when its LAST dish is served — ONCE per table visit.
 *   FLASH  a pickup code is issued Ready (the shipped 2 s arrival).
 *
 * A poll can carry several changes at once; they play in a FIXED order — tables by number (a
 * table's fills, or its TURN when it went all served this poll: its rows then drop their tracks, so
 * a fill there would animate a mark that is leaving), then the pickups in the order the Ready column
 * draws them. The next poll lands any backlog as final frames (the player drops the rest).
 *
 * WHAT NEVER MOVES:
 *   · a first read (a reboot, or the first good poll after the feed was down): the memory is SEEDED
 *     — every all-served table counts as celebrated and every stage as known — so a TV that comes
 *     back mid-rush plays no storm of turns, fills or flashes;
 *   · a revisit: the celebrated set is keyed by TABLE NUMBER and pruned only when the table LEAVES
 *     the payload, so a Bring-back (two minutes on the KDS) and a re-bump never celebrate the same
 *     visit twice;
 *   · inside Mom's Undo: Served waits out `KDS_UNDO_MS` on the server (`kitchen-track.ts`), so a
 *     TURN never plays for a bump she can still take back.
 */

export type MotionStep =
  | { kind: "fill"; row: string }
  | { kind: "turn"; table: number }
  | { kind: "flash"; code: string };

/** How long each step holds the stage, matched to its CSS (pass.css FILL `--dur-slow`; TURN two
 *  `--dur-base` halves; the board's FLASH `orbFlash 2s`). */
export const MOTION_STEP_MS: Readonly<Record<MotionStep["kind"], number>> = {
  fill: 480,
  turn: 480,
  flash: 2_000,
};

/** What the wall remembers between polls. `tables` is null when the kitchen half has nothing to
 *  compare against (a first read, or the kitchen read did not answer): the next tables re-seed. */
export type MotionMemory = {
  tables: { celebrated: ReadonlySet<number>; stages: ReadonlyMap<string, BoardDishStage> } | null;
  ready: ReadonlySet<string>;
};

/** A dish row's identity across polls — never published: the table, its round (by number, or by
 *  position when the number is unknown), the to-go flag and the name. */
export function rowKey(
  table: number,
  roundIndex: number,
  round: BoardRound,
  dish: BoardDish,
): string {
  return `${table}|${round.n ?? `@${roundIndex}`}|${dish.togo ? "t" : "d"}|${dish.name}`;
}

const RANK: Readonly<Record<BoardDishStage, number>> = { sent: 1, cooking: 2, served: 3 };

/**
 * The steps one poll plays, and the memory it leaves. `prev === null` is a first read: seed, play
 * nothing. `tables === null` (the kitchen read did not answer) plays no table step and forgets the
 * tables, so the next answer re-seeds them.
 */
export function planBoardMotion(
  prev: MotionMemory | null,
  tables: readonly BoardTable[] | null,
  ready: readonly string[],
): { steps: MotionStep[]; memory: MotionMemory } {
  const stages = new Map<string, BoardDishStage>();
  for (const t of tables ?? [])
    t.rounds.forEach((r, i) => {
      for (const d of r.dishes) stages.set(rowKey(t.table, i, r, d), d.stage);
    });
  const outNow = new Set((tables ?? []).filter((t) => t.out).map((t) => t.table));
  const readyNow = new Set(ready);

  if (prev === null)
    return {
      steps: [],
      memory: { tables: tables === null ? null : { celebrated: outNow, stages }, ready: readyNow },
    };

  const steps: MotionStep[] = [];
  let tableMemory: MotionMemory["tables"] = null;
  if (tables !== null) {
    if (prev.tables === null) {
      tableMemory = { celebrated: outNow, stages }; // the kitchen half's first read: seed
    } else {
      const present = new Set(tables.map((t) => t.table));
      const celebrated = new Set([...prev.tables.celebrated].filter((n) => present.has(n)));
      for (const t of tables) {
        if (t.out && !celebrated.has(t.table)) {
          celebrated.add(t.table);
          steps.push({ kind: "turn", table: t.table });
        }
        // An all-served table's rows carry no tracks (the roll-up speaks for the table), so nothing
        // of it fills — whether it turns this poll or said its news before.
        if (t.out) continue;
        t.rounds.forEach((r, i) => {
          for (const d of r.dishes) {
            const key = rowKey(t.table, i, r, d);
            const was = prev.tables?.stages.get(key);
            // A row seen for the first time lands at its final frame; only an ADVANCE fills.
            if (was !== undefined && RANK[d.stage] > RANK[was])
              steps.push({ kind: "fill", row: key });
          }
        });
      }
      tableMemory = { celebrated, stages };
    }
  }
  for (const code of ready) if (!prev.ready.has(code)) steps.push({ kind: "flash", code });
  return { steps, memory: { tables: tableMemory, ready: readyNow } };
}
