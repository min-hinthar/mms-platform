"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Motion & perf foundation primitives (M5·P5.3, ported lean from the delivery app's hardened
 * patterns — see `docs/MOTION_AND_PERF.md`). These are the *contract* QR motion is built against:
 * gate every JS animation on `shouldAnimate`, pause every loop offscreen with `useInView`, and gate
 * heavy GPU work on `useDeviceTier`. They are intentionally minimal — no in-app override store yet
 * (QR has no motion-settings UI); add one here when that surface exists.
 */

/**
 * JS counterpart to the CSS `@media (prefers-reduced-motion: reduce)` query. Use it to gate
 * JS-driven motion (framer loops, rAF, NumberFlow-style libs that don't self-gate) so JS matches
 * what the CSS already does. SSR-safe: assumes motion is OK on the server/first paint (the CSS
 * query only ever *removes* animation, so first-paint-animate → settle is consistent), then
 * corrects on mount and stays reactive to OS changes.
 */
export function useAnimationPreference() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return { prefersReducedMotion, shouldAnimate: !prefersReducedMotion };
}

/**
 * IntersectionObserver wrapper for **offscreen-pause**: a CSS/JS loop must not keep ticking when it
 * scrolls out of view (battery + jank). Put the returned `ref` on a STABLE wrapper element (never on
 * a conditionally-rendered or moving target — that breaks the observer; see LEARNINGS), then gate the
 * loop with `shouldAnimate && inView`. Falls back to `inView: true` where IntersectionObserver is
 * absent (SSR/very old browsers) so motion is never permanently suppressed. Pass a primitive
 * `threshold` (or memoize an array) — the effect re-subscribes when these change.
 */
export function useInView<T extends Element = HTMLElement>(options?: {
  rootMargin?: string;
  threshold?: number | number[];
  /** Stop observing after the first time the element enters view. */
  once?: boolean;
}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const { rootMargin, threshold, once } = options ?? {};
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true); // no observer → don't suppress motion
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) obs.disconnect();
      },
      { rootMargin, threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin, threshold, once]);
  return { ref, inView };
}

export type DeviceTier = "low" | "mid" | "high" | "desktop";

/**
 * Capability tier for gating expensive FX (WebGL, particle systems, large/stacked blur). SSR-safe:
 * returns `"low"` on the server/first paint, then resolves on mount from pointer + core count — so a
 * tier-dependent swap can't cause a hydration mismatch.
 *
 * ⚠️ **`high`/`mid`/`low` are all MOBILE.** A high-core iPhone reports `"high"`, but a high core
 * count does NOT lift WebKit's per-tab memory ceiling — so gate the heaviest GPU work (live WebGL,
 * full-screen blur stacks) on `tier === "desktop"` ONLY, never `>= "high"`. (Hard-won from a prod iOS
 * OOM crash — see `docs/MOTION_AND_PERF.md`.)
 */
export function useDeviceTier(): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>("low");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
    const cores = navigator.hardwareConcurrency ?? 0;
    setTier(
      finePointer && cores >= 8
        ? "desktop"
        : cores >= 8
          ? "high"
          : cores >= 4
            ? "mid"
            : "low"
    );
  }, []);
  return tier;
}
