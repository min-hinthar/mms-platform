/**
 * The two freeze lifetimes, in a module a CLIENT can import.
 *
 * ## Why they moved out of `lib/lock.ts`
 *
 * `lock.ts` opens with `import "server-only"`, and every one of its callers was server-side, so the
 * constants had never needed to be reachable from a component. T20 is the bug that changed that.
 *
 * Both freezes expire by **arithmetic, not by a write**. `assertCartMember` computes them:
 *
 *     const lockedFresh = cart.locked && cart.locked_at !== null &&
 *       new Date(cart.locked_at).getTime() > Date.now() - CART_LOCK_TTL_MS;
 *
 * No row changes when that flips, so Postgres-Changes emits nothing and no realtime subscription can
 * ever clear a client's cached `true`. On /menu the add controls are NATIVELY disabled off that
 * cache, which means they cannot emit the request whose returned view would correct it — the control
 * is inert, and being inert is what keeps it inert. `AddButton` and `ItemSheet` are both in that
 * state today; #248 removed two other gates of the same shape for the same reason (LEARNINGS #72).
 *
 * ⚠️ THE CLIENT CANNOT COMPUTE THE EXPIRY, AND MUST NOT TRY. `getCartView` returns `locked` and
 * `settling` but never `locked_at` or `settle_at`, so a component holding these constants still has
 * no instant to subtract them from. What it can do is bound its own ignorance: a freeze observed at
 * T was taken at or before T, so it cannot outlive T + its TTL. That is what
 * `freezeRecheckDelayMs` answers, and why the fix is a re-read scheduled from the OBSERVATION rather
 * than an expiry predicted from data the client does not have.
 */

// How long a lock holds before it's treated as abandoned and re-acquirable. A diner rarely spends
// >5 min on the Payment Element; a hard tab-close (no decline / no "Edit order") frees the cart for
// the rest of the table within this window. MUST match the staleness cutoff used by both the acquire
// UPDATE in `lib/lock.ts` and the effective-lock check in `lib/authz.ts`.
export const CART_LOCK_TTL_MS = 5 * 60 * 1000;

// Split-tender settlement freeze (M3·P3.3b). Longer than the single-pay lock: a whole table pays in
// turn (each person opens the Element, picks a tip, authorizes), so 10 min before an abandoned
// settlement auto-frees. Same staleness-cutoff discipline as the pay-lock (the acquire UPDATE in
// `lib/lock.ts` + the effective-settling check in `lib/authz.ts` both use this, on the app clock).
export const SETTLE_TTL_MS = 10 * 60 * 1000;

/** The two freeze axes a diner surface caches. Both decay by arithmetic; neither emits an event. */
export type FreezeAxes = { locked: boolean; settling: boolean };

/**
 * How long a client should wait before RE-READING a cart it believes is frozen — or null when it
 * believes the cart is editable and has nothing to wait for.
 *
 * ⚠️ THE ANSWER IS THE LONGEST HELD AXIS, NOT THE SHORTEST. A cart that is both locked and settling
 * stays frozen until BOTH have lapsed, so re-reading at the 5-minute mark would find it still
 * frozen, re-arm, and simply cost a round trip. Taking the max asks once, at the first moment the
 * answer can have changed.
 *
 * ⚠️ AND IT IS A CEILING ON OUR IGNORANCE, NOT A PREDICTION. The freeze may already have lapsed when
 * we observe it — we cannot tell, having no `locked_at`. What we can say is that a freeze seen now
 * was acquired at or before now, so it cannot survive past now + its TTL. Waiting that long is the
 * shortest delay that GUARANTEES the next read sees an answer that has changed, which is what makes
 * one scheduled re-read sufficient instead of a poll. (`recheckLock` on the checkout deliberately
 * offers a manual re-read rather than a timer; /menu has no such control on any of its surfaces,
 * which is why this one is scheduled.)
 *
 * Re-arming is the caller's job: every fresh observation restarts the clock, so a freeze that is
 * renewed by a real second checkout keeps being re-scheduled rather than being declared expired.
 */
export function freezeRecheckDelayMs({ locked, settling }: FreezeAxes): number | null {
  if (!locked && !settling) return null;
  return Math.max(locked ? CART_LOCK_TTL_MS : 0, settling ? SETTLE_TTL_MS : 0);
}
