import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chimeSchedule } from "./chime-core";
import { ARM_TIMEOUT_MS, COUNTER_LEVEL, COUNTER_SOUND_KEY, COUNTER_TONES } from "./counter-chime";

/**
 * Phase 2d · bell — the plumbing's promises: the arm is bounded, it asks for the `playback` session,
 * a ring plays only on a running context at the counter's level, and the wanted store fails to NO.
 * The module is a singleton, so every case imports a FRESH copy.
 */

type Ctx = { state: AudioContextState; resumed: number };
const made: Ctx[] = [];
const freqs: number[] = [];
const peaks: number[] = [];

/** `resume` decides the context's fate: run, stay suspended, or hang (never settle). */
function fakeAudio(resume: "run" | "refuse" | "hang") {
  made.length = 0;
  freqs.length = 0;
  peaks.length = 0;
  class FakeCtx extends EventTarget {
    state: AudioContextState = "suspended";
    resumed = 0;
    currentTime = 3;
    destination = {};
    constructor() {
      super();
      made.push(this);
    }
    resume(): Promise<void> {
      this.resumed += 1;
      if (resume === "hang") return new Promise(() => {});
      if (resume === "run") this.state = "running";
      return Promise.resolve();
    }
    createOscillator() {
      return {
        type: "",
        frequency: {
          set value(v: number) {
            freqs.push(v);
          },
        },
        connect: (d: unknown) => d,
        start() {},
        stop() {},
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime: (v: number) => peaks.push(v),
        },
        connect: (d: unknown) => d,
      };
    }
  }
  vi.stubGlobal("AudioContext", FakeCtx);
}

function fakeStore(opts: { throws?: "get" | "set" | "getter" } = {}) {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => {
      if (opts.throws === "get") throw new Error("SecurityError");
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.throws === "set") throw new Error("QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k: string) => {
      if (opts.throws === "set") throw new Error("QuotaExceededError");
      data.delete(k);
    },
  };
  const target = new EventTarget();
  const win = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  } as Record<string, unknown>;
  if (opts.throws === "getter")
    Object.defineProperty(win, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
  else win.localStorage = store;
  vi.stubGlobal("window", win);
  return { data, win };
}

