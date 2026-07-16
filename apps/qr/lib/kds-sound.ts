"use client";

/**
 * W3c (O-C): the KDS chime engine — synthesized WebAudio tones, no audio assets to load or cache-miss
 * mid-rush. Browsers gate audio behind a user gesture, so the engine stays dormant until arm() runs
 * inside a tap ("Enable sound" at shift start); volume + mute persist per device (localStorage).
 *
 * Distinct tones per channel (Fresh's per-event sounds): dine-in = a two-note mid "ding-dong"; pickup/
 * scango = a brighter three-note rise — that customer is standing at the counter, the cook should hear
 * WHICH kind of work landed without looking. The re-chime (a ticket sitting un-started) reuses the
 * channel tone at a lower volume so it nags without startling.
 */

const VOLUME_KEY = "mms.kds.volume"; // 0..1, persisted per device

type Note = { freq: number; at: number; dur: number };

const TONES: Record<"dinein" | "pickup", Note[]> = {
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

export class KdsChime {
  private ctx: AudioContext | null = null;

  /** Must be called from a user gesture (the "Enable sound" tap) — creates/resumes the AudioContext. */
  async arm(): Promise<boolean> {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx.state === "running";
    } catch {
      return false; // no audio on this device — the visual channel (flash + pill) still covers O-C
    }
  }

  get armed(): boolean {
    return this.ctx?.state === "running";
  }

  /** Play the channel's tone. `soft` halves the level (the 60–90s un-started re-chime). */
  play(channel: "dinein" | "pickup" | "scango", soft = false): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const level = getKdsVolume() * (soft ? 0.4 : 1);
    if (level <= 0) return;
    const notes = TONES[channel === "dinein" ? "dinein" : "pickup"];
    const t0 = ctx.currentTime + 0.02;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      // A fast attack + exponential release reads as a soft mallet, not a buzzer.
      gain.gain.setValueAtTime(0.0001, t0 + n.at);
      gain.gain.exponentialRampToValueAtTime(Math.max(level, 0.001), t0 + n.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.dur + 0.05);
    }
  }
}

export function getKdsVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const v = raw == null ? NaN : Number(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8; // loud by default (SPEC-KDS §3)
  } catch {
    return 0.8;
  }
}

export function setKdsVolume(v: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, v))));
  } catch {
    /* private mode — volume just doesn't persist */
  }
}
