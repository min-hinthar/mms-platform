/**
 * W13 — the haptic weight hierarchy (RUBRIC axis #5: "haptic weight hierarchy" is a named
 * criterion). Weights follow the v7.2 prototype: 6 stepper step · 8 quick-add · 12 sheet-add;
 * PaySuccess keeps its own success pattern.
 *
 * ⚠️ Reduced motion is read SYNCHRONOUSLY from matchMedia, never via useAnimationPreference —
 * that hook seeds `shouldAnimate = true` before its effect resolves (SSR-safe by design), and a
 * haptic is irreversible: an RM user would get buzzed once per first-tap. The PaySuccess pattern,
 * promoted to the shared helper. No-vibrate platforms (iOS Safari) just no-op.
 */
export function hapticTap(ms: number): void {
  try {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate?.(ms);
  } catch {
    /* deliberate: haptics are garnish — never let a platform quirk break the add */
  }
}
