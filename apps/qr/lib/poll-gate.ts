import { STAFF_HANG_MS, monoNow, track } from "./bounded-write";

/**
 * Phase 2h (decision 9f) — polls never stack. The order pad's `rawPending` / `owed` pattern
 * (LEARNINGS #157), extracted so every staff board holds its poll the same way.
 *
 * WHY. Next runs Server Actions one at a time per tab, and a `raceTimeout` frees the CALLER at 15s,
 * not the action: the timed-out read is still in the queue. A 5s poll that starts a "fresh" read
 * after the timeout queues it BEHIND the hung one, then another, each abandoned in turn — three
 * calls behind one hang in 45s, and every one of them must drain before the next write the staff
 * member taps can even be sent. So while the RAW read is unanswered, a tick starts nothing; the asks
 * it refused are owed ONE read, kicked just after the raw answers (the answer may be stale by then,
 * and the owed read is what brings the board current).
 *
 * WHY A SKIPPED TICK CAN BE A MISS. Before this, the pad's skip never counted: its 15s race counted
 * one miss, and every later tick was skipped silently, so the degraded banner (two misses) NEVER
 * armed on a hang — the board wore its live face over a frozen feed. A tick refused while the raw
 * has been out ≥ STAFF_HANG_MS is evidence of exactly what a failed read is evidence of: nothing has
 * come back for a hang's worth of time. Under the bound it is not — a slow-but-healthy read on
 * congested wifi is the case the 15s bound exists to forgive (W10b) — so it is not a miss.
 *
 * ONE CLOCK — THIS DEVICE'S. Neither `ask` nor `watch` takes a time: a skipped tick's `missed` and
 * the stall ledger's "stalled" are the same measurement (a raw read out ≥ STAFF_HANG_MS), so both
 * read the ledger's MONOTONIC clock (`monoNow`, Codex r2 on #310 B4) and agree to the millisecond — a
 * wall clock corrected mid-hang moves neither, so the degraded banner arms at the bound exactly as
 * the money taps start refusing, never an hour late. A board that runs its own clock in SERVER space
 * (`KdsBoard`/`ExpoBoard`'s `stampNow()`) keeps it for its own stamps; handed to the gate, it would
 * have been written into the ledger every money tap reads, refusing every tap by the device's skew
 * (the Phase 2h contract critic, F2). The gate tracks each watched read in that ledger
 * (`bounded-write.ts`), because a hung READ holds Next's queue exactly as a hung write does
 * (decision 9d refuses money taps on it).
 *
 * WHY THE OWED KICK IS DEFERRED (a macrotask, `setTimeout(…, 0)`). The raw's settle handlers run
 * BEFORE the owner's `await raceTimeout(raw)` resumes — the race's own `.then` is queued behind this
 * gate's, and the owner's continuation behind that — so a kick fired inside the answer reaches an
 * owner whose `inFlight` is still true. Four boards coalesce on a bare `if (inFlight.current)
 * return` with no rerun flag (KdsBoard · FloorBoard · ExpoBoard · ApprovalsBoard), and each would
 * DROP the owed read there: the board keeps the stale answer the hung read brought back until the
 * next poll (critic F4 — measured: one read where two were owed). A microtask is still too early (it
 * runs before the owner's continuation). A macrotask runs after every microtask has drained, so the
 * owner's `finally` has cleared `inFlight` — PROVIDED the owner awaits nothing after the read before
 * that `finally`; an owner that does (a second action, a write) must keep a rerun flag, as the pad
 * does. A read that STARTS before the deferred kick fires pays the debt itself, so the kick is
 * cancelled (never a second read on top of the one that just began).
 *
 * SEVERAL READS PER TICK. `watch` takes ONE promise. A board that reads several feeds per tick
 * (ApprovalsBoard: queue · roster · ledger) watches them as one — `gate.watch(Promise.allSettled(raws))`
 * — and races each raw separately; the gate stays shut until the LAST of them answers.
 *
 * ⚠️ WHO OWNS IT. The gate holds the raw read's state, so it must OUTLIVE every effect re-setup —
 * Strict Mode's mount (setup → cleanup → setup) and any dependency change. A gate created in an
 * effect's setup forgets the hung read on the next setup and lets one more read stack behind it.
 * Create it ONCE per component (a lazily-filled ref), and guard the `kick` callback with the
 * component's own re-armed `alive` ref. `dispose()` is one-way: call it only where the owner's
 * lifetime is a single setup, never from a cleanup that Strict Mode will follow with a fresh setup
 * (the "ref latched in cleanup" trap — the latch would silence every owed read for good).
 */
export type PollGate = {
  /**
   * A tick asks to read. "start" → begin a read (and `watch` its raw promise). "owed" → a raw read
   * is still unanswered: no read starts; ONE read is owed and will be kicked when it answers.
   * `missed` is true when that unanswered raw has been out ≥ STAFF_HANG_MS (the caller counts a
   * miss, so its degraded banner arms and escalates).
   */
  ask(): { go: "start" } | { go: "owed"; missed: boolean };
  /** Shut the gate until `raw` settles; then, if a read is owed and the gate is not disposed, kick
   *  once on the next macrotask (see WHY THE OWED KICK IS DEFERRED). Returns raw. Tracks raw in the
   *  stall ledger as a READ (Phase 2i: a poll in flight never blocks a reload for a new build). */
  watch<T>(raw: Promise<T>): Promise<T>;
  /** A watched raw read is still unanswered. */
  pending(): boolean;
  /** No kick after this (unmount) — including one already deferred. */
  dispose(): void;
};

export function createPollGate(kick: () => void): PollGate {
  // The ONE unanswered raw read, by identity, and when it went out (this device's monotonic clock).
  let out: { since: number } | null = null;
  // However many asks were refused while it was out, they are owed ONE read.
  let owed = false;
  let disposed = false;
  // The owed kick, deferred past the owner's continuation; a read that starts first cancels it.
  let due: ReturnType<typeof setTimeout> | null = null;
  return {
    ask() {
      if (out === null) return { go: "start" };
      owed = true;
      return { go: "owed", missed: monoNow() - out.since >= STAFF_HANG_MS };
    },
    watch(raw) {
      // A read starting now pays the debt a deferred kick was about to pay.
      if (due !== null) clearTimeout(due);
      due = null;
      const mine = { since: monoNow() };
      out = mine;
      track(raw, "read");
      const answered = () => {
        // Only the read that shut the gate may open it: a caller that watched a second read over an
        // unanswered first (outside `ask`'s contract) must not have the OLDER answer reopen the gate
        // while the younger read is still in the queue.
        if (out !== mine) return;
        out = null;
        if (owed && !disposed) {
          owed = false;
          due = setTimeout(() => {
            due = null;
            kick();
          }, 0);
        }
      };
      raw.then(answered, answered);
      return raw;
    },
    pending: () => out !== null,
    dispose() {
      disposed = true;
      if (due !== null) clearTimeout(due);
      due = null;
    },
  };
}
