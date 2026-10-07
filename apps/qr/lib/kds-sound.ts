"use client";
import { ChimeEngine, type ChimeNote } from "./chime-core";
import { ARM_TIMEOUT_MS } from "./counter-chime";

/**
 * W3c (O-C): the KDS chime — synthesized WebAudio tones, no audio assets to load or cache-miss
 * mid-rush. Browsers gate audio behind a user gesture, so the engine stays dormant until arm() runs
 * inside a tap (the sound circle at shift start); the mute persists per device (localStorage) and
 * the level is FIXED (Phase 3d).
 *
 * Distinct tones per channel (Fresh's per-event sounds): dine-in = a two-note mid "ding-dong"; pickup/
 * scango = a brighter three-note rise — that customer is standing at the counter, the cook should hear
 * WHICH kind of work landed without looking. The re-chime (a ticket sitting un-started) reuses the
 * channel tone at a lower volume so it nags without startling.
 *
 * **M90** moved the synthesis into `chime-core.ts`, shared with the diner's chime. What stayed here is
 * everything the kitchen decides for itself: the tone vocabulary, the 0.8 level, the `soft` re-chime
 * level, and the per-device mute. The diner's policy inverts on every one of those axes (`chime.ts`
 * has the table), so the two policies are still two files — only the oscillator plumbing is one.
 * Phase 2b added `subscribe` (a passthrough to the engine's).
 *
 * **Phase 3d — the slider is retired.** The level is 0.8, always: the device's own volume buttons
 * are the dial, the counter's decision 5c (`counter-chime.ts`). The `mms.kds.volume` key a station
 * wrote before is deliberately left on the device and never read, so the decision is one revert
 * away. What a station CAN still choose is silence: the board passes its mute in as a predicate the
 * chime reads at the instant of every play. ⚠️ Passed in, never read here from the kitchen's store —
 * the TV wall (`ReadyBoard.tsx`) shares this class, gates its own calls, and runs on a device where
 * the kitchen's flag is never set, so a chime that read that flag itself would silence the wall.
 * The predicate therefore DEFAULTS OPEN.
 */

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

/** Loud, and fixed (SPEC-KDS §3; Phase 3d) — a cook must hear a ticket land across a hot line. */
export const KDS_DEFAULT_VOLUME = 0.8;

export class KdsChime {
  private engine = new ChimeEngine();

  /**
   * Phase 3d — `wanted` is the KITCHEN's mute, read at the instant of every play (the counter's
   * rule: re-read, never captured), so a mute silences the next arrival while the context keeps
   * running. The TV wall passes nothing: it gates its own calls, and the default is OPEN.
   */
  constructor(private readonly wanted: () => boolean = () => true) {}

  /** Must be called from a user gesture (the sound circle's tap) — creates/resumes the AudioContext. */
  arm(): Promise<boolean> {
    // A device with no audio answers false; the visual channel (flash + pill) still covers O-C.
    return this.engine.arm();
  }

  /**
   * Phase 3d — `arm`, bounded (`counter-sound.ts`'s `armWithin`). A resume the browser does not
   * allow stays PENDING — it neither resolves nor rejects until some later activation — so an
   * unbounded wait would hold the circle busy forever; past `ms` it reads as NOT armed. MUST be
   * called synchronously inside the gesture: `engine.arm()` starts the resume before its first await.
   */
  armWithin(ms: number = ARM_TIMEOUT_MS): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    });
    return Promise.race([this.engine.arm(), late]).finally(() => clearTimeout(timer));
  }

  get armed(): boolean {
    return this.engine.armed;
  }

  /** Phase 2b — hear every change of `armed` (the context suspended under a sleeping tablet). */
  subscribe(cb: () => void): () => void {
    return this.engine.subscribe(cb);
  }

  /** Play the channel's tone. `soft` is the 60–90s un-started re-chime, at `SOFT_LEVEL`. */
  play(channel: "dinein" | "pickup" | "scango", soft = false): void {
    // Before the mute read, not after: an un-armed station is the common case at shift start, and a
    // ticket landing must not cost a preference read to discover there is nothing to play.
    if (!this.engine.armed) return;
    // Phase 3d — the mute silences play() itself, read now (a running context is not consent).
    if (!this.wanted()) return;
    this.engine.play(
      TONES[channel === "dinein" ? "dinein" : "pickup"],
      KDS_DEFAULT_VOLUME * (soft ? SOFT_LEVEL : 1),
    );
  }
}

/**
 * kitchen-8 — "this device wanted sound". Browsers only arm audio inside a gesture, so a deploy, an
 * auth redirect or a slept tablet remounts the board MUTE with nothing to say so. The flag is set
 * when an arm succeeds and cleared by an explicit mute (the circle's tap while on), so the next
 * mount can wear the warn circle and re-arm off the first tap of the shift.
 */
const SOUND_KEY = "mms.kds.sound";

/**
 * Phase 3d — in-memory fallback for an answer the store REFUSED to persist (private mode throws on
 * write; the `localStorage` getter itself throws with site data blocked). `null` = the store is the
 * truth. Without it a tap in a private window armed the chime and the mute predicate read false at
 * once: a board that said "Sound on" and never made one (`counter-sound.ts` found this first).
 */
let override: boolean | null = null;

/** Did this device ask for sound? Failing to NO: an unset key and a throwing store read false. */
export function getKdsSoundWanted(): boolean {
  if (override !== null) return override;
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function setKdsSoundWanted(wanted: boolean): void {
  try {
    if (wanted) localStorage.setItem(SOUND_KEY, "1");
    else localStorage.removeItem(SOUND_KEY);
    override = null;
  } catch {
    // Private mode: the answer will not survive a reload, but it must hold for THIS document.
    override = wanted;
  }
}
