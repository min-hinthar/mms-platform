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
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return null;
}