const fresh = async () => {
  vi.resetModules();
  return import("./counter-sound");
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("armWithin — bounded, and inside the gesture", () => {
  it("starts the resume SYNCHRONOUSLY (the gesture's turn), and answers true once running", async () => {
    fakeAudio("run");
    const s = await fresh();
    const p = s.armWithin();
    // Before any await: the context exists and resume() was called in this same turn.
    expect(made).toHaveLength(1);
    expect(made[0]!.resumed).toBe(1);
    expect(await p).toBe(true);
    expect(s.counterArmed()).toBe(true);
  });

  it("a resume that never settles reads as NOT armed at the timeout — never busy forever", async () => {
    // MUTATION (counter-sound/the-arm-has-no-timeout): `return engine.arm()` — the chip waits on a
    // promise that never settles, busy and untappable for the rest of the shift.
    fakeAudio("hang");
    const s = await fresh();
    let answer: boolean | undefined;
    void s.armWithin().then((v) => (answer = v));
    await vi.advanceTimersByTimeAsync(ARM_TIMEOUT_MS - 1);
    expect(answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(answer).toBe(false);
    expect(s.counterArmed()).toBe(false);
  });

  it("a refused resume (the context stays suspended) answers false", async () => {
    fakeAudio("refuse");
    const s = await fresh();
    expect(await s.armWithin()).toBe(false);
  });

  it("asks for the 'playback' audio session where the browser has one, so the silent switch cannot mute it", async () => {
    // MUTATION (counter-sound/the-silent-switch-mutes-the-bell): skip the session — on an iPad with
    // the ringer switch on silent the bell reads "Sound on" and makes no sound.
    fakeAudio("run");
    const session = { type: "auto" };
    vi.stubGlobal("navigator", { audioSession: session });
    const s = await fresh();
    await s.armWithin();
    expect(session.type).toBe("playback");
  });

  it("a browser without the API, or one whose session throws, still arms", async () => {
    fakeAudio("run");
    vi.stubGlobal("navigator", {});
    let s = await fresh();
    expect(await s.armWithin()).toBe(true);
    fakeAudio("run");
    vi.stubGlobal("navigator", {
      get audioSession() {
        throw new Error("quirk");
      },
    });
    s = await fresh();
    expect(await s.armWithin()).toBe(true);
  });
});

describe("playCounter — only a running context, at the counter's level", () => {
  it("plays nothing before the arm", async () => {
    fakeAudio("run");
    const s = await fresh();
    s.playCounter("guest");
    expect(freqs).toEqual([]);
  });

  it("plays the phrase at COUNTER_LEVEL once armed, and nothing once the context is suspended", async () => {
    fakeAudio("run");
    const s = await fresh();
    await s.armWithin();
    s.playCounter("food");
    expect(freqs).toEqual(COUNTER_TONES.food.map((n) => n.freq));
    // Every note's peak is the counter's level, as the shared envelope computes it.
    const expectedPeaks = chimeSchedule(COUNTER_TONES.food, COUNTER_LEVEL, 0).map((n) => n.peak);
    expect(peaks.filter((_, i) => i % 2 === 0)).toEqual(expectedPeaks);
    freqs.length = 0;
    made[0]!.state = "suspended";
    s.playCounter("guest");
    expect(freqs).toEqual([]);
  });

  it("subscribeCounterArmed hears the context move", async () => {
    fakeAudio("run");
    const s = await fresh();
    const seen: boolean[] = [];
    s.subscribeCounterArmed(() => seen.push(s.counterArmed()));
    await s.armWithin();
    expect(seen.at(-1)).toBe(true);
    made[0]!.state = "suspended";
    (made[0] as unknown as EventTarget).dispatchEvent(new Event("statechange"));
    expect(seen.at(-1)).toBe(false);
  });
});

describe("the wanted store — a broken store is not consent", () => {
  it("unset reads false; set/unset round-trips and tells the subscribers", async () => {
    const { data } = fakeStore();
    const s = await fresh();
    expect(s.getCounterWanted()).toBe(false);
    let calls = 0;
    const off = s.subscribeCounterWanted(() => calls++);
    s.setCounterWanted(true);
    expect(data.get(COUNTER_SOUND_KEY)).toBe("1");
    expect(s.getCounterWanted()).toBe(true);
    s.setCounterWanted(false);
    expect(data.has(COUNTER_SOUND_KEY)).toBe(false);
    expect(s.getCounterWanted()).toBe(false);
    expect(calls).toBe(2);
    off();
    s.setCounterWanted(true);
    expect(calls).toBe(2);
  });

  it("a store whose read throws — or whose GETTER throws — reads false", async () => {
    // MUTATION (counter-sound/a-broken-store-is-consent): the catch answers true.
    fakeStore({ throws: "get" });
    expect((await fresh()).getCounterWanted()).toBe(false);
    fakeStore({ throws: "getter" });
    expect((await fresh()).getCounterWanted()).toBe(false);
  });

  it("a store that refuses the WRITE still holds the tap for this session", async () => {
    fakeStore({ throws: "set" });
    const s = await fresh();
    s.setCounterWanted(true);
    expect(s.getCounterWanted()).toBe(true);
    s.setCounterWanted(false);
    expect(s.getCounterWanted()).toBe(false);
  });

  it("another tab's change is heard through `storage`", async () => {
    const { win } = fakeStore();
    const s = await fresh();
    let calls = 0;
    s.subscribeCounterWanted(() => calls++);
    (win.dispatchEvent as (e: Event) => boolean)(new Event("storage"));
    expect(calls).toBe(1);
  });
});
