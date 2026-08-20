import { afterEach, describe, expect, it } from "vitest";
import {
  ATTACK,
  ChimeEngine,
  FLOOR,
  PEAK_FLOOR,
  START_PAD,
  TAIL,
  chimeSchedule,
  type ChimeNote,
} from "./chime-core";
import { CHIME, CHIME_LEVEL } from "./chime";

/**
 * M90 — the equivalence proof for a refactor that is otherwise unobservable.
 *
 * Two engines were folded onto one core. A refactor like that can only claim "behaviour-identical" if
 * something checks it, and WebAudio needs a browser this repo's node runner does not have. So both
 * halves are made checkable here: the envelope is a pure function whose output is compared against a
 * VERBATIM transcription of the pre-M90 arithmetic, and the WebAudio side is driven through a
 * recording fake context, so the exact node-graph calls are asserted rather than assumed.
 *
 * Every expected number below is COMPUTED by `legacySchedule` from the old formula. None is
 * transcribed — a hand-typed 5.039999999999999 is how a "green" test ends up proving the typist.
 */

/**
 * The pre-M90 arithmetic, copied verbatim out of `kds-sound.ts`'s `play` as it stood at 72d81e2:
 *
 *     const t0 = ctx.currentTime + 0.02;
 *     gain.gain.setValueAtTime(0.0001, t0 + n.at);
 *     gain.gain.exponentialRampToValueAtTime(Math.max(level, 0.001), t0 + n.at + 0.02);
 *     gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
 *     osc.start(t0 + n.at);
 *     osc.stop(t0 + n.at + n.dur + 0.05);
 *
 * The literals are deliberately literals here and named constants in the module: if someone edits
 * `ATTACK` or `TAIL`, this is what goes red. Written out with the same operator ORDER as the old
 * code, because float addition is not associative and `t0 + n.at + n.dur` ≠ `t0 + (n.at + n.dur)`.
 */
function legacySchedule(notes: readonly ChimeNote[], level: number, now: number) {
  if (level <= 0) return [];
  const t0 = now + 0.02;
  return notes.map((n) => ({
    freq: n.freq,
    startAt: t0 + n.at,
    peak: Math.max(level, 0.001),
    peakAt: t0 + n.at + 0.02,
    endAt: t0 + n.at + n.dur,
    stopAt: t0 + n.at + n.dur + 0.05,
  }));
}

/** The KDS tone tables, as they stand — imported would be nicer, but they are module-private. */
const KDS_DINEIN: ChimeNote[] = [
  { freq: 660, at: 0, dur: 0.18 },
  { freq: 880, at: 0.2, dur: 0.26 },
];
const KDS_PICKUP: ChimeNote[] = [
  { freq: 784, at: 0, dur: 0.14 },
  { freq: 988, at: 0.16, dur: 0.14 },
  { freq: 1175, at: 0.32, dur: 0.3 },
];

describe("chimeSchedule — the envelope M90 promised not to change", () => {
  // The four real vocabularies, at the levels their own callers actually use.
  const cases: Array<[string, ChimeNote[], number]> = [
    ["KDS dine-in at the 0.8 default", KDS_DINEIN, 0.8],
    ["KDS pickup at the 0.8 default", KDS_PICKUP, 0.8],
    ["KDS pickup at the soft re-chime level", KDS_PICKUP, 0.8 * 0.4],
    ["the diner's send bell", CHIME.sent, CHIME_LEVEL],
    ["the diner's paid phrase", CHIME.paid, CHIME_LEVEL],
  ];

  for (const [label, notes, level] of cases) {
    it(`⚠️ is bit-identical to the pre-M90 arithmetic — ${label}`, () => {
      // Two clock readings, because `now` participates in every term: a schedule that is right at 0
      // can still be wrong once float error from a real context clock is in play.
      for (const now of [0, 5, 1234.56789]) {
        expect(chimeSchedule(notes, level, now)).toStrictEqual(legacySchedule(notes, level, now));
      }
    });
  }

  it("⚠️ schedules NOTHING at or below zero — a muted station must cost no oscillators", () => {
    // The KDS volume slider reaches 0, and this early return is the whole meaning of "muted".
    // Ramping to zero would also throw: exponentialRampToValueAtTime rejects a zero target.
    expect(chimeSchedule(KDS_DINEIN, 0, 5)).toStrictEqual([]);
    expect(chimeSchedule(KDS_DINEIN, -1, 5)).toStrictEqual([]);
    expect(chimeSchedule(KDS_DINEIN, Number.NaN, 5)).toStrictEqual([]);
  });

  it("⚠️ raises a nonzero level below PEAK_FLOOR rather than dropping it", () => {
    // Reachable: volume 0.002 × the 0.4 soft multiplier is 0.0008. The old code floored the PEAK at
    // 0.001 while ramping FROM 0.0001, and collapsing those two into one constant would make the
    // ramp directionless — audible as silence, with a stop() still scheduled.
    const tiny = 0.002 * 0.4;
    expect(tiny).toBeLessThan(PEAK_FLOOR);
    const [first] = chimeSchedule(KDS_DINEIN, tiny, 0);
    expect(first?.peak).toBe(PEAK_FLOOR);
    expect(PEAK_FLOOR).toBeGreaterThan(FLOOR);
    // …and it is still the legacy value, not a new one.
    expect(chimeSchedule(KDS_DINEIN, tiny, 0)).toStrictEqual(legacySchedule(KDS_DINEIN, tiny, 0));
  });

  it("keeps every note strictly ahead of the clock reading it was scheduled from", () => {
    // A note scheduled in the past is played IMMEDIATELY, which collapses a two-note phrase into a
    // chord. START_PAD is the whole margin, so nothing may start at `now`.
    for (const s of chimeSchedule(CHIME.paid, CHIME_LEVEL, 10)) {
      expect(s.startAt).toBeGreaterThan(10);
      expect(s.peakAt).toBeGreaterThan(s.startAt);
      expect(s.endAt).toBeGreaterThan(s.peakAt);
      expect(s.stopAt).toBeGreaterThan(s.endAt);
    }
    expect(START_PAD).toBeGreaterThan(0);
    expect(ATTACK).toBeGreaterThan(0);
    expect(TAIL).toBeGreaterThan(0);
  });
});

