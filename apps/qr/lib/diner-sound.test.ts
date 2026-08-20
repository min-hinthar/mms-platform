import { afterEach, describe, expect, it, vi } from "vitest";
import { SOUND_KEY } from "./chime";
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
