/**
 * Phase 2h (P2cz · P2fc) — THE bounded await for a staff Server Action, and the per-tab ledger of
 * actions that have not answered. Client-safe on purpose: no "use server", no React, no `next/*`, so
 * a component, a hook and a plain lib module (`staff-outage.ts`'s `raceTimeout`, `poll-gate.ts`) all
 * read ONE clock and ONE ledger.
 *
 * WHY A SECOND PRIMITIVE BESIDE `raceTimeout`. Three facts, measured in Chromium against Next 16.2.9
 * (LEARNINGS #200; the probe is in the Phase 2g CHANGELOG entry):
 *  1. Next runs Server Actions ONE AT A TIME per tab. A queued action is not even SENT until the one
 *     ahead of it settles, and the action fetch takes no signal and has no timeout.
 *  2. A `raceTimeout` frees the CALLER at the bound — never the action. The raw promise stays in the
 *     queue and every later action waits behind it (#157), and a transition wrapping it keeps its
 *     `pending` until the RAW answers (#149 · #200), so `busy={pending}` is a modal trap.
 *  3. `location.reload()` is the only universal escape (a document unload aborts the queue).
 * So a write needs THREE outcomes, not two: it answered, it threw, or it is STILL OUT — and "still
 * out" is not a failure. The server may yet act on it, so its late answer must be applied, never
 * dropped (`waiting.late`), and the copy must say "no answer yet — it may still be recorded", never
 * "wasn't saved" (decision 9e).
 *
 * WHY A LEDGER. Fact 1 makes "one action has been out ≥ STAFF_HANG_MS" a statement about the WHOLE
 * TAB: every new action would only queue behind it. So a new MONEY write is refused at the tap while
 * `stalledSince() !== null` (decision 9d) — dispatching it would put a payment into a queue that
 * may release it minutes later, after the cashier has taken the money another way. The ledger is
 * module state because Next's queue is per tab, and so is this module's instance.
 */

/** THE staff hang bound — raceTimeout's default, the pad's unconfirmed-add bound, the stall ledger.
 *  A hang detector, not a latency budget: restaurant wifi under load can take many seconds for an
 *  honest round-trip, and at 8s a slow-but-healthy poll was being called a failure (W10b review). */
export const STAFF_HANG_MS = 15_000;

/** How a raw action finally ended: it answered (whatever it said), or it threw. */
export type Late<T> = { kind: "answer"; value: T } | { kind: "threw"; error: unknown };
/** A bounded await's outcome — or `waiting`, with the late answer still to come through `late`. */
export type Bounded<T> = Late<T> | { kind: "waiting"; late: Promise<Late<T>> };

/**
 * The raw promise as a never-rejecting outcome. A thrown action becomes `threw`, never a rejection:
 * a caller awaiting `late` after its surface unmounted must not raise an unhandled rejection, and a
 * thrown write is not "nothing happened" — the response can be lost AFTER the server committed — so
 * it is a value the caller must read and say ("couldn't confirm"), not an exception it may forget.
 */
export function settleLate<T>(raw: Promise<T>): Promise<Late<T>> {
  return raw.then(
    (value): Late<T> => ({ kind: "answer", value }),
    (error: unknown): Late<T> => ({ kind: "threw", error }),
  );
}

/**
 * Await a Server Action with a bound. Never rejects; never drops the late answer: a raw promise
 * still out at `ms` resolves `waiting` with `late` (which settles when the raw does). Tracks `raw`
 * in the stall ledger until it settles.
 *
 * ⚠️ `waiting` is decided at EXACTLY `ms` (a `setTimeout(ms)`), the same instant `stalledSince`
 * calls the tab stalled — so the sheet that says "no answer yet" and the next tap that is refused
 * for it agree about one moment instead of disagreeing for a millisecond.
 *
 * ⚠️ An `answer` does NOT prove the queue is free: the action's revalidation navigate can still be
 * running after the caller has its value (server-action-reducer.js:237 → 293/301; the P2fc critic,
 * adjustment 9). That is why the ledger tracks the RAW promise, and why a caller never reads
 * "answered" as "the tablet is clear" — it reads `stalledSince`.
 *
 * ⚠️ Hand it the RAW action promise, never a raced one: `boundWrite(raceTimeout(x))` loses to the
 * race's own timer — at 15s the race REJECTS, so the caller reads `threw` ("couldn't confirm") where
 * the truth is `waiting`, and the late answer is dropped with the race (9e).
 */
