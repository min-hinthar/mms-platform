import { afterEach, describe, expect, it } from "vitest";
import { CHIME, CHIME_LEVEL } from "./chime";
import type { ChimeNote } from "./chime-core";
import {
  COUNTER_LEVEL,
  COUNTER_SOUND_KEY,
  COUNTER_TONES,
  soundPosture,
  soundTapIntent,
  soundWord,
} from "./counter-chime";
import { STAFF } from "./i18n/staff";
import { KDS_DEFAULT_VOLUME, KdsChime } from "./kds-sound";

/**
 * Phase 2d · bell — the counter bell's policy (§15 "shared engine, split policy"). Each rule has a
 * verify:slice mutant (`counter-chime/…`) that turns this suite red.
 */

/**
 * The KITCHEN's phrases, as frequencies, heard off the real `KdsChime` through a recording context —
 * never restated here (the kitchen's tone table is module-private, and a transcription would prove
 * the typist, not the module).
 */
async function kitchenPhrases(): Promise<Record<"dinein" | "pickup", number[]>> {
  let freqs: number[] = [];
  class Ctx {
    state: AudioContextState = "running";
    currentTime = 0;
    destination = {};
    async resume() {}
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
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: (d: unknown) => d,
      };
    }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Ctx });
  const k = new KdsChime();
  await k.arm();
  k.play("dinein");
  const dinein = freqs;
  freqs = [];
  k.play("pickup");
  return { dinein, pickup: freqs };
}
afterEach(() => {
  Reflect.deleteProperty(globalThis, "AudioContext");
});

const pitches = (n: readonly ChimeNote[]) => n.map((x) => x.freq);

describe("COUNTER_TONES — two phrases the counter tells apart without looking", () => {
  it("guest and food differ from each other and from every kitchen and diner phrase", async () => {
    const kds = await kitchenPhrases();
    // The recording really heard the kitchen (a silent fake would make every comparison vacuous).
    expect(kds.dinein.length).toBeGreaterThan(1);
    expect(kds.pickup.length).toBeGreaterThan(1);
    const others = [kds.dinein, kds.pickup, pitches(CHIME.sent), pitches(CHIME.paid)];
    const guest = pitches(COUNTER_TONES.guest);
    const food = pitches(COUNTER_TONES.food);
    expect(guest).not.toEqual(food);
    for (const o of others) {
      expect(guest).not.toEqual(o);
      expect(food).not.toEqual(o);
    }
    // …and each opens on a pitch no other phrase in the app opens on: the attack is what the ear
    // catches across a room.
    const openers = others.map((o) => o[0]);
    expect(openers).not.toContain(guest[0]);
    expect(openers).not.toContain(food[0]);
    expect(guest[0]).not.toBe(food[0]);
  });

  it("every note is a real, ordered, positive-length note", () => {
    for (const phrase of Object.values(COUNTER_TONES)) {
      expect(phrase.length).toBeGreaterThan(0);
      let prevAt = -1;
      for (const n of phrase) {
        expect(n.freq).toBeGreaterThan(0);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.at).toBeGreaterThan(prevAt);
        prevAt = n.at;
      }
    }
  });
});

describe("COUNTER_LEVEL — a working device in a dining room", () => {
  it("is louder than a guest's phone and quieter than a hot line", () => {
    // MUTATION (counter-chime/the-counter-as-loud-as-the-kitchen): 0.8 — the bell announces every
    // pickup to the whole room at the kitchen's volume.
    expect(COUNTER_LEVEL).toBeGreaterThan(CHIME_LEVEL);
    expect(COUNTER_LEVEL).toBeLessThan(KDS_DEFAULT_VOLUME);
  });

  it("keeps its own per-device key, never the kitchen's or the diner's", () => {
    expect(COUNTER_SOUND_KEY).not.toBe("mms.kds.sound");
    expect(COUNTER_SOUND_KEY).not.toBe("mms.sound");
  });
});

describe("soundPosture / soundTapIntent — wanted and armed are two facts (§15)", () => {
  it("off when nobody asked, on only when the context runs, paused in between", () => {
    // MUTATION (counter-chime/paused-reads-as-on): `armed` ignored — a slept tablet's chip reads
    // "Sound on" while every ring lands silent.
    expect(soundPosture(true, false)).toBe("paused");
    expect(soundPosture(true, true)).toBe("on");
    // MUTATION (counter-chime/an-unwanted-bell-rings): drop the `wanted` arm — a context left
    // running after a mute reads "on" and the bell keeps ringing.
    expect(soundPosture(false, true)).toBe("off");
    expect(soundPosture(false, false)).toBe("off");
  });

  it("a tap mutes only when ON; off and paused both arm", () => {
    // MUTATION (counter-chime/a-paused-tap-mutes): `posture === "off" ? "arm" : "mute"` — the warn
    // chip's "tap to turn on" turns the bell OFF.
    expect(soundTapIntent("on")).toBe("mute");
    expect(soundTapIntent("off")).toBe("arm");
    expect(soundTapIntent("paused")).toBe("arm");
  });

  it("the word each posture says — one map for the counter's chip and the kitchen's circle (Phase 3d)", () => {
    // MUTATION (counter-chime/paused-says-turn-on): the paused arm says "Turn on sound" — a control
    // that LOST wanted sound reads exactly like one nobody ever asked for, and on the kitchen's
    // icon-only circle the word is the only thing (beside the dot) telling the two apart.
    expect(soundWord("on")).toBe("board.sound.on");
    expect(soundWord("paused")).toBe("kds.sound.off");
    expect(soundWord("off")).toBe("kds.sound.enable");
    // Three postures, three different words, every one in the dictionary.
    const words = (["on", "paused", "off"] as const).map(soundWord);
    expect(new Set(words.map((k) => STAFF[k].en)).size).toBe(3);
  });
});
