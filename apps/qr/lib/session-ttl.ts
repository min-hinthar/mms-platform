/**
 * Table-session lifetime (dine-in group cart + solo modes). Mirrors the DB default
 * `table_sessions.expires_at default now() + interval '4 hours'` — keep the two in sync.
 *
 * The bug this guards: the mint route finds a session by `status='active'` only, while `assertCartMember`
 * and the `is_member` RLS fn reject on `expires_at <= now()`. So a still-'active' but expired session
 * gets handed back as "live", then every cart write 403s on it — stranding the diner behind a "try
 * again" that can never succeed. The fix slides `expires_at` forward on any authorized touch
 * (assertCartMember) and on rejoin (api/session), so a table that's actually in use never hits the
 * hard TTL; a truly-expired (idle) session is swept + re-minted instead.
 */
export const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

/** ISO timestamp for a freshly-renewed expiry (now + the full TTL). */
export const sessionExpiryFromNow = (): string =>
  new Date(Date.now() + SESSION_TTL_MS).toISOString();

/** Renew only once LESS than half the window remains, so a read-heavy path (realtime → getCartView)
 *  doesn't UPDATE on every authorized call — the session still slides forward long before it expires. */
export const SESSION_RENEW_THRESHOLD_MS = SESSION_TTL_MS / 2;
