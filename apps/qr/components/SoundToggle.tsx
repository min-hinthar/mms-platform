"use client";
import { useState, useSyncExternalStore } from "react";
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
 * ⚠️ THE TAP IS THE ARMING GESTURE. Browsers create an AudioContext `suspended` and only resume it
 * from a real interaction; the KDS has an explicit "Enable sound" tap at shift start, and a diner
 * never does — so this control has to be it. `armSound()` is awaited inside the handler, and the
 * switch only reports ON if audio is genuinely usable afterwards. A toggle that says "on" while the
 * device refused the context would be promising a sound that cannot happen.
 *
 * ⚠️ THE PREFERENCE IS NOT MIRRORED INTO STATE. `localStorage` is the store, so the switch subscribes
 * to it via `useSyncExternalStore` with an explicit server snapshot of OFF. Copying it into `useState`
 * inside an effect is both what React Compiler's `set-state-in-effect` rule forbids and a real
 * correctness gap: a second tab (or a future surface) writing the preference would leave this copy
 * stale. The server snapshot paints OFF for the first frame, which is the honest direction to be
 * wrong in — off is the default and the state a guest who has never touched it is actually in.
 *
 * The proposal placed this "beside reduced motion". There is no such control: reduced motion is
 * honored from the OS media query alone (`MotionConfig reducedMotion="user"` plus explicit
 * `shouldAnimate` gates), and inventing a second motion setting to sit next to would be a worse
 * outcome than moving the sound switch. Corrected in `docs/W22_DESIGN_PROPOSAL.md` rather than
 * quietly re-scoped.
 */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, isSoundOn, soundServerSnapshot);
  /** Audio exists but the device refused it — say so instead of showing a switch that does nothing. */
  const [refused, setRefused] = useState(false);

  const toggle = async () => {
    const next = !on;
    if (next) {
      // Must ride this gesture — see the header.
      const armed = await armSound();
      if (!armed) {
        setRefused(true);
        return; // never persist an "on" that cannot make a sound
      }
      setRefused(false);
    }
    // `setSoundOn` writes the store and notifies; the switch re-reads it. If arming silently lapsed
    // between the tap and here, the write is rolled back rather than shown as an "on" that is mute.
    if (!setSoundOn(next)) setSoundOn(false);
  };

  return (
    <section className="sound-row" aria-labelledby="sound-h">
      <div className="sound-copy">
        <h2 className="sound-h" id="sound-h">
          Sound
        </h2>
        <p className="sound-sub">
          {refused
            ? "This device wouldn’t let us play sound."
            : "A small bell when your order goes in, and when you’ve paid. Off unless you want it."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`sound-switch${on ? " is-on" : ""}`}
        onClick={toggle}
        aria-label="Play a sound when an order is sent and when payment completes"
      >
        <span className="sound-knob" aria-hidden />
        <span className="sr-only">{on ? "On" : "Off"}</span>
      </button>
    </section>
  );
}
