import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STAFF_OUTAGE_ESCALATE_MS,
  STAFF_WRITE_OUTAGE,
  STAFF_WRITE_OUTAGE_MY,
  WRITE_UNCONFIRMED,
  WRITE_WAITING,
  frozenBoardCopy,
  nextDegraded,
  raceFetch,
  raceTimeout,
  writeLineAfterLateAnswer,
} from "./staff-outage";
import { STAFF_HANG_MS, outstanding, resetLedgerForTests, stalledSince } from "./bounded-write";

/**
 * P2 · G13 — the outage voice. **This module had no suite at all before P2**, which is worth saying
 * plainly: `frozenBoardCopy` is the sentence five boards show when the ordering system is unreachable
 * — the single most consequential copy in the staff console — and nothing pinned it.
 *
 * The English arm is pinned to today's EXACT sentences, so making the whole thing bilingual cannot
 * quietly reword what English-reading staff already know. The Burmese arm is pinned structurally
 * (Myanmar script present, the right noun, a LATIN clock) rather than to a literal, because every MY
 * value is a K15 draft and a native-check correction must not redden a suite.
 */
const AS_OF = "2026-09-05T19:30:00.000Z";
const clock = new Date(AS_OF).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const MYANMAR = /[က-႟]/;

describe("frozenBoardCopy — English, pinned to today's sentences", () => {
  it("reconnecting, and honest about whose fault it is", () => {
    expect(frozenBoardCopy("en", AS_OF, 0, "what.queue")).toBe(
      `We can’t reach the ordering system — showing the queue as of ${clock}. Reconnecting…`,
    );
  });

  it("escalated: the paper instruction", () => {
    expect(frozenBoardCopy("en", AS_OF, STAFF_OUTAGE_ESCALATE_MS, "what.bags")).toBe(
      `Still can’t reach the ordering system — showing the bags as of ${clock}. Take new orders on paper; nothing here is lost.`,
    );
  });

  it("cause 'unknown' never asserts that WE are down", () => {
    // The W10a rule: repeated transport failures from this tablet could equally be its own wifi.
    expect(frozenBoardCopy("en", AS_OF, 0, "what.room", "unknown")).toBe(
      `Not updating right now — showing the room as of ${clock}. Reconnecting…`,
    );
    expect(frozenBoardCopy("en", AS_OF, STAFF_OUTAGE_ESCALATE_MS, "what.room", "unknown")).toBe(
      `Still not updating — showing the room as of ${clock}. Take new orders on paper; nothing here is lost.`,
    );
  });

  it("escalates exactly AT the threshold, not after it", () => {
    expect(frozenBoardCopy("en", AS_OF, STAFF_OUTAGE_ESCALATE_MS - 1, "what.queue")).toContain(
      "Reconnecting…",
    );
    expect(frozenBoardCopy("en", AS_OF, STAFF_OUTAGE_ESCALATE_MS, "what.queue")).toContain(
      "on paper",
    );
  });
});

describe("frozenBoardCopy — Burmese", () => {
  it("is actually Burmese, in all four head/tail combinations", () => {
    for (const ms of [0, STAFF_OUTAGE_ESCALATE_MS]) {
      for (const cause of ["outage", "unknown"] as const) {
        const out = frozenBoardCopy("my", AS_OF, ms, "what.queue", cause);
        expect(out).toMatch(MYANMAR);
        // The mutant this kills: an arm that returns the English sentence regardless of `lang`,
        // leaving the outage line English on the kitchen tablet while everything around it is not.
        expect(out).not.toContain("ordering system");
        expect(out).not.toContain("on paper");
      }
    }
  });

  it("carries the Burmese noun for the board it is showing", () => {
    const queue = frozenBoardCopy("my", AS_OF, 0, "what.queue");
    const bags = frozenBoardCopy("my", AS_OF, 0, "what.bags");
    expect(queue).not.toBe(bags);
    expect(queue).not.toContain("the queue");
  });

  it("keeps the clock LATIN — it is matched against a wall clock", () => {
    const out = frozenBoardCopy("my", AS_OF, 0, "what.queue");
    expect(out).toContain(clock);
    expect(out).not.toMatch(/[၀-၉]/);
  });

  it("escalates on the same threshold as English", () => {
    const soft = frozenBoardCopy("my", AS_OF, STAFF_OUTAGE_ESCALATE_MS - 1, "what.queue");
    const hard = frozenBoardCopy("my", AS_OF, STAFF_OUTAGE_ESCALATE_MS, "what.queue");
    expect(soft).not.toBe(hard);
  });
});

describe("the write-outage sentence", () => {
  it("has a Burmese twin", () => {
    expect(STAFF_WRITE_OUTAGE_MY).toMatch(MYANMAR);
    expect(STAFF_WRITE_OUTAGE_MY).not.toBe(STAFF_WRITE_OUTAGE);
  });

  it("leaves the English constant byte-identical — 27 staffGate arms return it", () => {
    expect(STAFF_WRITE_OUTAGE).toBe(
      "We can’t reach the ordering system — that change wasn’t saved. Keep it on paper for now.",
    );
  });
});

describe("nextDegraded — unchanged by P2, pinned because nothing else pins it", () => {
  it("keeps the original since and adopts the newest cause", () => {
    const first = nextDegraded(null, "unknown", 1_000);
    expect(first).toEqual({ since: 1_000, cause: "unknown" });
    const upgraded = nextDegraded(first, "outage", 9_000);
    expect(upgraded).toEqual({ since: 1_000, cause: "outage" });
    // …and back down again: after the platform recovers, a tablet that loses its own AP must stop
    // asserting that we are down.
    expect(nextDegraded(upgraded, "unknown", 20_000)).toEqual({ since: 1_000, cause: "unknown" });
  });

  it("returns the SAME object when the cause is unchanged, so a steady degrade does not re-render", () => {
    const d = nextDegraded(null, "outage", 1_000);
    expect(nextDegraded(d, "outage", 5_000)).toBe(d);
  });
});