export function boundWrite<T>(raw: Promise<T>, ms: number = STAFF_HANG_MS): Promise<Bounded<T>> {
  track(raw);
  const late = settleLate(raw);
  return new Promise<Bounded<T>>((resolve) => {
    const bound = setTimeout(() => resolve({ kind: "waiting", late }), ms);
    // `late` never rejects (settleLate), so this chain cannot float a rejection. Whichever of the
    // two calls `resolve` first wins; the other is a no-op by the Promise contract.
    void late.then((out) => {
      clearTimeout(bound);
      resolve(out);
    });
  });
}

/**
 * The ledger: raw promise → when it was dispatched, on THIS DEVICE'S clock (`Date.now()`). Keyed by
 * the PROMISE so the same raw tracked twice — `poll-gate`'s `watch` and then `raceTimeout` around the
 * same read — is ONE outstanding action at its FIRST registration's start: never two entries that
 * double `outstanding()`, and never a second registration that restarts the clock on a hang already
 * out.
 *
 * ⚠️ ONE CLOCK, AND NOBODY CAN HAND IT ANOTHER. Neither `track` nor `stalledSince` takes a time: the
 * ledger is read by every money tap on the tab and written by every board, and the boards run their
 * own clocks in SERVER space (`KdsBoard`/`ExpoBoard`'s `stampNow()`, offset-corrected). A start
 * written in one space and read in the other is wrong by the device's skew — 20s ahead, and every
 * cash, reader, refund, loss and no-show tap is refused as "stuck" the instant a lane read leaves,
 * which a reload does not fix; 20s behind, and a real hang hides for 20s (the Phase 2h contract
 * critic, F2). A stall is a DURATION on this tablet, so it is measured on this tablet's clock only.
 */
const ledger = new Map<Promise<unknown>, { startedAt: number }>();

/**
 * Register a raw Server Action promise in the per-tab ledger until it settles; returns `raw`. The
 * start is `Date.now()` at the FIRST registration (see the ledger's ⚠️).
 *
 * Every entry leaves on settle, RESOLVED OR REJECTED: an entry that outlived a rejection would read
 * as a hang forever, and the tab would refuse every money write until a reload for an action that
 * had in fact ended. Attaching the two handlers also marks `raw`'s rejection as handled — the caller
 * that dispatched it still owns reading it (every tracked caller here does: `raceTimeout` rethrows
 * it, `boundWrite` turns it into `threw`, the pad's add chain and send read it in their own catch).
 */
export function track<T>(raw: Promise<T>): Promise<T> {
  if (ledger.has(raw)) return raw;
  const entry = { startedAt: Date.now() };
  ledger.set(raw, entry);
  const leave = () => {
    // Only THIS registration leaves: after `resetLedgerForTests`, a re-tracked copy of the same
    // promise belongs to the new ledger and must not be dropped by the old settle.
    if (ledger.get(raw) === entry) ledger.delete(raw);
  };
  raw.then(leave, leave);
  return raw;
}

/**
 * The start time of the OLDEST tracked action still unanswered, if it has been out ≥ STAFF_HANG_MS
 * now (`Date.now()`); else null. "Stalled" means Next's queue is blocked behind it (fact 1), so a new
 * write would only queue behind it. Read it AT THE TAP — never from render state (a `nowMs` that
 * re-renders every 15s would let a stalled tablet dispatch for up to 15s more).
 *
 * The OLDEST, not the newest: a fresh poll queued behind a hung write is young, and reading it would
 * call the tab healthy while the write at the head of the queue holds everything (the critic's
 * adjustment 9 — never mark "not stalled" on a younger answer while an older raw is still out).
 */
export function stalledSince(): number | null {
  let oldest: number | null = null;
  for (const { startedAt } of ledger.values()) {
    if (oldest === null || startedAt < oldest) oldest = startedAt;
  }
  if (oldest === null) return null;
  return Date.now() - oldest >= STAFF_HANG_MS ? oldest : null;
}

/** Test seam: how many tracked actions are outstanding. */
export function outstanding(): number {
  return ledger.size;
}

/** Test seam: forget every entry (the ledger is module state, shared by every case in a file). */
export function resetLedgerForTests(): void {
  ledger.clear();
}
