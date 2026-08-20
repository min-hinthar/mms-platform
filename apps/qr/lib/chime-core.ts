"use client";
/**
 * M90 — the one chime engine, and the one envelope.
 *
 * `"use client"` even though nothing here evaluates at import time: `AudioContext` is a browser
 * global, and the directive is what makes "a server component must never import this" a compiler
 * rule rather than a convention nobody wrote down. Both callers already carry it.
 *
 * `kds-sound.ts` (W3c) and `diner-sound.ts` (W22f) each synthesized tones with the same fast-attack /
 * exponential-release mallet shape, ~15 duplicated lines apart. W22f filed this rather than doing it,
 * because converting the KITCHEN's chime inside a diner-facing slice would have risked the cook's
 * ticket sound for a nice-to-have. On its own, with the KDS behaviour pinned, it is safe.
 *
 * ── What is shared and what is NOT ───────────────────────────────────────────────────────────────
 *
 * Shared: creating and resuming the AudioContext, and turning a list of notes into oscillator +
 * gain-ramp calls. That is plumbing, and one copy of it is better than two.
 *
 * NOT shared, and deliberately: the POLICY. Every axis inverts between the two callers — default
 * (0.8 loud versus OFF), arming (an explicit "Enable sound" tap at shift start versus the preference
 * toggle being the gesture), what a failure costs (the visual channel still covers a ticket; a diner
 * loses garnish), and the vocabulary itself. `chime.ts` owns the diner's rules and `kds-sound.ts`
 * keeps the kitchen's; this file knows none of them.
 *
 * ── Why the schedule is a PURE function ──────────────────────────────────────────────────────────
 *
 * The envelope is the thing a refactor can silently change — a ramp target, a start offset, the tail
 * on `stop()` — and none of it is observable from any test in this repo, because WebAudio needs a
 * browser and there is no DOM runner here. `chimeSchedule` turns the envelope into a value, so the
 * numbers this refactor claims to preserve are asserted rather than hoped for. `ChimeEngine.play`
 * then does nothing but apply them.
 */

/** One scheduled note. `at` and `dur` are seconds relative to the start of the sequence. */
export type ChimeNote = { freq: number; at: number; dur: number };

/**
 * The one place the mallet envelope is written down.
 *
 * `START_PAD` keeps the first note just ahead of `currentTime`, so a note is never scheduled in the
 * past (which browsers play immediately, turning a two-note phrase into a chord). `ATTACK` is the
 * fast rise that makes it read as a struck bell rather than a buzzer. `FLOOR` exists because
 * `exponentialRampToValueAtTime` cannot ramp to or from zero. `TAIL` keeps the oscillator alive a
 * moment past the release so the ramp finishes before the node stops.
 *
 * `PEAK_FLOOR` is deliberately TEN TIMES `FLOOR`, and the two are separate constants rather than one:
 * the ramp starts at `FLOOR` and rises to the peak, so a peak equal to `FLOOR` is a ramp with no
 * direction — silence with a stop() scheduled after it. `kds-sound.ts` floored its peak at 0.001
 * while ramping from 0.0001, and that gap is the reason. Collapsing them into one number would be
 * the kind of "tidy" refactor that changes behaviour, which is exactly what M90 must not do.
 */
export const START_PAD = 0.02;
export const ATTACK = 0.02;
export const FLOOR = 0.0001;
export const PEAK_FLOOR = 0.001;
export const TAIL = 0.05;

/** What `play` will do to one oscillator, as data. Times are absolute (context clock). */
export type ScheduledNote = {
  freq: number;
  /** Gain is pinned to FLOOR here, then ramped. */
  startAt: number;
  /** The peak, reached `ATTACK` after `startAt`. */
  peak: number;
  peakAt: number;
  /** Back down to FLOOR — the release. */
  endAt: number;
  /** The oscillator stops here, `TAIL` after the release finishes. */
  stopAt: number;
};

/**
 * Turn a tone + a level + a clock reading into the exact schedule `play` will apply.
 *
 * Returns an empty schedule for a level at or below zero — a muted kitchen must cost nothing, and
 * ramping to zero would throw. A level ABOVE zero but below `PEAK_FLOOR` is raised to it rather than
 * dropped: the kitchen's volume slider can reach such a value, and the honest reading of a
 * barely-there setting is a real ramp rather than a silent one with a `stop()` still scheduled.
 * Not a claim that 0.001 is audible — it is −60 dBFS and effectively is not; it is only that the
 * ramp should still have a direction. Carried over verbatim from `kds-sound.ts`; the diner's fixed
 * 0.22 never reaches this branch.
 */
export function chimeSchedule(
  notes: readonly ChimeNote[],
  level: number,
  now: number,
): ScheduledNote[] {
  if (!(level > 0)) return [];
  const peak = Math.max(level, PEAK_FLOOR);
  const t0 = now + START_PAD;
  return notes.map((n) => ({
    freq: n.freq,
    startAt: t0 + n.at,
    peak,
    peakAt: t0 + n.at + ATTACK,
    endAt: t0 + n.at + n.dur,
    stopAt: t0 + n.at + n.dur + TAIL,
  }));
}

/**
 * The WebAudio side: one context, armed from a gesture, playing whatever schedule it is handed.
 *
 * Holds no preference and no vocabulary. Each caller owns its own instance, so the kitchen tablet and
 * a diner's phone never share arming state — they are different devices in every real deployment, and
 * on the one machine where they are not (a staff member checking the diner view) the two contexts are
 * independent, which is the honest behaviour.
 */
export class ChimeEngine {
  private ctx: AudioContext | null = null;

  /**
   * Create/resume the context. MUST be called synchronously from a user gesture — browsers create an
   * AudioContext `suspended` and only resume from a real interaction, strictly so on iOS.
   * Returns whether audio is actually usable; a device without WebAudio answers false rather than
   * throwing, and every caller treats that as "no sound here", never as an error.
   */
  async arm(): Promise<boolean> {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx.state === "running";
    } catch {
      return false;
    }
  }

  /** Is a real, running context available? Never assumed — both callers re-read it at play time. */
  get armed(): boolean {
    return this.ctx?.state === "running";
  }

  /** Apply a schedule. A no-op when nothing is armed, which is the common case by design. */
  play(notes: readonly ChimeNote[], level: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    for (const s of chimeSchedule(notes, level, ctx.currentTime)) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = s.freq;
      gain.gain.setValueAtTime(FLOOR, s.startAt);
      gain.gain.exponentialRampToValueAtTime(s.peak, s.peakAt);
      gain.gain.exponentialRampToValueAtTime(FLOOR, s.endAt);
      osc.connect(gain).connect(ctx.destination);
      osc.start(s.startAt);
      osc.stop(s.stopAt);
    }
  }
}
