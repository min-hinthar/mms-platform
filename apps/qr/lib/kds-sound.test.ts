import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KDS_DEFAULT_VOLUME,
  KdsChime,
  SOFT_LEVEL,
  getKdsSoundWanted,
  setKdsSoundWanted,
} from "./kds-sound";
import { ARM_TIMEOUT_MS } from "./counter-chime";
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
 *
 * Phase 3d — the slider is retired: the level is fixed at 0.8, the kitchen's mute is a predicate
 * `play()` reads at every call (defaulting OPEN, because the TV wall shares the class), the per-device
 * answer survives a store that refuses it, and the circle's arm is bounded. `kds-sound.ts` joined
 * the mutate set with this commit; each rule below names its `kds-sound/…` mutant.
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

/** Install a `localStorage` (a key → value map) the store helpers can see — they read the bare
 *  global. */
function withStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const store = {
    getItem: vi.fn((k: string) => map.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      map.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      map.delete(k);
    }),
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: store });
  return store;
}

/** A `localStorage` whose very getter throws — site data blocked, the strictest private mode. */
function blockedStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    },
  });
}

afterEach(() => {
  // A write through a WORKING store clears the in-memory fallback, so no case inherits another's.
  withStorage();
  setKdsSoundWanted(false);
  Reflect.deleteProperty(globalThis, "AudioContext");
  Reflect.deleteProperty(globalThis, "localStorage");
  vi.useRealTimers();
});

describe("the level is FIXED — the slider is retired (Phase 3d)", () => {
  it("⚠️ plays at 0.8 even with a stale slider value left on the device", async () => {
    // The `mms.kds.volume` key is deliberately left on devices (the decision is one revert away) and
    // must never be read. MUTATION kds-sound/level-unpinned: the 0.8 dropped from the product — the
    // tone plays at full level 1, louder than the level every station was promised.
    const calls = fakeAudio();
    withStorage({ "mms.kds.volume": "0.35" });
    const chime = new KdsChime();
    await chime.arm();
    calls.length = 0;
    chime.play("dinein");
    expect(calls).toStrictEqual(expectedCalls(DINEIN, 0.8));
    expect(KDS_DEFAULT_VOLUME).toBe(0.8);
  });
});

describe("the kitchen's mute — a predicate play() reads at every call (Phase 3d)", () => {
  it("⚠️ silences play() while the audio RUNS, and is re-read at every play", async () => {
    // MUTATION kds-sound/mute-still-plays: the predicate is never consulted — a muted kitchen keeps
    // ringing every arrival (its context stays running so unmuting needs no new gesture).
    const calls = fakeAudio();
    withStorage();
    let wanted = false;
    const chime = new KdsChime(() => wanted);
    expect(await chime.arm()).toBe(true);
    calls.length = 0;
    chime.play("dinein");
    expect(calls).toStrictEqual([]);
    wanted = true; // never captured: the next play hears the change
    chime.play("dinein");
    expect(calls).toStrictEqual(expectedCalls(DINEIN, 0.8));
  });

  it("⚠️ a chime built with no predicate PLAYS — the TV wall is never muted by the kitchen's store", async () => {
    // `ReadyBoard` shares this class and gates its own calls; on a TV the kitchen's flag is never set.
    // MUTATION kds-sound/tv-wall-muted-by-default: the default predicate answers false — the wall goes
    // silent on every device, the kitchen's included.
    const calls = fakeAudio();
    withStorage(); // the kitchen's flag is unset here, as on any TV
    expect(getKdsSoundWanted()).toBe(false);
    const chime = new KdsChime();
    await chime.arm();
    calls.length = 0;
    chime.play("pickup");
    expect(calls).toStrictEqual(expectedCalls(PICKUP, 0.8));
  });

  it("⚠️ does not even READ the predicate before the shift-start arm", () => {
    // A ticket landing on an un-armed station must cost nothing to discover there is nothing to
    // play. `armed` is checked ahead of the preference read for that reason.
    const calls = fakeAudio();
    const wanted = vi.fn(() => true);
    const chime = new KdsChime(wanted);
    chime.play("dinein");
    expect(calls).toStrictEqual([]);
    expect(wanted).not.toHaveBeenCalled();
  });
});

describe("getKdsSoundWanted / setKdsSoundWanted — the per-device answer", () => {
  it("round-trips through the store, and a cleared answer reads no", () => {
    const store = withStorage();
    expect(getKdsSoundWanted()).toBe(false);
    setKdsSoundWanted(true);
    expect(store.setItem).toHaveBeenCalledWith("mms.kds.sound", "1");
    expect(getKdsSoundWanted()).toBe(true);
    setKdsSoundWanted(false);
    expect(store.removeItem).toHaveBeenCalledWith("mms.kds.sound");
    expect(getKdsSoundWanted()).toBe(false);
  });

  it("a store that refuses still holds THIS document's tap", () => {
    // Private mode: the write throws. Without the fallback the arm succeeded and the mute predicate
    // read false at once — a board saying "Sound on" that never made one. MUTATION
    // kds-sound/private-mode-forgets-the-tap: the fallback is never set.
    blockedStorage();
    expect(getKdsSoundWanted()).toBe(false); // a broken store is not consent
    setKdsSoundWanted(true);
    expect(getKdsSoundWanted()).toBe(true);
    setKdsSoundWanted(false);
    expect(getKdsSoundWanted()).toBe(false);
  });
});

describe("armWithin — the circle's arm, bounded (Phase 3d)", () => {
  it("answers true when the context runs", async () => {
    fakeAudio();
    expect(await new KdsChime().armWithin()).toBe(true);
  });

  it("frees at the bound when the browser leaves the resume PENDING", async () => {
    // A resume the browser does not allow neither resolves nor rejects. MUTATION
    // kds-sound/arm-unbounded: the bare `engine.arm()` — the circle stays busy forever.
    vi.useFakeTimers();
    class PendingContext {
      state: AudioContextState = "suspended";
      currentTime = 0;
      destination = {};
      resume() {
        return new Promise<void>(() => {}); // never settles
      }
    }
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: PendingContext,
    });
    let answer: boolean | undefined;
    void new KdsChime().armWithin().then((ok) => {
      answer = ok;
    });
    await vi.advanceTimersByTimeAsync(ARM_TIMEOUT_MS - 1);
    expect(answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(answer).toBe(false);
  });
});

describe("KdsChime — the ticket chime is what it was before M90", () => {
  it("⚠️ emits the dine-in tone at the fixed level, note for note", async () => {
    const calls = fakeAudio();
    withStorage();
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
    withStorage();
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
    withStorage();
    const chime = new KdsChime();
    await chime.arm();
    calls.length = 0;
    chime.play("dinein", true);
    expect(calls).toStrictEqual(expectedCalls(DINEIN, 0.8 * SOFT_LEVEL));
    expect(SOFT_LEVEL).toBe(0.4);
  });
});
