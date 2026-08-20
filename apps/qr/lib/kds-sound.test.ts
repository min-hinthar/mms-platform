import { afterEach, describe, expect, it, vi } from "vitest";
import { KDS_DEFAULT_VOLUME, KdsChime, SOFT_LEVEL, getKdsVolume, setKdsVolume } from "./kds-sound";
import { chimeSchedule } from "./chime-core";

/**
 * M90 — the kitchen half of the equivalence proof.
 *
 * `KdsChime` was rewired onto `chime-core`, and the cook's ticket chime is load-bearing on a hot
 * line: W22f explicitly refused to touch it inside a diner slice for that reason. So the claim "no
 * KDS caller was touched" is checked here rather than asserted in a comment — the tone vocabulary,
 * the 0.8 default, the soft re-chime multiplier, and the channel routing, each against the numbers
 * that shipped with W3c.
 *
 * The expected node calls are DERIVED from `chimeSchedule`, whose own suite next door pins it to a
 * verbatim transcription of the pre-M90 arithmetic. Nothing here is a typed-in timestamp.
 */

/** The tone tables as W3c wrote them — module-private in `kds-sound.ts`, restated to be compared. */
const DINEIN = [
  { freq: 660, at: 0, dur: 0.18 },
  { freq: 880, at: 0.2, dur: 0.26 },
];
const PICKUP = [
  { freq: 784, at: 0, dur: 0.14 },
  { freq: 988, at: 0.16, dur: 0.14 },
  { freq: 1175, at: 0.32, dur: 0.3 },
];

type Call = [string, ...unknown[]];

function fakeAudio() {
  const calls: Call[] = [];
  const destination = { id: "destination" };
  class FakeContext {
    state: AudioContextState = "running";
    currentTime = 5;
    destination = destination;
    async resume() {}
    createOscillator() {
      calls.push(["createOscillator"]);
      return {
        set type(v: string) {
          calls.push(["osc.type", v]);
        },
        frequency: {
          set value(v: number) {
            calls.push(["osc.freq", v]);
          },
        },
        connect: (dst: unknown) => (calls.push(["osc.connect"]), dst),
        start: (t: number) => calls.push(["osc.start", t]),
        stop: (t: number) => calls.push(["osc.stop", t]),
      };
    }
    createGain() {
      calls.push(["createGain"]);
      return {
        gain: {
          setValueAtTime: (v: number, t: number) => calls.push(["setValueAtTime", v, t]),
          exponentialRampToValueAtTime: (v: number, t: number) => calls.push(["ramp", v, t]),
        },
        connect: (dst: unknown) => (calls.push(["gain.connect"]), dst),
      };
    }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeContext });
  return calls;
}

/** The calls a given tone + level must produce, built from the pinned schedule. */
function expectedCalls(notes: typeof DINEIN, level: number): Call[] {
  return chimeSchedule(notes, level, 5).flatMap((s): Call[] => [
    ["createOscillator"],
    ["createGain"],
    ["osc.type", "sine"],
    ["osc.freq", s.freq],
    ["setValueAtTime", 0.0001, s.startAt],
    ["ramp", s.peak, s.peakAt],
    ["ramp", 0.0001, s.endAt],
    ["osc.connect"],
    ["gain.connect"],
    ["osc.start", s.startAt],
    ["osc.stop", s.stopAt],
  ]);
}

/** Install a `localStorage` the volume helpers can see (they read the bare global). */
function withStorage(initial: string | null = null) {
  let value = initial;
  const store = {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_k: string, v: string) => {
      value = v;
    }),
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: store });
  return store;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "AudioContext");
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("getKdsVolume — loud by default (SPEC-KDS §3)", () => {
  it("⚠️ answers 0.8 for an unset preference, and for a store that throws", () => {
    // A cook must hear a ticket land across a hot line. This default failing toward quiet — or
    // toward zero, the shape a "safe" refactor reaches for — is a missed ticket.
    withStorage(null);
    expect(getKdsVolume()).toBe(0.8);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    expect(getKdsVolume()).toBe(0.8);
    expect(KDS_DEFAULT_VOLUME).toBe(0.8);
  });

  it("clamps to 0..1 and rejects junk", () => {
    withStorage("2");
    expect(getKdsVolume()).toBe(1);
    withStorage("-3");
    expect(getKdsVolume()).toBe(0);
    withStorage("loud");
    expect(getKdsVolume()).toBe(0.8);
    withStorage("0");
    expect(getKdsVolume()).toBe(0); // an explicit mute is a real preference, not missing data
  });

  it("round-trips a set volume through the store", () => {
    const store = withStorage(null);
    setKdsVolume(0.35);
    expect(store.setItem).toHaveBeenCalledWith("mms.kds.volume", "0.35");
    expect(getKdsVolume()).toBe(0.35);
  });
});

describe("KdsChime — the ticket chime is what it was before M90", () => {
  it("⚠️ emits the dine-in tone at the default volume, note for note", async () => {
    const calls = fakeAudio();
    withStorage(null);
    const chime = new KdsChime();
    expect(await chime.arm()).toBe(true);
    calls.length = 0;
    chime.play("dinein");
    expect(calls).toStrictEqual(expectedCalls(DINEIN, 0.8));
  });

  it("⚠️ routes BOTH counter channels to the brighter three-note rise", async () => {
    // pickup and scango share a tone deliberately: in both, a customer is standing at the counter.
    // The ternary that does it reads `channel === "dinein" ? dinein : pickup`, so a scango ticket
    // silently falling back to the dine-in tone would tell the cook the wrong kind of work landed.
    withStorage(null);
    for (const channel of ["pickup", "scango"] as const) {
      const calls = fakeAudio();
      const chime = new KdsChime();
      await chime.arm();
      calls.length = 0;
      chime.play(channel);
      expect(calls).toStrictEqual(expectedCalls(PICKUP, 0.8));
    }
  });

  it("⚠️ plays the re-chime at exactly the soft fraction", async () => {
    // The 60–90s un-started nag. Same tone, lower level: it must nag without startling.
    const calls = fakeAudio();
    withStorage(null);
    const chime = new KdsChime();
    await chime.arm();
    calls.length = 0;
    chime.play("dinein", true);
    expect(calls).toStrictEqual(expectedCalls(DINEIN, 0.8 * SOFT_LEVEL));
    expect(SOFT_LEVEL).toBe(0.4);
  });

  it("⚠️ builds nothing at all when the station is muted", async () => {
    const calls = fakeAudio();
    withStorage("0");
    const chime = new KdsChime();
    await chime.arm();
    calls.length = 0;
    chime.play("dinein");
    expect(calls).toStrictEqual([]);
  });

  it("⚠️ does not even READ the volume before the shift-start arm", async () => {
    // A ticket landing on an un-armed station must cost nothing to discover there is nothing to
    // play. `armed` is checked ahead of the preference read for that reason.
    const calls = fakeAudio();
    const store = withStorage(null);
    const chime = new KdsChime();
    chime.play("dinein");
    expect(calls).toStrictEqual([]);
    expect(store.getItem).not.toHaveBeenCalled();
  });
});
