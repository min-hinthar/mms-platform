/**
 * M124 — the checkout ATTEMPT token, and the one place its shape is decided.
 *
 * ## Why this module exists at all
 *
 * `mms_release_promo_grant_for_holder(p_cart_id, p_uid)` matches on the uid ALONE. The M70 migration
 * says why that was the best available answer at the time, in its own words:
 *
 *   > "These two callers are clients: they never saw a `locked_at` and cannot name their era without
 *   >  a read that would race the write it guards."
 *
 * That is true of a client that is never TOLD its era — and it is the whole defect. One diner, two
 * tabs: tab 1 mints an intent (era A, pin taken); tab 2 re-checks-out and `acquireCartLock` lets the
 * SAME uid re-acquire, stamping era B and inheriting the pin; tab 1's `pagehide` beacon then lands
 * late, passes `assertCartMember`, and `locked_by = p_uid` is STILL TRUE — so it clears **tab 2's**
 * live pin. If that lands after tab 2's PaymentIntent captured but before its webhook fulfils,
 * `getCartTotals` re-derives without the pin and reconciliation disagrees with the captured amount:
 * a charged card with no order.
 *
 * The fix is not to widen the predicate (`status = 'open'` does not help — the cart IS open in
 * exactly that window). It is to give the client something it CAN name: `create-intent` already
 * computes the era and simply never returns it. So it returns it now, the client echoes it on both
 * abandon exits, and those exits move to a predicate that names the attempt.
 *
 * ## Why the rule lives HERE and not in the route
 *
 * `app/api/**` sits outside `check-money-coverage`'s MONEY_PATHS and outside `verify:slice`'s mutant
 * set, so a money rule written in a route cannot be guarded at all (the W17 lesson, CLAUDE.md).
 * `Checkout.tsx` is worse — no test runner reaches it. Everything decidable without a database lives
 * in this file so a mutation to it turns a suite red.
 */

/**
 * Re-emit a client-echoed era as the exact string `acquireCartLock` writes, or null.
 *
 * ⚠️ THE OUTPUT IS SERVER-CONSTRUCTED, AND THAT IS THE POINT — not defence-in-depth theatre.
 * `lock.ts`'s own rule is that every value interpolated into a PostgREST filter must be
 * server-derived. This token arrives from a client (a `sendBeacon` body, a Server Action argument),
 * so it cannot be passed through to `.eq()` as received. Parsing it to a `Date` and re-emitting
 * `.toISOString()` means the string that reaches the filter was built by us from a parsed instant;
 * the client chose only WHICH instant, and naming an instant it does not hold matches zero rows.
 *
 * It also fixes a real round-trip hazard that a bare zod `.datetime({ offset: true })` would let
 * through. `acquireCartLock` writes `new Date().toISOString()` — always the millisecond `...000Z`
 * spelling (`lock.ts`). An offset spelling of the SAME instant (`2026-09-01T10:00:00.000+00:00`)
 * is a valid ISO datetime and a valid `timestamptz`, but it is a different STRING, and PostgREST
 * `.eq()` on a timestamptz column compares the parsed value — so relying on the client's spelling
 * makes the match depend on how the client happened to serialize. Normalizing removes the question.
 *
 * Fails CLOSED: anything unparseable returns null, and every caller treats null as "cannot name an
 * attempt", which releases NOTHING. A stale or forged token is therefore inert, never destructive.
 */
export function normalizeEra(raw: unknown): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  const ms = new Date(raw).getTime();
  // `new Date("nonsense")` is an Invalid Date whose getTime() is NaN — `Number.isFinite` rejects it,
  // and rejects ±Infinity too. A bare `isNaN` check would pass Infinity through to an RangeError on
  // `.toISOString()`, which would throw inside a page-unload beacon that must never throw.
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * The attempt a checkout is currently holding, as the client stores it.
 *
 * `clientSecret` and `attempt` are ONE value, deliberately, and the pairing is the invariant: the
 * token must name the era the secret was minted under. Held as two `useState`s they can drift — a
 * second create-intent resolving out of order updates one and not the other, and the echo then
 * names an era that is not the one whose pin the mounted Element depends on. A single object makes
 * that drift unrepresentable rather than merely unlikely.
 */
export type PayAttempt = { clientSecret: string; attempt: string | null };

/**
 * Read a `PayAttempt` out of a create-intent 200 body.
 *
 * `attempt` is optional in the READ but required in the response: a client bundle can outlive a
 * deploy, and a mid-deploy 200 from the previous build has no `attempt` field. That case degrades to
 * today's behaviour — the release names no attempt, so it clears no pin, and the lock TTL is the
 * backstop — which is strictly safer than guessing an era. It is NOT an excuse for the server to
 * stop sending one: `check-pay-attempt.mjs` asserts the response carries it, because losing that one
 * line is otherwise SILENT (both abandon exits would simply no-op forever and every table would keep
 * its lock for the full five minutes with nothing in the logs to say why).
 */
export function readPayAttempt(body: unknown): PayAttempt | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.clientSecret !== "string" || b.clientSecret === "") return null;
  return { clientSecret: b.clientSecret, attempt: normalizeEra(b.attempt) };
}

/**
 * The body both abandon exits send: the cart, plus the attempt being abandoned when we know it.
 *
 * `attempt` is OMITTED rather than sent as null when unknown, so the wire shape stays the one the
 * zod schema accepts (`.optional()`, not `.nullable()`) and an old client's body is still valid.
 */
