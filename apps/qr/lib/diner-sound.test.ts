import { afterEach, describe, expect, it, vi } from "vitest";
import { CHIME, CHIME_LEVEL, SOUND_KEY } from "./chime";
import { chimeSchedule } from "./chime-core";
import { isSoundOn, setSoundOn, subscribeSound } from "./diner-sound";

/**
 * W22f — the preference READ and WRITE, which is the half of the engine that is testable.
 *
 * `chime.ts` next door owns the policy and carries the mutants; the WebAudio side needs a real
 * browser and has none of these. What is covered here is everything that decides whether the switch
 * and the engine agree with each other, and both cases below were found by adversarial review.
 */

const realWindow = Reflect.getOwnPropertyDescriptor(globalThis, "window");

/** Install a `window` whose `localStorage` behaves however the case needs. */
function withWindow(storage: () => unknown) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.defineProperty({}, "localStorage", { configurable: true, get: storage }),
  });
}

afterEach(() => {
  if (realWindow) Object.defineProperty(globalThis, "window", realWindow);
  else Reflect.deleteProperty(globalThis, "window");
  // Reset the in-memory override by writing successfully through a working store.
  withWindow(() => ({ getItem: () => null, setItem: () => {} }));
  setSoundOn(false);
  if (realWindow) Object.defineProperty(globalThis, "window", realWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("isSoundOn — the read fails to silence, whatever the browser does", () => {
  it("⚠️ survives a `localStorage` PROPERTY GETTER that throws", () => {
    // The shape a stub store object cannot express, and the one that actually ships: with all site
    // data blocked (and in some partitioned frames) `window.localStorage` throws SecurityError on the
    // ACCESS, before any method is called — so `soundEnabled`'s own try/catch is too late. This is
    // `useSyncExternalStore`'s getSnapshot, so an escaping throw takes /account to the error boundary
    // instead of failing to OFF like every other arm of rule 1.
    withWindow(() => {
      throw new Error("SecurityError");
    });
    expect(isSoundOn()).toBe(false);
  });

  it("answers false with no window at all (the server snapshot's own path)", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(isSoundOn()).toBe(false);
  });

  it("reads the exact opt-in value through a working store", () => {
    withWindow(() => ({
      getItem: (k: string) => (k === SOUND_KEY ? "1" : null),
      setItem: () => {},
    }));
    expect(isSoundOn()).toBe(true);
  });
});

describe("setSoundOn — a preference the store refuses is still a preference", () => {
  it("⚠️ keeps the choice for THIS session when `setItem` throws", () => {
    // Private mode. The swallow is deliberate and its stated justification is that "the toggle still
    // works for this session" — which was FALSE before review: every read went straight back to the
    // store, so the switch snapped to OFF and nothing sounded. The in-memory override is what makes
    // the sentence true.
    withWindow(() => ({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    }));
    setSoundOn(true);
    expect(isSoundOn()).toBe(true);
  });

  it("hands authority back to the store once a write succeeds", () => {
    let stored: string | null = null;
    withWindow(() => ({
      getItem: () => stored,
      setItem: (_k: string, v: string) => {
        stored = v;
      },
    }));
    setSoundOn(true);
    expect(isSoundOn()).toBe(true);
    setSoundOn(false);
    expect(isSoundOn()).toBe(false);
  });

  it("notifies subscribers so a second surface cannot show a stale switch", () => {
    const seen = vi.fn();
    withWindow(() => ({
      getItem: () => null,
      setItem: () => {},
      // `subscribeSound` also attaches a `storage` listener to window.
    }));
    Object.assign(window, { addEventListener: () => {}, removeEventListener: () => {} });
    const off = subscribeSound(seen);
    setSoundOn(true);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    setSoundOn(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

/**
 * M90 — the play path, finally testable.
 *
 * W22f could only cover the preference: the engine held its own AudioContext inline, so there was no
 * seam a node runner could reach. Routing through `chime-core` created one, and these are the rules
 * `chime.ts` states but nothing could previously check — that the gate is re-read at play time, and
 * that a diner moment is the diner's LEVEL and the diner's NOTES, not the kitchen's.
 */

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

/** Frequencies only — the timing is pinned note-for-note by `chime-core.test.ts`. */
const freqs = (calls: Call[]) => calls.filter((c) => c[0] === "osc.freq").map((c) => c[1]);

/**
 * A FRESH module per case.
 *
 * `diner-sound` holds one `ChimeEngine` at module scope, and `arm()` is `this.ctx ??= …` — so the
 * engine keeps whichever fake context armed it FIRST, for the life of the module. Re-importing is
 * what makes each case's recording array reachable at all: without it the second and third cases
 * assert `[]` against an array nothing could ever write to, and pass no matter what the code does.
 * That is not hypothetical — the first draft of this block did exactly that, and two mutations
 * (dropping the gate entirely; collapsing `enabled` into `armed`) survived it green.
 */
async function freshModule() {
  vi.resetModules();
  return import("./diner-sound");
}

describe("chime — the gate is re-read at the moment of play", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "AudioContext");
  });

  it("⚠️ plays the diner's OWN notes, at the diner's OWN level", async () => {
    const calls = fakeAudio();
    withWindow(() => ({ getItem: () => "1", setItem: () => {} }));
    const { armSound, chime } = await freshModule();
    expect(await armSound()).toBe(true);
    calls.length = 0;
    chime("sent");
    // The whole vocabulary, and the level `chime.ts` chose for a phone at a table with other people
    // at it — not the kitchen's 0.8, which is a working device in a loud room.
    expect(freqs(calls)).toStrictEqual(CHIME.sent.map((n) => n.freq));
    expect(calls).toStrictEqual(
      chimeSchedule(CHIME.sent, CHIME_LEVEL, 5).flatMap((s): Call[] => [
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
      ]),
    );
  });

  it("⚠️ is SILENT when the preference is off, even with a live armed context", async () => {
    // Rule 1, at play time rather than at arm time: the diner may have turned sound off in another
    // tab since. A preference is only meaningful at the instant it is acted on.
    const calls = fakeAudio();
    withWindow(() => ({ getItem: () => "1", setItem: () => {} }));
    const { armSound, chime, soundArmed } = await freshModule();
    await armSound();
    expect(soundArmed()).toBe(true); // the context is live — only the preference changed
    withWindow(() => ({ getItem: () => "0", setItem: () => {} }));
    calls.length = 0;
    chime("paid");
    expect(calls).toStrictEqual([]);
  });

  it("⚠️ is SILENT when the preference is on but nothing was ever armed", async () => {
    // The other half of `mayChime`, and the reason it takes two booleans: a diner can have sound ON
    // from a previous session while THIS document never got a gesture. Notes scheduled into a
    // context that is not running are played whenever it eventually resumes — a bell minutes late,
    // for an order already eaten. Collapsing `enabled` and `armed` into one flag loses exactly this.
    const calls = fakeAudio();
    withWindow(() => ({ getItem: () => "1", setItem: () => {} }));
    const { chime, soundArmed } = await freshModule();
    expect(soundArmed()).toBe(false);
    chime("sent");
    expect(calls).toStrictEqual([]);
  });

  it("⚠️ never throws out of a send or a payment when the audio stack refuses", async () => {
    // The two callers are `SendToKitchenButton` and `PaySuccess`. Sound is garnish; a throw escaping
    // here would break the one interaction a guest cannot retry cheaply.
    //
    // The throw has to come from INSIDE the gate to prove anything: a store that throws is already
    // caught by `isSoundOn`, so a preference-side failure exercises that guard and not this one. A
    // context that arms and then refuses to build nodes is the shape that reaches `chime`'s own
    // try/catch — and the first draft of this case used the store, which meant removing the
    // try/catch entirely left it green.
    const destination = {};
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: class {
        state = "running";
        currentTime = 5;
        destination = destination;
        async resume() {}
        createOscillator(): never {
          throw new Error("audio hardware went away");
        }
        createGain(): never {
          throw new Error("audio hardware went away");
        }
      },
    });
    withWindow(() => ({ getItem: () => "1", setItem: () => {} }));
    const { armSound, chime, soundArmed } = await freshModule();
    await armSound();
    expect(soundArmed()).toBe(true); // armed, so the gate passes and the throw really is reached
    expect(() => chime("sent")).not.toThrow();
    expect(() => chime("paid")).not.toThrow();
  });
});
