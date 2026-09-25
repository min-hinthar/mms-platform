/**
 * Phase 2c · pad — the order pad's adds IN FLIGHT, as values (DESIGN-LANGUAGE §4 · §23 · §28).
 *
 * The pad claims an add at the TAP — the press, the pop, a ghost row in the ticket, a `+1` on the
 * tile — and the server's answer arrives later. Between the two the ghost says what is known and
 * nothing more:
 *
 *   tap ──▶ flying ──ok──▶ landed ──a read that STARTED after it commits──▶ (gone: the line is real)
 *             │  └─refused──▶ (gone: a definite non-landing, the correction names the dish)
 *             ├─15s, no answer──▶ unconfirmed ──late ok──▶ landed
 *             └─the action itself rejected / the write may have committed──▶ lost ──retry──▶ flying
 *
 * `key` is the add key (`lib/staff-add-key.ts` · the `p_scan_id` ledger): a resend of a lost add
 * rides the SAME key, so it can never put the dish on twice. A refusal is removed by that key,
 * never by the dish — two Mohinga taps are two attempts.
 *
 * A landed ghost leaves only on a COMMITTED read whose fetch STARTED after the landing: a poll that
 * was already in the air when the write committed shows the order without it, and dropping the
 * ghost then would make the dish vanish for up to one poll.
 *
 * Pure (no "use client") so every rule is falsified by a value, not a render plus five mocks.
 */

export type PendingState = "flying" | "landed" | "unconfirmed" | "lost";

export type PendingAdd = {
  /** The add key (uuid) — the attempt's identity, the ledger's dedupe key. */
  key: string;
  itemId: string;
  /** The dish's English catalog name; `nameMy` the validated Burmese, or null. */
  name: string;
  nameMy: string | null;
  qty: number;
  state: PendingState;
  /** The last read sequence STARTED when the add landed (null until it does). */
  landedSeq: number | null;
};

export type PendingEvent =
  | {
      kind: "tap";
      key: string;
      itemId: string;
      name: string;
      nameMy: string | null;
      qty: number;
    }
  | { kind: "ok"; key: string; seq: number }
  | { kind: "refused"; key: string }
  | { kind: "timeout"; key: string }
  | { kind: "rejected"; key: string }
  | { kind: "retry"; key: string }
  | { kind: "commit"; readStartSeq: number };

function move(
  s: PendingAdd[],
  key: string,
  from: readonly PendingState[],
  to: (p: PendingAdd) => PendingAdd,
): PendingAdd[] {
  return s.map((p) => (p.key === key && from.includes(p.state) ? to(p) : p));
}

export function pendingReduce(s: PendingAdd[], e: PendingEvent): PendingAdd[] {
  switch (e.kind) {
    case "tap":
      if (s.some((p) => p.key === e.key)) return s;
      return [
        ...s,
        {
          key: e.key,
          itemId: e.itemId,
          name: e.name,
          nameMy: e.nameMy,
          qty: e.qty,
          state: "flying",
          landedSeq: null,
        },
      ];
    case "ok":
      return move(s, e.key, ["flying", "unconfirmed", "lost"], (p) => ({
        ...p,
        state: "landed",
        landedSeq: e.seq,
      }));
    case "refused":
      return s.filter((p) => p.key !== e.key);
    case "timeout":
      return move(s, e.key, ["flying"], (p) => ({ ...p, state: "unconfirmed" }));
    case "rejected":
      return move(s, e.key, ["flying", "unconfirmed"], (p) => ({ ...p, state: "lost" }));
    case "retry":
      return move(s, e.key, ["lost"], (p) => ({ ...p, state: "flying" }));
    case "commit":
      return s.filter(
        (p) => !(p.state === "landed" && p.landedSeq !== null && p.landedSeq < e.readStartSeq),
      );
  }
}

export type PendingCounts = { flying: number; unseen: number; unconfirmed: number; lost: number };

/** How many attempts are in each state. `unseen` = landed but not yet in a committed read. */
export function pendingCounts(s: readonly PendingAdd[]): PendingCounts {
  const c: PendingCounts = { flying: 0, unseen: 0, unconfirmed: 0, lost: 0 };
  for (const p of s) {
    if (p.state === "flying") c.flying += 1;
    else if (p.state === "landed") c.unseen += 1;
    else if (p.state === "unconfirmed") c.unconfirmed += 1;
    else c.lost += 1;
  }
  return c;
}

/** Units per dish across every pending attempt — the tile's dim `+N`. */
export function pendingUnitsByItem(s: readonly PendingAdd[]): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const p of s) m.set(p.itemId, (m.get(p.itemId) ?? 0) + p.qty);
  return m;
}

/** The first add whose fate is UNKNOWN (unconfirmed or lost) — what Send and Settle wait on. */
export function pendingBlocker(s: readonly PendingAdd[]): PendingAdd | null {
  return s.find((p) => p.state === "unconfirmed" || p.state === "lost") ?? null;
}

/**
 * The ticket's own writes (a qty change, a removal, a note) follow the landed ghost's rule: once a
 * line write ANSWERS, the amounts stay withheld until a read that STARTED after the answer commits.
 * `unreadSeq` is the last read started when the write answered (null: nothing unread). A read already
 * in the air carries the old figures, so only a strictly later start clears it.
 */
export function unreadAfterCommit(unreadSeq: number | null, readStartSeq: number): number | null {
  return unreadSeq !== null && unreadSeq < readStartSeq ? null : unreadSeq;
}
