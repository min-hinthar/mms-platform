"use client";
import { useEffect } from "react";

/**
 * Live OS-theme sync (Richness R2). The blocking inline script in `app/layout.tsx` sets `.dark` on
 * `<html>` from `prefers-color-scheme` BEFORE first paint (no theme flash); this keeps it in sync if
 * the user flips their OS theme while the app is open. System-driven by design — QR has no in-app
 * theme picker — so the class is always == the OS scheme and stays in lockstep with the `themeColor`
 * address-bar meta (also keyed on `prefers-color-scheme`), with no class-vs-OS divergence.
 *
 * Stripe caveat (accepted): the Payment Element captures its theme at MOUNT (`stripeAppearance()`
 * reads `.dark` then). A flip while the Element is mounted leaves the iframe at its mount theme —
 * deliberately NOT re-keyed, because remounting the Element would wipe in-progress card entry, a worse
 * regression than a cosmetic stale theme on a rare mid-session OS flip. First mount is always correct.
 */
export function ThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", mq.matches);
    apply(); // reconcile in case the OS scheme changed between the blocking script and hydration
    // Legacy MediaQueryList (Safari/iOS <14 — still targeted here, cf. the <15.4 dvh sheet fallback)
    // lacks addEventListener; fall back to the deprecated addListener so this effect can't throw at the
    // root (which would trip the error boundary). First-paint dark still works either way (the layout's
    // inline script uses the universally-supported matchMedia().matches).
    if (mq.addEventListener) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);
  return null;
}
