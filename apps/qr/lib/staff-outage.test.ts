import { describe, expect, it } from "vitest";
import {
  STAFF_OUTAGE_ESCALATE_MS,
  STAFF_WRITE_OUTAGE,
  STAFF_WRITE_OUTAGE_MY,
  frozenBoardCopy,
  nextDegraded,
} from "./staff-outage";

/**
 * P2 · G13 — the outage voice. **This module had no suite at all before P2**, which is worth saying
 * plainly: `frozenBoardCopy` is the sentence six boards show when the ordering system is unreachable
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

  it("leaves the English constant byte-identical — 24 staffGate arms return it", () => {
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