export function attemptReleaseBody(
  cartId: string,
  attempt: string | null,
): { cartId: string; attempt?: string } {
  return attempt ? { cartId, attempt } : { cartId };
}

/** The outcomes of releasing a pay attempt — each one a fact we can actually establish. */
export type PayLockRelease =
  | { released: true }
  | {
      released: false;
      // M151 — `paying`: this attempt's intent is captured or capturing; the release is refused so
      // the cart stays frozen under a charge the webhook is about to fulfil.
      reason: "rate_limited" | "error" | "unknown" | "not_held" | "superseded" | "paying";
    };

/** The cart lock state, as read back when a release matched nothing. */
export type LockRow = { locked: boolean; locked_at: string | null } | null;

/**
 * Why did an era-scoped release match ZERO rows?
 *
 * ⚠️ A ZERO-ROW MATCH IS NOT PROOF OF SUPERSESSION (Codex P2 on #244 round 2 — a defect this
 * module's previous version introduced, so it is worth spelling out). The predicate is
 * `locked_by = uid AND locked_at = era`; it fails whenever ANY of its terms stopped holding, and
 * supersession is only one of the ways that happens. The reachable counter-example is an ordinary
 * declined card: the webhook's `payment_intent.payment_failed` arm calls `releaseCartLock(cartId,
 * null)` — cart-wide, nulling `locked_at` — while `PaymentSection.confirm()` deliberately keeps the
 * same Element and client secret mounted. The diner then taps "Edit order", this matches nothing,
 * and inferring "another tab took over" tells them something false AND blocks them from editing a
 * cart that is now genuinely editable. That is the fabricated-diagnosis class (M116 · M119), and a
 * refusal on a money surface has to name a reason it actually established.
 *
 * So the reason is READ, not assumed — the same move `acquireCartLock` makes when its own UPDATE
 * matches nothing. Supersession requires a lock that is still FRESH and stamped with a DIFFERENT
 * era; anything else is `not_held` (a decline release, a TTL expiry, a staff action — all of which
 * mean "there is nothing of ours to release", which is not an error and must not block the diner).
 * An unreadable row is `unknown`: we do not get to guess on this surface.
 */
export function classifyZeroRow(
  ourEra: string | null,
  lock: LockRow,
  nowMs: number,
  ttlMs: number,
): "superseded" | "not_held" | "unknown" {
  // ⚠️ NO ERA, NO VERDICT (Codex P2 on #244 round 3 — the residue of round 2's own fix). A caller
  // that cannot name its attempt issued no write at all: `releasePayAttempt` short-circuits on a
  // null era by design, and `readPayAttempt` produces one whenever deployment skew hands a client
  // bundle a 200 from a build that predates the token. Falling through would compare every real
  // `locked_at` against null, find them unequal, and report the diner's OWN fresh lock as a
  // successor — the terminal "another tab took over" screen, on a cart nobody took over. The
  // documented contract for a missing era is fail-closed with the TTL as backstop, and `unknown`
  // is what that is: no claim, no block.
  if (!ourEra) return "unknown";
  if (!lock) return "unknown";
  if (!lock.locked || !lock.locked_at) return "not_held";
  const at = new Date(lock.locked_at).getTime();
  if (!Number.isFinite(at)) return "unknown";
  // A stale lock is not a live successor — `acquireCartLock`'s own TTL disjunct would let anyone
  // take it over, so nobody is mid-checkout behind it.
  if (nowMs - at >= ttlMs) return "not_held";
  // Fresh, and stamped by an era that is not ours: someone genuinely holds this checkout now.
  return normalizeEra(lock.locked_at) === ourEra ? "not_held" : "superseded";
}

/**
 * Classify a `releasePayAttempt` result — and keep the three facts APART.
 *
 * A bare `released: false` conflates a rate-limit short-circuit, a transport failure, and a
 * zero-row match — and the zero-row case is itself several different facts (see `classifyZeroRow`). The caller renders a sentence from it, and two of those three are OUR outage
 * rather than a fact about the diner's tab — so collapsing them makes the UI state "another tab
 * took over your checkout", which is a fabricated diagnosis on a money surface. That is the exact
 * class M116 and M119 spent four PRs removing from this codebase; it is not being reintroduced here.
 *
 * ⚠️ ERROR IS CHECKED FIRST. Being precise about what that does and does not buy: an ordinary
 * failed write yields `count: null` → `released: false`, and lands on the error arm under EITHER
 * ordering, so this is not what saves the common case. What it decides is the incoherent one — a
 * driver reporting both a match and an error — where testing `released` first would confirm a
 * release nobody can explain. An outcome we cannot account for must fail closed, and "we do not
 * know" is the honest answer rather than "your tab was superseded".
 *
 * Lives here, not in `cart.ts` or `Checkout.tsx`: this is decision logic, and the component has no
 * test runner while `app/api/**` sits outside `verify:slice`'s mutant set (the W17 lesson).
 */
export async function classifyRelease(
  res: { released: boolean; error: { message: string } | null },
  zeroRow: () => Promise<"superseded" | "not_held" | "unknown">,
): Promise<PayLockRelease> {
  if (res.error) return { released: false, reason: "error" };
  if (res.released) return { released: true };
  // Zero rows: ask what actually happened rather than naming the most dramatic possibility.
  return { released: false, reason: await zeroRow() };
}
