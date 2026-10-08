/**
 * PD3 — the pending "I’m here" that survives the page closing (m3 §E, §F, §G; PATH_DESIGN
 * correction 16).
 *
 * A tap inside its 6-second take-back must still reach Dad when the guest closes the tab or walks
 * away mid-window: the page beacons the arrival on `pagehide` and keeps ONE record per order in
 * `localStorage` (not `sessionStorage`, which a closed tab loses — the very case this exists for),
 * reconciled on the next visit to the same idempotent route. The record is the repair for a beacon
 * the browser dropped, so it must exist exactly when an arrival was COMMITTED and nobody has heard
 * the server's answer yet. Every rule below is about that "exactly":
 *
 *  - **Written at the commit, never at the tap (§G1).** Stored from the tap it outlived a tab killed
 *    inside the window, a refused write and a second tab — and each rang Dad's bell for a guest who
 *    was not there. So the record is written when the window ends, or when the page hides inside it.
 *  - **Cleared only by an ANSWER (§F1, §G2):** the route's success, its "no longer takes an arrival"
 *    (collected, not today) and its plain refusal all clear it. A send that got NO answer — a
 *    beacon, a reconcile that threw or was cut off — keeps it, so the next visit retries.
 *  - **Never written while taking the tap back:** nothing was written yet, so there is nothing to delete.
 *
 * Pure over a `Pick<Storage>`, behind try/catch like every storage read in the app: a throwing store
 * reads as "no record" and writes nothing, and the page renders exactly as before.
 */

export const PENDING_ARRIVAL_PREFIX = "mms.arrival-pending:";

export function pendingArrivalKey(orderId: string): string {
  return `${PENDING_ARRIVAL_PREFIX}${orderId}`;
}

export type PendingArrival = { orderId: string; committedAt: string };

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** `window.localStorage`, or null where it does not exist (SSR) or its getter throws (a sandboxed
 *  frame, blocked site data). Reading the property itself can throw, so it is guarded too. */
export function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The order's committed-but-unanswered arrival, or null. A malformed or foreign entry reads as null. */
export function readPendingArrival(store: Store | null, orderId: string): PendingArrival | null {
  if (!store) return null;
  try {
    const raw = store.getItem(pendingArrivalKey(orderId));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (
      typeof v === "object" &&
      v !== null &&
      (v as PendingArrival).orderId === orderId &&
      typeof (v as PendingArrival).committedAt === "string"
    )
      return { orderId, committedAt: (v as PendingArrival).committedAt };
    return null;
  } catch {
    return null;
  }
}

/** Record a COMMITTED arrival (the window ended, or the page hid inside it). Idempotent per order:
 *  a second commit for the same order overwrites, never duplicates. A storage failure is swallowed —
 *  the in-page send still goes out; only the repair for a dropped beacon is lost. */
export function writePendingArrival(store: Store | null, orderId: string, nowMs: number): void {
  if (!store) return;
  try {
    const rec: PendingArrival = { orderId, committedAt: new Date(nowMs).toISOString() };
    store.setItem(pendingArrivalKey(orderId), JSON.stringify(rec));
  } catch {
    /* deliberate: private mode / a full quota must never break the arrival itself */
  }
}

export function clearPendingArrival(store: Store | null, orderId: string): void {
  if (!store) return;
  try {
    store.removeItem(pendingArrivalKey(orderId));
  } catch {
    /* deliberate: a store that cannot forget is retried on the next visit, idempotently */
  }
}

/** What the route (or the Server Action) said about a committed arrival. `answered: false` is a
 *  send with no answer at all — the request threw, was cut off, or was a beacon. */
export type ArrivalOutcome = { answered: true; ok: boolean } | { answered: false };

/**
 * Does this outcome CLEAR the pending record (§F1, §G2)? Every answer does — success, "no longer
 * takes an arrival", a plain refusal: the card is back at the question and the guest's next tap is
 * the only arrival. Only a send with no answer keeps it, for the next visit's retry.
 */
export function pendingArrivalCleared(outcome: ArrivalOutcome): boolean {
  return outcome.answered;
}

/**
 * Is a reconcile due at mount? Only when a record exists AND the server does not already show the
 * stamp — a stamped order has been heard, so its record is stale and is cleared, not re-sent.
 */
export function reconcileDue(rec: PendingArrival | null, arrivedAt: string | null): boolean {
  return rec !== null && arrivedAt === null;
}
