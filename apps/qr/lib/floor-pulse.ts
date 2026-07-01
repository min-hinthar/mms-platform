// R9a floor "live-notice" pulse gate. A pure module (no server/client marker) so FloorBoard can use it and
// a unit test can pin the honesty invariant.

export type PulseMeta = {
  status: string;
  /** lastActivityAt as epoch ms — advances on a REAL cart/order event, NOT on a passive TTL re-derivation. */
  activityMs: number;
};

// `paying` (fresh cart lock ≤5min) and `settling` (fresh split freeze ≤10min) are TTL-derived: they can
// self-revert to `ordering`/`seated` purely because their time window elapsed, with NO real table event.
const TTL_REVERT_FROM = new Set(["paying", "settling"]);
const TTL_REVERT_TO = new Set(["ordering", "seated"]);

/**
 * Should a table's status change light the "this table just moved" ring?
 *
 * Excludes the PASSIVE TTL self-revert (a `paying`/`settling` cart whose window elapsed re-derives to
 * `ordering`/`seated` while `lastActivityAt` is unchanged) so the pulse never fabricates liveness on a mere
 * clock crossing. BUT a REAL event that lands on the same status pair — a staff void / line edit that drops
 * a locked cart, which advances `lastActivityAt` — DOES pulse. Every forward transition
 * (seated→ordering→paying→paid) always pulses. (`lastActivityAt` is driven by cart-line mutations + paid
 * orders, never by `locked_at`/`settle_at`, so the activity delta is the real-vs-passive discriminator.)
 */
export function isRealTransition(prev: PulseMeta, now: PulseMeta): boolean {
  if (prev.status === now.status) return false;
  if (
    TTL_REVERT_FROM.has(prev.status) &&
    TTL_REVERT_TO.has(now.status) &&
    now.activityMs <= prev.activityMs
  ) {
    return false; // passive TTL expiry — no new activity, so not a real event
  }
  return true;
}
