"use client";
import { ChimeEngine } from "./chime-core";
import type { CounterRingKind } from "./counter-attention";
import { ARM_TIMEOUT_MS, COUNTER_LEVEL, COUNTER_SOUND_KEY, COUNTER_TONES } from "./counter-chime";

/**
 * Phase 2d · bell — the counter bell's WebAudio plumbing and its per-device "wanted" store. The
 * policy (phrases, level, postures) is `counter-chime.ts`; WHEN it rings is `counter-attention.ts`.
 *
 * ── One engine per DOCUMENT, not per mount ───────────────────────────────────────────────────────
 * A module singleton, deliberately (the diner's `diner-sound.ts` shape): the counter person arms the
 * bell once at the start of a shift and then walks into `/staff/table/7` and back. A per-mount engine
 * would die with the counter view on that soft navigation and come back PAUSED; the singleton keeps
 * its running context across it (the table page has no bell — owner decision 5c — but the arming
 * survives the trip). A hard navigation or a reload still loses it, and the chip says so (paused).
 *
 * ── The silent switch ────────────────────────────────────────────────────────────────────────────
 * On an iPad a running context is still MUTED by the ringer switch unless the page asks for a
 * `playback` audio session (WebKit's Audio Session API). The owner chose that (decision 5c): the
 * chip is the counter's mute, not the switch. Feature-detected and best effort — a browser without
 * the API keeps its default, and the post-arm hint (turn up the volume, check the device is not on
 * silent) covers that device. ⚠️ Unmeasured: no device here; OPEN-ITEMS row. Trade-off the owner accepted: on those
 * devices the switch no longer silences the bell, and it may pause other audio on the counter iPad.
 */

const engine = new ChimeEngine();

/** Is a real, RUNNING context available right now? Re-read at every ring, never assumed. */
export function counterArmed(): boolean {
  return engine.armed;
}

/** Hear every change of `counterArmed()` — for `useSyncExternalStore` (§15: the store, not a mirror). */
export function subscribeCounterArmed(cb: () => void): () => void {
  return engine.subscribe(cb);
}

/** The server has no audio and no storage: the bell starts off and unarmed (rule 1). */
export function counterSoundServerSnapshot(): boolean {
  return false;
}

/** Ask for the `playback` session where the browser has one. Best effort: any quirk is swallowed. */
function playbackSession(): void {
  try {
    if (typeof navigator === "undefined" || !("audioSession" in navigator)) return;
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
  } catch {
    /* deliberate: an audio-session quirk must never stop the arm itself */
  }
}

/**
 * Arm the bell, bounded. MUST be called synchronously inside a user gesture: `engine.arm()` creates
 * and resumes the context before its first await, so the resume rides the gesture. A resume the
 * browser does not allow stays PENDING until some later activation — never resolving, never
 * rejecting — so the arm races a timer and a timeout reads as NOT armed; the chip is never left busy
 * forever. (If that pending resume later succeeds, the engine's subscription says so.)
 */
export function armWithin(ms: number = ARM_TIMEOUT_MS): Promise<boolean> {
  playbackSession();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  return Promise.race([engine.arm(), late]).finally(() => clearTimeout(timer));
}

/** Ring one phrase at the counter's level — a no-op unless the context is running right now. */
export function playCounter(kind: CounterRingKind): void {
  try {
    if (!engine.armed) return;
    engine.play(COUNTER_TONES[kind], COUNTER_LEVEL);
  } catch {
    /* deliberate: sound is never the only feedback (the card's ring and badge carry every event) */
  }
}

// ── The "wanted" store ───────────────────────────────────────────────────────────────────────────
/**
 * In-memory fallback for a preference the store REFUSED to persist (private mode throws on write).
 * `null` = the store is the truth. Without it an explicit tap in a private window snapped the chip
 * straight back to "Enable sound" (the diner's `diner-sound.ts` found this the hard way).
 */
let override: boolean | null = null;
const wantedListeners = new Set<() => void>();

/**
 * Did this device ask for the bell? Read synchronously, failing to NO: an unset key, a throwing store
 * (the `window.localStorage` getter itself throws with site data blocked), and the server all read
 * false — a broken store is not consent (§15).
 */
export function getCounterWanted(): boolean {
  if (typeof window === "undefined") return false;
  if (override !== null) return override;
  try {
    return window.localStorage.getItem(COUNTER_SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

/** Record the answer, then tell every reader (this tab's; other tabs hear `storage`). */
export function setCounterWanted(wanted: boolean): void {
  try {
    if (wanted) window.localStorage.setItem(COUNTER_SOUND_KEY, "1");
    else window.localStorage.removeItem(COUNTER_SOUND_KEY);
    override = null;
  } catch {
    // Private mode: the answer will not survive a reload, but it must hold for THIS session.
    override = wanted;
  }
  for (const cb of [...wantedListeners]) cb();
}

/** For `useSyncExternalStore`: this tab's writes, and another tab's through `storage`. */
export function subscribeCounterWanted(cb: () => void): () => void {
  wantedListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    wantedListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// ── What this document has already heard ─────────────────────────────────────────────────────────
/**
 * Every fact key (`lib/counter-attention.ts`) the counter home's boards have heard in THIS DOCUMENT —
 * document-scoped for the engine's reason. A board's own seen set lived one MOUNT, and each mount
 * seeded it from the page's `initial` snapshot; a remount whose `initial` is OLDER than its last good
 * poll then rang again for every fact it had already rung for. That remount is reachable: Back (the
 * App Router restores a back/forward navigation from its client cache, so the counter home returns
 * with its FIRST load's props, and the boards remount — no `cacheComponents` here), an error
 * boundary's reset, a re-parent across a breakpoint. Each mount's seed now merges INTO this set and
 * every good poll grows it, so a key this document has heard never rings again, whatever `initial`
 * a remount carries.
 *
 * It only grows (pruning it is exactly what would let a flap re-ring): one short string per ask,
 * arrival, basket and finished bag — a few hundred a day, kilobytes over a tablet's week-long tab.
 * A reload or a hard navigation is a new document, and a new document's first mount seeds (§17).
 */
const heard = new Set<string>();

/** The keys this document has heard (a read-only view: `rememberCounterHeard` is the one writer). */
export function counterHeard(): ReadonlySet<string> {
  return heard;
}

/** Add keys to what this document has heard. Merge only — never a replace. */
export function rememberCounterHeard(keys: Iterable<string>): void {
  for (const k of keys) heard.add(k);
}