describe("raceTimeout — Phase 2h: the bound named ONCE, and the raw promise tracked", () => {
  const T0 = Date.parse("2026-10-01T18:00:00.000Z");
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
    resetLedgerForTests();
  });
  afterEach(() => {
    resetLedgerForTests();
    vi.useRealTimers();
  });

  /** The race's outcome, read through a `.then` — `undefined` while it is still out. */
  function outcome<T>(p: Promise<T>) {
    let got: { ok: true; v: T } | { ok: false; e: unknown } | undefined;
    p.then(
      (v) => {
        got = { ok: true, v };
      },
      (e: unknown) => {
        got = { ok: false, e };
      },
    );
    return () => got;
  }

  it("rejects `staff-poll-timeout` at EXACTLY STAFF_HANG_MS by default — not a millisecond before", async () => {
    // MUTATION (p2h-core/race/bound-drifts): a default that is not THE constant — the pad's
    // unconfirmed add, the stall ledger and the poll watchdog disagree about one hang; red.
    const got = outcome(raceTimeout(new Promise<never>(() => {})));
    await vi.advanceTimersByTimeAsync(STAFF_HANG_MS - 1);
    expect(got()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    const out = got();
    expect(out?.ok).toBe(false);
    expect((out as { e: Error }).e.message).toBe("staff-poll-timeout");
  });

  it("passes an answer and a rejection straight through", async () => {
    const ok = outcome(raceTimeout(Promise.resolve(7)));
    const err = new Error("fetch failed");
    const bad = outcome(raceTimeout(Promise.reject(err)));
    await vi.advanceTimersByTimeAsync(0);
    expect(ok()).toEqual({ ok: true, v: 7 });
    expect(bad()).toEqual({ ok: false, e: err });
  });

  it("tracks the RAW promise — past its own rejection, until the raw answers", async () => {
    // MUTATION (p2h-core/race/untracked): a raced read hung for minutes never reaches the ledger,
    // so `stalledSince` calls the tab healthy and the next money tap queues behind it; red.
    let answer!: (v: number) => void;
    const raw = new Promise<number>((r) => {
      answer = r;
    });
    const got = outcome(raceTimeout(raw));
    expect(outstanding()).toBe(1);
    await vi.advanceTimersByTimeAsync(STAFF_HANG_MS);
    // The race freed its CALLER; the raw read is still in Next's queue, and still on the ledger.
    expect(got()?.ok).toBe(false);
    expect(outstanding()).toBe(1);
    expect(stalledSince()).toBe(T0);
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(outstanding()).toBe(0);
  });

  it("raceFetch bounds a NON-action fetch (a Supabase sign-out) the same way and NEVER tracks it (review c, C1)", async () => {
    // A hung auth fetch is not in Next's action queue: tracked, it would read the whole tab as
    // stalled and refuse every money tap after the unlock's soft navigation into the console.
    // MUTATION (p2h-rev-c/race-fetch-tracks): raceFetch registers its promise; red.
    const got = outcome(raceFetch(new Promise<never>(() => {})));
    expect(outstanding()).toBe(0);
    await vi.advanceTimersByTimeAsync(STAFF_HANG_MS - 1);
    expect(got()).toBeUndefined();
    // MUTATION (p2h-rev-c/race-fetch-bound-drifts): the default is not THE constant; red.
    await vi.advanceTimersByTimeAsync(1);
    expect((got() as { e: Error } | undefined)?.e.message).toBe("staff-poll-timeout");
    await vi.advanceTimersByTimeAsync(STAFF_HANG_MS * 4);
    expect(outstanding()).toBe(0);
    expect(stalledSince()).toBeNull();
    const ok = outcome(raceFetch(Promise.resolve(7)));
    await vi.advanceTimersByTimeAsync(0);
    expect(ok()).toEqual({ ok: true, v: 7 });
  });
});

describe("writeLineAfterLateAnswer — a line edit's late answer and the page's write line (Phase 2h · integration, S2 critic D2)", () => {
  it("the LAST waiting line answering retracts 'no answer yet — it may still be saved'", () => {
    // MUTATION (p2h-int-a/write-waiting-never-retracts): the sentence stands over a change that
    // saved — and it outranks the settle and frozen lines, so it hides them too; red.
    expect(writeLineAfterLateAnswer(WRITE_WAITING, 0)).toBeNull();
  });
  it("while another line's write is still out, the sentence stands — it is still true of that one", () => {
    // MUTATION (p2h-int-a/write-waiting-retracts-early): the first answer retracts it while a
    // second row's change is still unanswered; red.
    expect(writeLineAfterLateAnswer(WRITE_WAITING, 1)).toBe(WRITE_WAITING);
  });
  it("any OTHER line stands — a refusal, 'couldn't confirm', a discount's sentence", () => {
    // MUTATION (p2h-int-a/write-retract-any-line): the late answer wipes whatever the line says —
    // the refusal the late answer itself just said ("That line just changed.") goes unread; red.
    expect(writeLineAfterLateAnswer("That line just changed.", 0)).toBe("That line just changed.");
    expect(writeLineAfterLateAnswer(WRITE_UNCONFIRMED, 0)).toBe(WRITE_UNCONFIRMED);
    expect(writeLineAfterLateAnswer(null, 0)).toBeNull();
  });
});
