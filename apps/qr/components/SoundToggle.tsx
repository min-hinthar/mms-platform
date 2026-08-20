"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import {
  armSound,
  isSoundOn,
  setSoundOn,
  soundServerSnapshot,
  subscribeSound,
} from "@/lib/diner-sound";

/**
 * W22f — the diner's sound switch. The one place this preference can be changed, on the one surface
 * that is already theirs.
 *
 * ⚠️ THE TAP IS THE ARMING GESTURE — but it is not the ONLY arming. Browsers create an AudioContext
 * `suspended` and only resume it from a real interaction; the KDS has an explicit "Enable sound" tap
 * at shift start, and a diner never does — so this control is it, and `armSound()` is awaited inside
 * the handler. **Turning it ON is refused outright if the device will not give us audio**, because a
 * switch that says "on" over a refused context promises a sound that cannot happen.
 *
 * What that alone did NOT cover, and both review lenses found: the context dies with the DOCUMENT
 * while the preference does not, so on every later page load the switch read ON over a dead context.
 * `SoundPrimer` re-arms from the first gesture of each document; this control is the consent, not the
 * only arming. The switch therefore shows the stored PREFERENCE — which is what a setting is — and
 * the copy below promises only the bell that survives that round trip.
 *
 * ⚠️ THE PREFERENCE IS NOT MIRRORED INTO STATE. `localStorage` is the store, so the switch subscribes
 * to it via `useSyncExternalStore` with an explicit server snapshot of OFF. Copying it into `useState`
 * inside an effect is both what React Compiler's `set-state-in-effect` rule forbids and a real
 * correctness gap: a second tab (or a future surface) writing the preference would leave this copy
 * stale. The server snapshot paints OFF for the first frame, which is the honest direction to be
 * wrong in — off is the default and the state a guest who has never touched it is actually in.
 *
 * The proposal placed this "beside reduced motion". There is no such control: the reduced-motion
 * PREFERENCE is honored from the OS media query alone (`MotionConfig reducedMotion="user"` plus
 * explicit `shouldAnimate` gates), which is the accessible behaviour, and inventing a second
 * app-local motion setting to sit next to would be a worse outcome than moving the sound switch.
 * (The app does have one motion CONTROL — `StartHereBand`'s visible "pause the moving rows", which
 * WCAG 2.2.2 requires of that specific auto-animation. It is a per-component stop, not a setting,
 * and a sound switch does not belong beside it.) Corrected in `docs/W22_DESIGN_PROPOSAL.md` rather
 * than quietly re-scoped.
 */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, isSoundOn, soundServerSnapshot);
  /** Audio exists but the device refused it — say so instead of showing a switch that does nothing. */
  const [refused, setRefused] = useState(false);
  /** `toggle` awaits mid-flight; a second tap before the re-render would read a stale `on`. */
  const busy = useRef(false);

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // Read the STORE, not the closed-over render value: two taps ~100ms apart both see
      // `on === false` and both resolve to "turn on", so the diner's OFF-intent tap lands as a
      // second ON. `on` is for RENDERING; the intent is computed from the truth.
      const next = !isSoundOn();
      if (next) {
        // Must ride this gesture — see the header.
        const armed = await armSound();
        if (!armed) {
          setRefused(true);
          return; // never persist an "on" that cannot make a sound
        }
      }
      // Cleared on BOTH arms: a stale "this device wouldn't let us" sitting under a switch that is
      // now on (or deliberately off) is a claim about the device that stopped being true.
      setRefused(false);
      // `setSoundOn` writes the store and notifies; the switch re-reads it. If arming silently
      // lapsed between the tap and here, the write is rolled back rather than shown as a mute "on".
      if (!setSoundOn(next)) setSoundOn(false);
    } finally {
      busy.current = false;
    }
  };

  return (
    <section className="sound-row" aria-labelledby="sound-h">
      <div className="sound-copy">
        <h2 className="sound-h" id="sound-h">
          Sound
        </h2>
        {/* `role="status"` because the refusal is the ONLY feedback a refused tap produces —
            `aria-checked` does not change, so without a live region a screen-reader diner activates
            the switch, hears nothing at all, and taps again. Same shape AccountUpgrade already uses. */}
        <p className="sound-sub" id="sound-sub" role="status" aria-atomic="true">
          {refused
            ? "This device wouldn’t let us play sound."
            : /* Names the kitchen bell ONLY, and that is deliberate. The pay chime is real, but it
                 lands in the document Stripe redirects to — a fresh page with no user gesture, where
                 iOS will not let an AudioContext resume at all. Promising it would be promising a
                 sound this app cannot make on its most common device. See `primeSound`. */
              "A small bell when your order goes in to the kitchen. Off unless you want it."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`sound-switch${on ? " is-on" : ""}`}
        onClick={toggle}
        aria-label="Sound"
        /* The reason a refused tap did nothing has to be reachable FROM the control. */
        aria-describedby="sound-sub"
      >
        {/* No `sr-only` state text here: `aria-label` on this element overrides its children, so a
            "On"/"Off" span contributes nothing to the accessible name — and `aria-checked` already
            carries the state, announced as "switch, on". */}
        <span className="sound-knob" aria-hidden />
      </button>
    </section>
  );
}
