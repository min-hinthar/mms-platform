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

/**
 * Per-caller manager-PIN step-up attempt limit (W1·Q7). The lockout in mms_staff_verify_pin protects
 * the TARGET (5 wrong tries → 15-min lock per staff id) — but that very lockout is a DoS lever: any
 * staff account could serially wrong-PIN every manager/owner and keep voids/refunds/approvals locked
 * floor-wide. This bounds the ATTACKER instead: every step-up attempt a caller makes, keyed by the
 * CALLER's staff id. 6 per 10 min is far above legit use (one PIN entry per void/approval, plus a
 * typo retry) and far below sustained lockout-griefing. Fail-open like every mms_rate_limit consumer.
 */
export const STEPUP_RATE = { max: 6, windowSeconds: 600 } as const;

/**
 * Staff-PIN policy (S1.1b). A PIN is a low-entropy shared-tablet fast-path, so the brute-force defense
 * is the lockout, enforced atomically in the SQL `mms_staff_verify_pin` (lib/staff-pin.ts is the app
 * mirror). KEEP THESE IN SYNC with the `v_max` (5) / `v_lockout` (15 min) constants in
 * supabase/migrations/20260621130000_staff_pin.sql — they're the authoritative backstop.
 */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MINUTES = 15;
