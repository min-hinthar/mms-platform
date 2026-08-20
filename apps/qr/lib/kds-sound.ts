"use client";
import { ChimeEngine, type ChimeNote } from "./chime-core";

/**
 * W3c (O-C): the KDS chime — synthesized WebAudio tones, no audio assets to load or cache-miss
 * mid-rush. Browsers gate audio behind a user gesture, so the engine stays dormant until arm() runs
 * inside a tap ("Enable sound" at shift start); volume + mute persist per device (localStorage).
 *
 * Distinct tones per channel (Fresh's per-event sounds): dine-in = a two-note mid "ding-dong"; pickup/
 * scango = a brighter three-note rise — that customer is standing at the counter, the cook should hear
 * WHICH kind of work landed without looking. The re-chime (a ticket sitting un-started) reuses the
 * channel tone at a lower volume so it nags without startling.
 *
 * **M90** moved the synthesis into `chime-core.ts`, shared with the diner's chime. What stayed here is
 * everything the kitchen decides for itself: the tone vocabulary, the 0.8 default, the `soft` re-chime
 * level, and the persisted per-device volume. The diner's policy inverts on every one of those axes
 * (`chime.ts` has the table), so the two policies are still two files — only the oscillator plumbing
 * is one. `KdsChime`'s surface (`arm` · `armed` · `play(channel, soft)`) is unchanged, so no KDS
 * caller was touched by that move.
 */

const VOLUME_KEY = "mms.kds.volume"; // 0..1, persisted per device

const TONES: Record<"dinein" | "pickup", ChimeNote[]> = {
  dinein: [
    { freq: 660, at: 0, dur: 0.18 },
    { freq: 880, at: 0.2, dur: 0.26 },
  ],
  pickup: [
    { freq: 784, at: 0, dur: 0.14 },
    { freq: 988, at: 0.16, dur: 0.14 },
    { freq: 1175, at: 0.32, dur: 0.3 },
  ],
};

/** The re-chime multiplier — the 60–90s un-started nag plays the same tone at this fraction. */
export const SOFT_LEVEL = 0.4;

/** Loud by default (SPEC-KDS §3) — a cook must hear a ticket land across a hot line. */
export const KDS_DEFAULT_VOLUME = 0.8;

export class KdsChime {
  private engine = new ChimeEngine();

  /** Must be called from a user gesture (the "Enable sound" tap) — creates/resumes the AudioContext. */
  arm(): Promise<boolean> {
    // A device with no audio answers false; the visual channel (flash + pill) still covers O-C.
    return this.engine.arm();
  }

  get armed(): boolean {
    return this.engine.armed;
  }

  /** Play the channel's tone. `soft` halves the level (the 60–90s un-started re-chime). */
  play(channel: "dinein" | "pickup" | "scango", soft = false): void {
    // Before the preference read, not after: an un-armed station is the common case at shift start,
    // and a ticket landing must not cost a localStorage hit to discover there is nothing to play.
    if (!this.engine.armed) return;
    const level = getKdsVolume() * (soft ? SOFT_LEVEL : 1);
    // A muted station costs nothing: `chimeSchedule` returns an empty schedule at or below zero.
    this.engine.play(TONES[channel === "dinein" ? "dinein" : "pickup"], level);
  }
}

export function getKdsVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const v = raw == null ? NaN : Number(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : KDS_DEFAULT_VOLUME;
  } catch {
    return KDS_DEFAULT_VOLUME;
  }
}

export function setKdsVolume(v: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, v))));
  } catch {
    /* private mode — volume just doesn't persist */
  }
}
