import type { ChimeNote } from "./chime-core";
import type { CounterRingKind } from "./counter-attention";

/**
 * Phase 2d · bell — the counter bell's POLICY: its two phrases, its level, and the chip's postures.
 * Pure, so every rule is falsified by a value; `counter-sound.ts` is the WebAudio plumbing.
 *
 * A third policy beside the kitchen's (`kds-sound.ts`) and the diner's (`chime.ts`), and it inverts
 * each of them on at least one axis (§15 "shared engine, split policy"):
 *
 *   · level — 0.6: a working device, so louder than a guest's phone (0.22), but it sits in the
 *     DINING ROOM, so quieter than a hot line's 0.8. Fixed: the device's own volume buttons are the
 *     dial (owner decision 5c) — and since Phase 3d the kitchen's level is fixed the same way (its
 *     slider is retired);
 *   · arming — an explicit tap, like the kitchen (a working device, a shift start), never the
 *     diner's "the toggle is the gesture";
 *   · vocabulary — two phrases, each opening on a pitch no other phrase in the app opens on, so the
 *     counter hears WHICH kind of attention is wanted without looking;
 *   · nagging — none. A guest still waiting after the ring gets no second bell (owner decision 5c):
 *     a front-of-house device that nags is noise every diner hears too.
 *
 * Never on an error path (§15), and no haptic rides a ring: a bell is for someone across the room,
 * and the device in their pocket is not the one ringing.
 */

/**
 * The two phrases.
 *   guest — E6 twice, a doorbell: somebody is at the counter (an ask, an arrival, a basket).
 *   food  — D6 falling to A5, a kitchen's "order up": a to-go bag is ready to bag.
 */
export const COUNTER_TONES: Readonly<Record<CounterRingKind, readonly ChimeNote[]>> = {
  guest: [
    { freq: 1319, at: 0, dur: 0.14 },
    { freq: 1319, at: 0.18, dur: 0.32 },
  ],
  food: [
    { freq: 1175, at: 0, dur: 0.16 },
    { freq: 880, at: 0.18, dur: 0.34 },
  ],
};

/** The counter's fixed level. ⚠️ Spec starting value, unmeasured in the real dining room (no
 *  device here) — OPEN-ITEMS row. */
export const COUNTER_LEVEL = 0.6;

/** The per-device "the counter wanted sound" flag. Its own key: the kitchen's `mms.kds.sound` is a
 *  different device's answer, and one browser can hold both screens. */
export const COUNTER_SOUND_KEY = "mms.counter.sound";

/**
 * How long a chip tap waits for the audio context to start before it says the device refused. A
 * resume the browser does not allow stays PENDING (it neither resolves nor rejects until some later
 * activation), so an unbounded wait would leave the chip busy forever. ⚠️ Spec starting value,
 * unmeasured on a device — OPEN-ITEMS row.
 */
export const ARM_TIMEOUT_MS = 1500;

/** How long the post-arm "Didn't hear it?" hint stays under the chip. Spec starting value. */
export const SOUND_HINT_MS = 8000;

/**
 * The chip's three postures (§15: "wanted" and "armed" are two facts and neither implies the other).
 *   off    — nobody asked for sound on this device (or they muted it);
 *   on     — wanted, and the context is RUNNING: a ring will sound;
 *   paused — wanted, but the context is not running (a reload, a slept tablet, a phone call): the
 *            chip says so in warn and the next tap anywhere re-arms it. Reading this as `on` is the
 *            chip claiming a bell nothing can ring.
 */
export type SoundPosture = "off" | "on" | "paused";

export function soundPosture(wanted: boolean, armed: boolean): SoundPosture {
  if (!wanted) return "off";
  return armed ? "on" : "paused";
}

/** What a chip tap does: `on` mutes; `off` and `paused` both ARM (a paused chip's tap is the way
 *  back to sound, never a second mute). */
export function soundTapIntent(posture: SoundPosture): "arm" | "mute" {
  return posture === "on" ? "mute" : "arm";
}

/**
 * Phase 3d — the word each posture says, named ONCE for both sound controls (the counter's chip,
 * where it is the visible label, and the kitchen's bar circle, where it is the sr-only name). "One
 * word per action" (§17): the OFF word is the same "turn on" the paused posture says, and a paused
 * control must never read like a fresh one — it is WANTED sound the device lost.
 */
export function soundWord(
  posture: SoundPosture,
): "board.sound.on" | "kds.sound.off" | "kds.sound.enable" {
  return posture === "on"
    ? "board.sound.on"
    : posture === "paused"
      ? "kds.sound.off"
      : "kds.sound.enable";
}
