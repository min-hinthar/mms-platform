/**
 * Abuse-limit constants (M3·P3.4). Plain module (no `server-only`) so the UI can import MAX_PARTY_SIZE
 * for the friendly cap affordance while the server enforces the real caps. The rate windows feed
 * lib/rate.ts → the SQL mms_rate_limit gate.
 */

/**
 * Max diners on one table session. A physical sticker (or a shared invite code) is ONE table — bound
 * members so a code can't pile unbounded diners onto one cart (presence/realtime DoS + a vector to
 * inflate the shared order). KEEP IN SYNC with the `12` in the session_members party-cap trigger
 * (mms_enforce_party_size, migration 20260621000000) — it is the authoritative, atomic backstop.
 */
export const MAX_PARTY_SIZE = 12;

/**
 * Per-device (verified seat) join/mint limit on POST /api/session. Generous — a diner mints once, plus a
 * few recovery re-mints — but bounds a client flooding joins. New-seat churn is bounded a layer down by
 * GoTrue's anonymous sign-up rate limit (supabase/config.toml).
 */
export const JOIN_RATE = { max: 30, windowSeconds: 60 } as const;

/**
 * Per-device (verified seat) cart-mutation limit. ~2/sec sustained — far above human tapping, well below
 * a script flood. Keyed by SEAT (not session) on purpose: a per-session cap would let one hostile member
 * exhaust the budget and DoS their co-diners' shared cart; per-seat bounds the bad actor to themselves.
 */
export const MUTATE_RATE = { max: 120, windowSeconds: 60 } as const;
