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
  return bounded(raw, ms, "write");
}

/**
 * Phase 2i (P2bi) — the same bounded await for a READ action: identical outcomes, but its raw is
 * tracked as a `read`, so it never counts as a young or stalled WRITE (`youngWrite` / `stalledWrite`),
 * never stamps the answer window (`msSinceWriteSettled`) and never notifies `subscribeWrites` — a
 * read in flight is not work a reload would lose. It still holds Next's queue, so `stalledSince`
 * still sees it (9d).
 */
export function boundRead<T>(raw: Promise<T>, ms: number = STAFF_HANG_MS): Promise<Bounded<T>> {
  return bounded(raw, ms, "read");
}

function bounded<T>(raw: Promise<T>, ms: number, kind: CallKind): Promise<Bounded<T>> {
  track(raw, kind);
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
 * The ledger: raw promise → when it was dispatched. Keyed by the PROMISE so the same raw tracked
 * twice — `poll-gate`'s `watch` and then `raceTimeout` around the same read — is ONE outstanding
 * action at its FIRST registration's start: never two entries that double `outstanding()`, and never
 * a second registration that restarts the clock on a hang already out.
 *
 * ⚠️ ONE CLOCK, AND NOBODY CAN HAND IT ANOTHER. Neither `track` nor `stalledSince` takes a time: the
 * ledger is read by every money tap on the tab and written by every board, and the boards run their
 * own clocks in SERVER space (`KdsBoard`/`ExpoBoard`'s `stampNow()`, offset-corrected). A start
 * written in one space and read in the other is wrong by the device's skew — 20s ahead, and every
 * cash, reader, refund, loss and no-show tap is refused as "stuck" the instant a lane read leaves,
 * which a reload does not fix; 20s behind, and a real hang hides for 20s (the Phase 2h contract
 * critic, F2). A stall is a DURATION on this tablet, so it is measured on this tablet's clock only.
 *
 * ⚠️ AND THAT CLOCK IS MONOTONIC (`monoNow`), never the wall clock (Codex round 2 on #310, B4). A
 * tablet's wall clock is CORRECTED — network time, a manual fix, a timezone sync — and a correction
 * backward while an action is hung made `Date.now() - start` small or negative: the tab read healthy
 * and the next payment was dispatched into the stuck queue behind it; a correction forward called a
 * read sent a second ago "stuck". Each entry keeps `monoAt` (the age is measured on it, and the
 * OLDEST is chosen by it) beside `startedAt` (the wall-clock instant, which is all `stalledSince`
 * still returns — every caller reads it only as null / not null).
 */
type Entry = { startedAt: number; monoAt: number; kind: CallKind };
const ledger = new Map<Promise<unknown>, Entry>();

/**
 * Phase 2i (P2bi) — what a tracked action IS, for the one question a reload asks: would reloading
 * now lose it? A `write` would (its answer, its line, maybe the write itself); a `read` would not
 * (the next document reads again). The ledger keeps reads because a hung read holds Next's queue
 * exactly as a hung write does (`stalledSince` stays kind-agnostic, 9d) — only the reload verdict
 * (`youngWrite` · `stalledWrite` · `msSinceWriteSettled`) reads the kind.
 */
export type CallKind = "read" | "write";

/**
 * THE ledger's clock (Codex round 2 on #310, B4): elapsed milliseconds on a MONOTONIC clock — it
 * only moves forward, at the rate the bound's own `setTimeout` runs, whatever the wall clock is set
 * to. Read at call time (never captured at import), so vitest's fake timers drive it: they fake
 * `performance.now` by default, `advanceTimersByTime` moves it, and `setSystemTime` — a wall-clock
 * correction — does not.
 */
export function monoNow(): number {
  return performance.now();
}

/**
 * Register a raw Server Action promise in the per-tab ledger until it settles; returns `raw`. The
 * start is `monoNow()` (and `Date.now()` beside it) at the FIRST registration (see the ledger's ⚠️).
 *
 * Every entry leaves on settle, RESOLVED OR REJECTED: an entry that outlived a rejection would read
 * as a hang forever, and the tab would refuse every money write until a reload for an action that
 * had in fact ended. Attaching the two handlers also marks `raw`'s rejection as handled — the caller
 * that dispatched it still owns reading it (every tracked caller here does: `raceTimeout` rethrows
 * it, `boundWrite` turns it into `threw`, the pad's add chain and send read it in their own catch).
 */
export function track<T>(raw: Promise<T>, kind: CallKind = "write"): Promise<T> {
  const known = ledger.get(raw);
  if (known !== undefined) {
    // Phase 2i — the FIRST registration's clock wins (unchanged), but a WRITE registration upgrades
    // a read entry, and a read never downgrades a write: unsure is counted as a write (fail-safe —
    // a reload refused for a read costs a few seconds; one allowed over a write loses it).
    if (kind === "write" && known.kind === "read") {
      known.kind = "write";
      notifyWrites();
    }
    return raw;
  }
  const entry: Entry = { startedAt: Date.now(), monoAt: monoNow(), kind };
  ledger.set(raw, entry);
  if (kind === "write") notifyWrites();
  const leave = (): boolean => {
    // Only THIS registration leaves: after `resetLedgerForTests`, a re-tracked copy of the same
    // promise belongs to the new ledger and must not be dropped by the old settle.
    if (ledger.get(raw) !== entry) return false;
    ledger.delete(raw);
    // Phase 2i — a WRITE that ended, RESOLVED OR REJECTED, opens the answer window: either way a
    // line on screen may have just changed to say so, and someone may be reading it.
    if (entry.kind === "write") {
      lastWriteSettled = monoNow();
      notifyWrites();
    }
    return true;
  };
  raw.then(
    () => {
      leave();
    },
    (error: unknown) => {
      // Phase 2i — the entry leaves FIRST, then the witnesses hear the reason, each try/caught: a
      // throwing listener must never strand an entry (the tab would read stalled forever).
      if (!leave()) return;
      for (const listener of [...rejectionListeners]) {
        try {
          listener(error);
        } catch {
          // Deliberate swallow: a witness is an observer; its failure is not this action's outcome,
          // and the caller that dispatched the raw still reads the rejection on its own path.
        }
      }
    },
  );
  return raw;
}

/** Phase 2i — `monoNow()` when the last WRITE entry left the ledger; null: none this document. */
let lastWriteSettled: number | null = null;
const writeListeners = new Set<() => void>();
const rejectionListeners = new Set<(error: unknown) => void>();

function notifyWrites(): void {
  for (const listener of [...writeListeners]) listener();
}

/** Phase 2i — a WRITE entry out for less than STAFF_HANG_MS (monotonic): the reload would lose it. */
export function youngWrite(): boolean {
  const now = monoNow();
  for (const entry of ledger.values()) {
    if (entry.kind === "write" && now - entry.monoAt < STAFF_HANG_MS) return true;
  }
  return false;
}

/**
 * Phase 2i — a WRITE entry out for STAFF_HANG_MS or more. The boundary agrees with `stalledSince`'s
 * `>=`, so a write is young or stalled, never both and never neither. `stalledSince` stays
 * kind-agnostic: 9d refuses money taps on a hung READ too.
 */
export function stalledWrite(): boolean {
  const now = monoNow();
  for (const entry of ledger.values()) {
    if (entry.kind === "write" && now - entry.monoAt >= STAFF_HANG_MS) return true;
  }
  return false;
}

/** Phase 2i — ms on `monoNow()` since the last WRITE entry left the ledger; null: none yet. */
export function msSinceWriteSettled(): number | null {
  return lastWriteSettled === null ? null : monoNow() - lastWriteSettled;
}

/** Phase 2i — notified when a WRITE entry enters, upgrades or leaves. Reads never notify, so a poll
 *  causes no re-render of whatever subscribes. Returns the unsubscribe. */
export function subscribeWrites(listener: () => void): () => void {
  writeListeners.add(listener);
  return () => {
    writeListeners.delete(listener);
  };
}

/**
 * Phase 2i — called with every tracked raw's REJECTION reason, after its entry has left the ledger.
 * The one place a retired action id (`UnrecognizedActionError`) can be witnessed for the whole tab,
 * since every staff action call goes through `track`. Returns the unsubscribe.
 */
export function onTrackedRejection(listener: (error: unknown) => void): () => void {
  rejectionListeners.add(listener);
  return () => {
    rejectionListeners.delete(listener);
  };
}

/** Test seam: clear the answer-window stamp and the rejection listeners (module state). */
export function resetWriteSignalsForTests(): void {
  lastWriteSettled = null;
  rejectionListeners.clear();
}

/**
 * The wall-clock start of the OLDEST tracked action still unanswered, if it has been out
 * ≥ STAFF_HANG_MS on the monotonic clock now (`monoNow()`); else null. "Stalled" means Next's queue
 * is blocked behind it (fact 1), so a new write would only queue behind it. Read it AT THE TAP —
 * never from render state (a `nowMs` that re-renders every 15s would let a stalled tablet dispatch
 * for up to 15s more).
 *
 * The OLDEST, not the newest: a fresh poll queued behind a hung write is young, and reading it would
 * call the tab healthy while the write at the head of the queue holds everything (the critic's
 * adjustment 9 — never mark "not stalled" on a younger answer while an older raw is still out).
 * Oldest by `monoAt`, never by the wall clock: after a correction backward, a younger entry carries
 * the EARLIER wall time, and choosing by it measured the young read's age instead (B4).
 */
export function stalledSince(): number | null {
  let oldest: { startedAt: number; monoAt: number } | null = null;
  for (const entry of ledger.values()) {
    if (oldest === null || entry.monoAt < oldest.monoAt) oldest = entry;
  }
  if (oldest === null) return null;
  return monoNow() - oldest.monoAt >= STAFF_HANG_MS ? oldest.startedAt : null;
}

/**
 * What a money tap refused BEFORE anything is sent says — the one precedence every guarded sheet and
 * door reads AT THE TAP (Phase 2h · integration, owner decision). `own` is the surface's OWN waiting
 * sentence while ITS write is still out past the bound (null while it is not); `stalledAt` is
 * `stalledSince()`, read now; `stalled` is the 9d sentence (`out.stalled`). Null: send.
 *
 * The surface's own wait OUTRANKS the ledger. At the bound its own raw is in the ledger too, so the
 * tab IS stalled — but `out.stalled` ("…still waiting for an earlier answer, so this did nothing")
 * speaks only for the refused tap, and drops the one instruction the person needs: don't do it again.
 * Only the surface's own sentence says that ("No answer yet — this payment may still be recorded.
 * Don't take it again…"), so a re-tap re-says it. A tap refused for ANOTHER action's stall — this
 * surface's own write not out — keeps `stalled`. Read first, the own wait also refuses whatever the
 * ledger reads (the sheets' critic F12 raised it for a wall clock set back mid-hang, which the ledger
 * — monotonic since Codex r2 B4 — no longer misreads). Nothing is sent on either refusal.
 */
export function tapRefusal<M>(own: M | null, stalledAt: number | null, stalled: M): M | null {
  if (own !== null) return own;
  return stalledAt === null ? null : stalled;
}

/**
 * Phase 2h · review a (A4) — the per-tab register of a money surface's OWN write still out past the
 * bound, keyed by its SUBJECT (`refund:<order item>`, `loss:<cart item>`, `noshow:<cart>`,
 * `cash:<cart>`), so it outlives the MOUNT that sent it. A refund, loss or no-show sheet is keyed
 * per open, and the cash control's detail can unmount and come back, while the write they sent is
 * still in Next's per-tab queue; a per-mount ref forgot it, and a re-tap of the SAME subject said the
 * tablet's "this did nothing" (`out.stalled`) where the owner's decision 9i wants the surface's own
 * "no answer yet — don't … again". The kiosk's module-level waiting set is the same shape (critic F8).
 *
 * `ownWaitSlot(subject, idle)` is a ref-shaped handle onto that subject's entry: reading `.current`
 * gives the stored value (or `idle` when nothing waits); writing `idle` clears it, anything else
 * sets it. The sheets keep their `ownLate.current = …` lines unchanged — only the storage moved.
 * Every write notifies `subscribeOwnWait` listeners, so a control can HOLD on its own wait across a
 * remount and free the moment the late answer clears it (`hasOwnWait`, read through
 * `useSyncExternalStore`).
 */
const ownWaits = new Map<string, unknown>();
const ownWaitListeners = new Set<() => void>();

export function ownWaitSlot<T>(subject: string, idle: T): { current: T } {
  return {
    get current(): T {
      return ownWaits.has(subject) ? (ownWaits.get(subject) as T) : idle;
    },
    set current(value: T) {
      if (value === idle) ownWaits.delete(subject);
      else ownWaits.set(subject, value);
      for (const listener of ownWaitListeners) listener();
    },
  };
}

/** Phase 2i — ANY subject's own write is held (every money surface's, whatever its subject). */
export function anyOwnWait(): boolean {
  return ownWaits.size > 0;
}

/** Whether `subject`'s own write is still out past the bound (see `ownWaitSlot`). */
export function hasOwnWait(subject: string): boolean {
  return ownWaits.has(subject);
}

/** Called on every own-wait write; returns the unsubscribe (`useSyncExternalStore`'s shape). */
export function subscribeOwnWait(listener: () => void): () => void {
  ownWaitListeners.add(listener);
  return () => {
    ownWaitListeners.delete(listener);
  };
}

/** Test seam: forget every own wait (module state, shared by every case in a file). */
export function resetOwnWaitsForTests(): void {
  ownWaits.clear();
}

/**
 * Codex r2 follow-up on #310 (R2 · R3) — a write HELD FROM THE MOMENT IT IS SENT. A hold set only at
 * the bound left its first STAFF_HANG_MS to the mount that sent it: the open-bill button or the
 * refunds strip mounted again inside that window (staff switch tables and back) read free, and a tap
 * sent a second write behind the first. So those two register their write at DISPATCH in the
 * own-wait register: `late`, the write's never-rejecting answer (`settleLate` of the raw), and
 * `past`, false until the bound passes with no answer. Every mount reads the one entry — before the
 * bound the control is busy, after it it says "no answer yet" — and refuses to send while it stands.
 */
export type OwnOut<T> = { readonly late: Promise<Late<T>>; readonly past: boolean };

/**
 * Move `subject`'s held write ONLY while it is still the write whose answer is `late`: `next`
 * replaces it (the bound marks it `past`), `false` releases it (its answer came). TOKEN-SCOPED — an
 * answer releases only the hold IT set, never a newer write's that took the subject since: the old
 * late handlers cleared unconditionally, so the first write's answer freed a second write's hold
 * while that one was still out. Through one subject's own flow a second write cannot start while
 * the first is held (the tap refuses on the entry), so this is the belt behind that rule — no path,
 * and no register reset between test cases, lets a stale answer move a newer hold. Returns whether
 * it moved.
 */
export function moveOwnOut<T>(
  subject: string,
  late: Promise<Late<T>>,
  next: OwnOut<T> | false,
): boolean {
  const slot = ownWaitSlot<OwnOut<T> | false>(subject, false);
  const held = slot.current;
  if (held === false || held.late !== late) return false;
  slot.current = next;
  return true;
}

/**
 * Codex round 2 on #310 (B2) — the per-tab register of a raw READ still unanswered, keyed by what
 * reads it, so it outlives the MOUNT that sent it. The bound frees the caller, never the action, so a
 * hung read stays in Next's per-tab queue after the surface that sent it closes; a per-mount ref
 * forgot it, and the next open dispatched another read behind it — the roster hook's, keyed by its
 * `load` (`listApprovers`, the one import the loss and no-show sheets share), was the case: close and
 * reopen a sheet while the roster hung, and every reopen queued one more read ahead of every action
 * tapped after it.
 *
 * `outReadSlot(key)` is a ref-shaped handle onto that key's entry (`ownWaitSlot`'s shape): `.current`
 * is the raw still out, or null; writing null clears it, a promise sets it. The owner sets it at
 * dispatch and clears it in the raw's OWN settle — never at a bound — through `releaseOutRead`, which
 * clears it only while it still holds THAT raw (Codex r2 follow-up, R4: the settle used to clear
 * unconditionally, which this sentence already denied).
 */
const outReads = new Map<unknown, Promise<unknown>>();

export function outReadSlot<T>(key: unknown): { current: Promise<T> | null } {
  return {
    get current(): Promise<T> | null {
      return (outReads.get(key) as Promise<T> | undefined) ?? null;
    },
    set current(raw: Promise<T> | null) {
      if (raw === null) outReads.delete(key);
      else outReads.set(key, raw);
    },
  };
}

/**
 * A read's OWN settle: clear `key` only while it still holds `raw` (R4). The register refills only
 * when it is empty, so through the roster's own flow the raw that settles is the one it holds; the
 * check keeps a read that settles AFTER the register was emptied (a reset between test cases) from
 * clearing the newer read a later mount registered — which then sent a second read behind it.
 */
export function releaseOutRead(key: unknown, raw: Promise<unknown>): void {
  if (outReads.get(key) === raw) outReads.delete(key);
}

/** Test seam: forget every outstanding read (module state, shared by every case in a file). */
export function resetOutReadsForTests(): void {
  outReads.clear();
}

/** Test seam: how many tracked actions are outstanding. */
export function outstanding(): number {
  return ledger.size;
}

/** Test seam: forget every entry (the ledger is module state, shared by every case in a file). */
export function resetLedgerForTests(): void {
  ledger.clear();
}
