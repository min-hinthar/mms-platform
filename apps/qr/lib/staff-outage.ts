/**
 * W10b — the staff outage vocabulary. Plain module (no "server-only"): the boards are clients, and
 * lib/authz.ts (the server twin of `isRetryableAuthShape`) can't be imported here.
 *
 * The stance: a staff board is a LEDGER, not a website. Mid-service its most valuable asset is the
 * last-known state — so an outage must never blank it, redirect it, or fake liveness over it. These
 * helpers give every board ONE voice for the frozen state: name the freeze moment (the snapshot's
 * own server clock — the ledger's "as of"), keep retrying quietly, and past the escalation window
 * stop pretending it's momentary — tell the floor to run on paper and promise the state is safe.
 */

/** How long a board stays in the soft "reconnecting" voice before escalating to the paper-flow
 *  instruction. Two minutes ≈ two orders at the counter: past that, waiting is the wrong advice. */
export const STAFF_OUTAGE_ESCALATE_MS = 120_000;

/**
 * The ONE line of write-failure copy for staff mutations during an outage — defined here (plain
 * module) so the server gate (lib/staff.ts staffGate, which re-exports it) and the client reason-
 * switches (LossActionSheet, RefundActionSheet, PinUnlock) render the SAME sentence. Operational
 * truth for a floor mid-service: name what happened (not saved), name the fallback (paper). Never
 * "sign in again" — the person IS signed in; the platform is unreachable.
 */
export const STAFF_WRITE_OUTAGE =
  "We can’t reach the ordering system — that change wasn’t saved. Keep it on paper for now.";

/**
 * The frozen-board banner, in the shared voice. `frozenAtIso` is the LAST GOOD snapshot's serverNow
 * (never a client clock — the board's "as of" must be the ledger's own stamp); `what` names the
 * surface's object in its own vocabulary ("the queue", "the bags", "the room", "this order").
 */
export function frozenBoardCopy(frozenAtIso: string, nowMs: number, what: string): string {
  const t = new Date(frozenAtIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return nowMs - Date.parse(frozenAtIso) >= STAFF_OUTAGE_ESCALATE_MS
    ? `Still can’t reach the ordering system — ${what} is frozen at ${t}. Take new orders on paper; nothing here is lost.`
    : `We can’t reach the ordering system — showing ${what} as of ${t}. Reconnecting…`;
}

/**
 * Poll watchdog: the boards guard concurrent polls with an `inFlight` ref, so ONE hung Server
 * Action fetch (a socket that neither resolves nor rejects — proxies mid-outage do this) would
 * otherwise freeze the lock and silently stop all polling with the board still wearing its live
 * face. Racing a timeout turns the hang into a rejection → the ordinary catch/fails path → the
 * honest frozen banner, and the lock releases so the next poll keeps probing for recovery.
 */
export function raceTimeout<T>(p: Promise<T>, ms = 8_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("staff-poll-timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Was this client-side Supabase auth failure a TRANSPORT failure (platform unreachable) rather than
 * a verdict about the person? The client twin of lib/authz.ts `isTransportFailure` (server-only —
 * keep the two in lockstep). Login/PIN surfaces use it to say "we're having trouble" instead of
 * implying the person's email or code was wrong.
 */
export function isRetryableAuthShape(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: string }).name ?? "";
  const msg = (e as { message?: string }).message ?? "";
  const status = (e as { status?: number }).status;
  if (name === "AuthRetryableFetchError") return true;
  if (typeof status === "number" && (status === 0 || status >= 500)) return true;
  return /fetch failed|Failed to fetch|network|socket|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timed? ?out|aborted/i.test(
    msg,
  );
}