// ── The WebAudio side, through a recording fake ──────────────────────────────────────────────────

type Call = [string, ...unknown[]];

/** Records every call the engine makes, in order, so the node graph itself can be asserted. */
const live: { ctx: { state: AudioContextState } | null } = { ctx: null };

function fakeAudio(state: AudioContextState = "running") {
  const calls: Call[] = [];
  const destination = { id: "destination" };
  live.ctx = null;
  class FakeContext {
    state = state;
    currentTime = 5;
    destination = destination;
    constructor() {
      live.ctx = this; // so a test can suspend the context the engine is holding
    }
    async resume() {
      calls.push(["resume"]);
      this.state = "running";
    }
    createOscillator() {
      const osc = {
        _type: "",
        set type(v: string) {
          calls.push(["osc.type", v]);
          osc._type = v;
        },
        frequency: {
          set value(v: number) {
            calls.push(["osc.freq", v]);
          },
        },
        connect: (dst: unknown) => {
          calls.push(["osc.connect", dst === destination ? "destination" : "gain"]);
          return dst;
        },
        start: (t: number) => calls.push(["osc.start", t]),
        stop: (t: number) => calls.push(["osc.stop", t]),
      };
      calls.push(["createOscillator"]);
      return osc;
    }
    createGain() {
      calls.push(["createGain"]);
      return {
        gain: {
          setValueAtTime: (v: number, t: number) => calls.push(["setValueAtTime", v, t]),
          exponentialRampToValueAtTime: (v: number, t: number) => calls.push(["ramp", v, t]),
        },
        connect: (dst: unknown) => {
          calls.push(["gain.connect", dst === destination ? "destination" : "gain"]);
          return dst;
        },
      };
    }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeContext });
  return calls;
}

/** What the pre-M90 loop body emitted, per note, in order. */
function legacyCalls(notes: readonly ChimeNote[], level: number, now: number): Call[] {
  return legacySchedule(notes, level, now).flatMap((s): Call[] => [
    ["createOscillator"],
    ["createGain"],
    ["osc.type", "sine"],
    ["osc.freq", s.freq],
    ["setValueAtTime", 0.0001, s.startAt],
    ["ramp", s.peak, s.peakAt],
    ["ramp", 0.0001, s.endAt],
    ["osc.connect", "gain"],
    ["gain.connect", "destination"],
    ["osc.start", s.startAt],
    ["osc.stop", s.stopAt],
  ]);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "AudioContext");
});

describe("ChimeEngine — the node graph, asserted rather than assumed", () => {
  it("⚠️ emits exactly the pre-M90 call sequence for a real tone", async () => {
    const calls = fakeAudio();
    const engine = new ChimeEngine();
    expect(await engine.arm()).toBe(true);
    calls.length = 0;
    engine.play(KDS_PICKUP, 0.8);
    expect(calls).toStrictEqual(legacyCalls(KDS_PICKUP, 0.8, 5));
  });

  it("⚠️ plays NOTHING before arm() — an un-armed context must build no nodes", async () => {
    // Notes scheduled into a suspended context are played when it eventually resumes: a bell minutes
    // late, on an unrelated tap, for an order already eaten. `chime.ts`'s `mayChime` states this.
    const calls = fakeAudio("suspended");
    const engine = new ChimeEngine();
    engine.play(KDS_DINEIN, 0.8);
    expect(engine.armed).toBe(false);
    expect(calls).toStrictEqual([]);
  });

  it("⚠️ falls silent when an ARMED context is later suspended out from under it", async () => {
    // The iOS shape: a call or an app switch suspends the context while `this.ctx` stays non-null.
    // Checking only for a context — rather than for a RUNNING one — would schedule into it anyway,
    // and a suspended context replays everything queued the moment it resumes. That is `mayChime`'s
    // stated fear made concrete: a bell minutes late, for an order already eaten.
    const calls = fakeAudio();
    const engine = new ChimeEngine();
    await engine.arm();
    calls.length = 0;
    live.ctx!.state = "suspended";
    engine.play(KDS_DINEIN, 0.8);
    expect(engine.armed).toBe(false);
    expect(calls).toStrictEqual([]);
  });

  it("⚠️ answers false instead of throwing when the device has no WebAudio", async () => {
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          throw new Error("not supported");
        }
      },
    });
    const engine = new ChimeEngine();
    expect(await engine.arm()).toBe(false);
    expect(engine.armed).toBe(false);
    // …and playing anyway is a silent no-op, never a second throw on a send or a payment.
    expect(() => engine.play(KDS_DINEIN, 0.8)).not.toThrow();
  });

  it("resumes a suspended context — the gesture is what unlocks it", async () => {
    const calls = fakeAudio("suspended");
    const engine = new ChimeEngine();
    expect(await engine.arm()).toBe(true);
    expect(calls).toStrictEqual([["resume"]]);
    expect(engine.armed).toBe(true);
  });

  it("builds no nodes at all for a muted level", async () => {
    const calls = fakeAudio();
    const engine = new ChimeEngine();
    await engine.arm();
    calls.length = 0;
    engine.play(KDS_DINEIN, 0);
    expect(calls).toStrictEqual([]);
  });
});
