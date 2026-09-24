import { describe, expect, it } from "vitest";
import { celebrationStorageKey, hasCelebrated, markCelebrated } from "./celebration-latch";

/** A real-enough Storage: a Map behind the two methods the latch uses. */
function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe("the celebration latch — a resume is not an arrival", () => {
  it("a marked payment reads as celebrated; a different payment does not", () => {
    // MUTATION: a key that ignores its argument (`mms.celebrated`) — one payment's celebration
    // would silence the next payment in the same tab; the second assertion goes red.
    const store = memoryStore();
    markCelebrated(store, "pi_A");
    expect(hasCelebrated(store, "pi_A")).toBe(true);
    expect(hasCelebrated(store, "pi_B")).toBe(false);
  });

  it("nothing is celebrated until it is marked", () => {
    expect(hasCelebrated(memoryStore(), "pi_A")).toBe(false);
  });

  it("the key is namespaced per payment", () => {
    expect(celebrationStorageKey("pi_A")).toBe("mms.celebrated:pi_A");
    expect(celebrationStorageKey("pi_A")).not.toBe(celebrationStorageKey("pi_B"));
  });

  it("a throwing store fails toward 'not celebrated' and never throws", () => {
    // MUTATION: drop either try/catch — a blocked store would throw into the success screen; red.
    const hostile = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => markCelebrated(hostile, "pi_A")).not.toThrow();
    expect(hasCelebrated(hostile, "pi_A")).toBe(false);
  });

  it("no store at all (SSR) reads as not celebrated", () => {
    expect(hasCelebrated(null, "pi_A")).toBe(false);
    expect(() => markCelebrated(null, "pi_A")).not.toThrow();
  });
});
