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

/**
 * How long a committed, unanswered arrival may still be sent (blind pass on #330, critical). The
 * record exists to survive the page closing INSIDE the commit — a guest standing at the counter who
 * pockets the phone — so its claim ("I'm at the restaurant now") is only true for a few minutes. An
 * older record is retired without a send: replayed hours later it rang Dad's bell and stamped "Here
 * now" at THAT visit's time, for a guest the card had told the counter did not know. Ten minutes
 * covers a tab closed and reopened at the counter; a guest still there after that taps again.
 */
export const PENDING_ARRIVAL_MAX_AGE_MS = 10 * 60_000;

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
 * What an in-page `announceArrival` result MEANS for the record (Codex r1 on #330, P1). The action
 * RESOLVES for every outcome, so "it resolved" is not "it was answered": `failed` (the UPDATE, or a
 * proof it depends on, could not be read) and `rate` (the flood guard) are the route's 5xx / 429 —
 * no durable answer, so the record stays for the next visit. Every other refusal is decided.
 */
export function actionOutcome(r: { ok: true } | { ok: false; reason: string }): ArrivalOutcome {
  if (r.ok) return { answered: true, ok: true };
  return r.reason === "failed" || r.reason === "rate"
    ? { answered: false }
    : { answered: true, ok: false };
}

/**
 * Does this outcome CLEAR the pending record (§F1, §G2)? Every answer does — success, "no longer
 * takes an arrival", a plain refusal: the card is back at the question and the guest's next tap is
 * the only arrival. Only a send with no answer keeps it, for the next visit's retry.
 */
export function pendingArrivalCleared(outcome: ArrivalOutcome): boolean {
  return outcome.answered;
}

/**
 * Is a reconcile due at mount? Only when a record exists, the server does not already show the stamp
 * (a stamped order has been heard), AND the record is inside the replay window
 * (`PENDING_ARRIVAL_MAX_AGE_MS`). A record from the future (the device clock moved back) or with an
 * unreadable stamp is not due either. A record that is not due is retired without a send.
 */
export function reconcileDue(
  rec: PendingArrival | null,
  arrivedAt: string | null,
  nowMs: number,
): boolean {
  if (rec === null || arrivedAt !== null) return false;
  const age = nowMs - Date.parse(rec.committedAt);
  return Number.isFinite(age) && age >= 0 && age <= PENDING_ARRIVAL_MAX_AGE_MS;
}

/**
 * What a reconcile POST's response MEANS for the record (blind pass on #330, open question). Only the
 * route's own answers are answers: a 200 carrying a boolean `ok` (success, or a decided refusal), or
 * a 400 (a malformed body — it will never succeed). Everything else — a 429 or a 5xx from the route,
 * and any status the PLATFORM answered instead (a deployment-protection 401, a 408, a 413), or a 200
 * whose body cannot be read — is no answer, and the record stays for the next visit inside its window.
 */
export function routeOutcome(status: number, body: unknown): ArrivalOutcome {
  if (status === 400) return { answered: true, ok: false };
  if (status === 200 && typeof body === "object" && body !== null) {
    const ok = (body as { ok?: unknown }).ok;
    if (typeof ok === "boolean") return { answered: true, ok };
  }
  return { answered: false };
}
