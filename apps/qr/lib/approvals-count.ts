/**
 * PD8 (m8 decision 4) — what the bar's approvals circle may claim from a head-count read.
 *
 * `countPendingApprovals` used to answer `0` on any error — a deliberate degrade while the badge was
 * an ornament on a nav link (W10b). A4·5 made that circle the counter's ONE pending-approvals signal,
 * and a false all-clear on it is a manager walking away from a pending loss. So the verdict is a value:
 * a count only when one was read; `{ ok: false }` otherwise (the circle then draws a dashed ring with
 * no number and says "couldn't check"). Pure, so it is falsified here and mutated in verify:slice.
 */
export type PendingCount = { ok: true; count: number } | { ok: false };

export function pendingCountVerdict(read: { count: number | null; error: unknown }): PendingCount {
  if (read.error) return { ok: false };
  const n = read.count;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, count: n };
}

/**
 * The bar's circle (`ApprovalsCountProvider`'s state). `count` is null when nobody read one; `unknown`
 * — the server's own head count failed; `frozen` — the queue behind it stopped updating (a dashed
 * ring, a shape and not colour alone, with the board's as-of sentence).
 */
export type ApprovalsCircle = {
  count: number | null;
  frozen: boolean;
  unknown: boolean;
  frozenCopy: string | null;
};

/** The server render's seed: the head count's verdict. */
export function circleSeed(initial: PendingCount): ApprovalsCircle {
  return initial.ok
    ? { count: initial.count, frozen: false, unknown: false, frozenCopy: null }
    : { count: null, frozen: true, unknown: true, frozenCopy: null };
}

/** What the approvals board reports after each poll. `read` — this page has read the queue at least
 *  once (the server render's read, or a poll since); `count` is that queue's length. */
export type BoardReading = {
  read: boolean;
  count: number;
  frozen: boolean;
  frozenCopy: string | null;
};

/**
 * The board's reading folded into the circle. A queue this page has NEVER read claims no number (the
 * blind pass on #333: an initial outage published `count: 0`, a false all-clear on the one signal):
 * the server's seed stands — its count, or "couldn't check" — dashed while the board is frozen.
 */
export function circleFromBoard(prev: ApprovalsCircle, board: BoardReading): ApprovalsCircle {
  if (!board.read) {
    return {
      ...prev,
      frozen: prev.frozen || board.frozen,
      frozenCopy: board.frozenCopy ?? prev.frozenCopy,
    };
  }
  return { count: board.count, frozen: board.frozen, unknown: false, frozenCopy: board.frozenCopy };
}
