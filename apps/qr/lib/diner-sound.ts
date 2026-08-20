"use client";
import { CHIME, CHIME_LEVEL, SOUND_KEY, mayChime, soundEnabled, type ChimeMoment } from "./chime";

/**
 * W22f — the diner-side chime engine. The POLICY (what may play, when, how loud, and the fact that
 * there is no error sound) lives in `chime.ts`, which is pure and carries the mutants. This file is
 * WebAudio plumbing and a preference write.
 *
 * The synthesis approach is `kds-sound.ts`'s, deliberately: oscillator + a fast attack and
 * exponential release, which reads as a soft mallet rather than a buzzer, and no audio asset to load
 * or cache-miss. That envelope now exists in two places; unifying it onto a shared core is filed as
 * **M90** rather than done here, because converting the KDS engine in a diner slice would put the
 * cook's ticket chime at risk for a nice-to-have.
 *
 * ⚠️ ARMING MUST HAPPEN INSIDE A USER GESTURE. Browsers create an AudioContext `suspended` and only
 * `resume()` from a real interaction — on iOS this is enforced strictly. The KDS has an explicit
 * "Enable sound" tap at shift start; a diner never does, so **the preference toggle itself is the
 * gesture**. That is why `setSoundEnabled` arms as part of turning it on, and why turning it on from
 * anywhere that is not a tap will leave `armed` false and everything silent — correctly (see
 * `mayChime`: enabled and armed fail separately and neither implies the other).
 */

let ctx: AudioContext | null = null;

/**
 * In-memory fallback for a preference the store REFUSED to persist.
 *
 * `null` means "the store is the truth". A private-mode `setItem` throws, and the old comment below
 * claimed the toggle "still works for this session" — it did not: every read went straight back to
 * the store, so the switch snapped back to OFF and nothing sounded. Adversarial review, MED. This is
 * what makes that sentence true.
 */
let override: boolean | null = null;

/** Is a real, running context available? Read by `mayChime`, never assumed. */
export function soundArmed(): boolean {
  return ctx?.state === "running";
}

/**
 * Create/resume the context. MUST be called synchronously from a user gesture.
 * Returns whether audio is actually usable — a device with no WebAudio answers false and the caller
 * shows the toggle as unavailable rather than lying about it.
 */
export async function armSound(): Promise<boolean> {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false; // no audio here; sound is garnish and its absence costs nothing
  }
}

/**
 * The current preference, read synchronously.
 *
 * The `window.localStorage` ACCESS is inside the try, not just the `getItem` call: with all site data
 * blocked (and in some partitioned frames) the property GETTER itself throws `SecurityError`, before
 * `soundEnabled`'s own guard can run. This is `useSyncExternalStore`'s `getSnapshot`, so a throw here
 * takes `/account` to the error boundary — the one shape `chime.test.ts` could not express, because a
 * stub store object can only throw from `getItem`. Fails to OFF, like every other arm of rule 1.
 */
export function isSoundOn(): boolean {
  if (typeof window === "undefined") return false;
  if (override !== null) return override;
  try {
    return soundEnabled(window.localStorage);
  } catch {
    return false;
  }
}

/**
 * Subscribe to preference changes, for `useSyncExternalStore`.
 *
 * `localStorage` IS the store, so the switch reads it rather than mirroring it into React state —
 * which is also what keeps the component free of a setState-in-effect (React Compiler's
 * `set-state-in-effect` rule, and it is right: a mirrored copy can disagree with the real value the
 * moment another surface writes one).
 *
 * Two sources, because the browser's `storage` event fires only in OTHER tabs: the local set below
 * covers this one. A guest with the account page open in two tabs sees both switches agree.
 */
const listeners = new Set<() => void>();

export function subscribeSound(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** The server has no preference and no storage — everyone starts off. Matches rule 1. */
export function soundServerSnapshot(): boolean {
  return false;
}

/**
 * Persist the preference. Arming is the caller's job and must ride the same gesture; this returns
 * whether the requested state is ACTUALLY in effect, so a toggle can show "on" only when sound will
 * really play. Promising a sound that cannot happen is the same class of lie as any other unkept
 * copy promise.
 */
export function setSoundOn(on: boolean): boolean {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "1" : "0");
    override = null; // the store took it; it is the truth again
  } catch {
    // Private mode: the preference will not survive a reload. Deliberate swallow — but the toggle has
    // to actually work for THIS session, which means the reads must see it. Without the override the
    // switch snapped straight back to OFF and stayed mute, which is not "swallowed", it is broken.
    override = on;
  }
  for (const cb of listeners) cb();
  return on ? soundArmed() : true;
}

/**
 * Re-arm across page loads — the defect both adversarial lenses found independently, and the one that
 * falsified this slice's central claim.
 *
 * `ctx` is module state and dies with the document; the preference is `localStorage` and does not. So
 * after the load on which the diner armed it, every subsequent document had `enabled = true` and
 * `armed = false` — the switch read ON, the copy named two bells, and nothing could ever sound again
 * short of toggling off and on. The arming has to be re-established once per document, and the only
 * currency a browser accepts for that is a real gesture.
 *
 * `pointerdown` in the CAPTURE phase, `{ once: true }` — the diner's first touch on any page, before
 * any handler can stop it. `keydown` covers a keyboard or switch-access diner who never generates a
 * pointer event. `visibilitychange` re-arms after an iOS interruption (a call, another app) leaves the
 * context suspended, which is the same failure one layer down.
 *
 * ⚠️ This does NOT reach the pay chime, and cannot. Stripe's Payment Element hard-navigates to
 * `return_url`, so `/track` mounts in a brand-new document with no user activation at all — and
 * activation does not survive a navigation. On iOS that document can never resume an AudioContext,
 * so `paid` is best-effort by construction: it plays where the browser allows and is silent where it
 * does not. That is why the toggle's copy names only the kitchen bell (a promise the code keeps on
 * every device) and why rule 2 — sound is never the only feedback — is load-bearing rather than
 * decorative here. Exactly the shape `haptics.ts` already lives with: iOS Safari implements no
 * `navigator.vibrate`, and the celebrate haptic ships anyway because nothing depends on it.
 */
export function primeSound(): () => void {
  const tryArm = () => {
    if (isSoundOn() && !soundArmed()) void armSound();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") tryArm();
  };
  document.addEventListener("pointerdown", tryArm, { capture: true, once: true });
  document.addEventListener("keydown", tryArm, { capture: true, once: true });
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    document.removeEventListener("pointerdown", tryArm, { capture: true });
    document.removeEventListener("keydown", tryArm, { capture: true });
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * Play a moment, or do nothing at all.
 *
 * Every gate is re-read at play time rather than captured: the diner may have turned sound off in
 * another tab, and a preference is only meaningful at the instant it is acted on.
 */
export function chime(moment: ChimeMoment): void {
  try {
    if (!mayChime({ enabled: isSoundOn(), armed: soundArmed() })) return;
    const audio = ctx;
    if (!audio) return;
    const t0 = audio.currentTime + 0.02;
    for (const n of CHIME[moment]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      // Fast attack, exponential release — a soft mallet, not a buzzer. (kds-sound.ts, same shape.)
      gain.gain.setValueAtTime(0.0001, t0 + n.at);
      gain.gain.exponentialRampToValueAtTime(CHIME_LEVEL, t0 + n.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.dur + 0.05);
    }
  } catch {
    /* deliberate: sound is garnish — never let an audio quirk break a send or a payment */
  }
}
