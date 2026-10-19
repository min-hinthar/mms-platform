import { STAFF_HANG_MS } from "./bounded-write";

/**
 * #362 (blind pass 3 · Codex round 1, Checkout.tsx:2323) — the lines and dishes THIS phone has a
 * write on, so the order-change diff (`lib/order-changes.ts`) never reads a diner's own tap back to
 * them as someone else's news ("Mohinga on your order is now 2." right after their "+").
 *
 * ## Why a clock could not end it
 *
 * The first version released a hold 2 s after the write SETTLED. The view that shows the edit is not
 * the write's answer: /cart re-reads after it, and a write whose re-read failed lands on screen
 * through the next realtime echo or foreground read — any of which can come later than any fixed
 * delay. Past the delay, that view was diffed with the key free, and the diner's own change was
 * announced to them.
 *
 * ## What ends it: a view whose READ STARTED after the write settled
 *
 * A settled write has committed, so any read ISSUED after the settle sees it. Its view, once diffed
 * WITH the key still held, makes the screen's baseline include the write — every later diff compares
 * post-write rows, so a genuine change by someone else is announced again. A view from a read issued
 * BEFORE the settle may predate the write, and a mutation's returned view carries no read ticket,
 * so neither ends a hold in general. The sequence is the caller's read ticket (`lib/view-seq.ts`'s
 * `issued`).
 *
 * ## …or the write's OWN view (#362 blind pass 9)
 *
 * /menu applies the write's returned view and issues no read after it, so a hold only a ticketed
 * read could end stayed up until the NEXT read — the one carrying the next outside change, which was
 * then diffed with the key held and never said. A write's own view was read server-side after THAT
 * write committed, so once it has been diffed with the key held the baseline includes the write:
 * `releaseOwnHold` ends exactly that hold. Another write's view proves nothing about this one, and
 * other holds on the key stay up.
 *
 * ## The one bound
 *
 * A write that never answers would otherwise hold its line silent forever. Past
 * `OWN_HOLD_MAX_OPEN_MS` (the write bound every stalled action already obeys, `STAFF_HANG_MS`) an
 * open hold counts as settled at the moment a view notices — so it still ends only at the NEXT read
 * issued after that, never on the clock alone.
 */
export const OWN_HOLD_MAX_OPEN_MS = STAFF_HANG_MS;

export type OwnHold = { key: string; openedAt: number; settledAt: number | null };
export type OwnHolds = { holds: OwnHold[] };

export function newOwnHolds(): OwnHolds {
  return { holds: [] };
}

/** A write on `key` is about to start. Returns its hold, to settle when the write answers. */
export function openHold(h: OwnHolds, key: string, nowMs: number): OwnHold {
  const hold: OwnHold = { key, openedAt: nowMs, settledAt: null };
  h.holds.push(hold);
  return hold;
}

/** The write answered, with `readsIssued` reads issued so far: only a LATER one can release it. */
export function settleHold(hold: OwnHold, readsIssued: number): void {
  if (hold.settledAt === null) hold.settledAt = readsIssued;
}

/** Every key a hold still covers — what the diff must not announce. */
export function heldKeys(h: OwnHolds): Set<string> {
  return new Set(h.holds.map((x) => x.key));
}

/**
 * A view has just been DIFFED (with every held key excluded) and applied. `viewSeq` is the read
 * ticket it came from (`undefined` for a mutation's own view); `readsIssued` the caller's count of
 * reads issued so far. Releases each settled hold that this view's read started after.
 */
export function releaseHolds(
  h: OwnHolds,
  viewSeq: number | undefined,
  readsIssued: number,
  nowMs: number,
): void {
  for (const x of h.holds)
    if (x.settledAt === null && nowMs - x.openedAt > OWN_HOLD_MAX_OPEN_MS)
      x.settledAt = readsIssued;
  if (viewSeq === undefined) return;
  h.holds = h.holds.filter((x) => x.settledAt === null || viewSeq <= x.settledAt);
}

/**
 * The write behind `hold` returned its OWN view and that view has just been DIFFED (with the key
 * held) and applied: it was read after this write committed, so this hold — and only it — ends.
 */
export function releaseOwnHold(h: OwnHolds, hold: OwnHold): void {
  h.holds = h.holds.filter((x) => x !== hold);
}
