"use client";
/**
 * Pointer-spring micro-interactions (Richness R4) — ported from the delivery app's hardened
 * `Hero/interactions.ts`, re-skinned to QR's `useAnimationPreference`. Pure pointer/spring math, no
 * domain coupling. Every hook is reduced-motion-gated (no-op when the user asks for less motion),
 * rAF-throttled where it listens to window events, and IntersectionObserver-detached offscreen.
 *
 * Needs framer-motion (`useSpring`) → the consuming component must sit under the root LazyMotion
 * provider (`MotionProvider`, R3) and be `"use client"`.
 *
 * ⚠️ Caveats carried verbatim from delivery (hard-won):
 *  - **No tilt on a card whose body holds the primary CTA** — under `transform-style: preserve-3d` a
 *    backdrop-filter/box-shadow renders a hard SQUARE color-shadow artifact, and the swing slides the
 *    CTA out from under the cursor. Use a clean scale-up + accent glow there instead. Also disable on
 *    keyboard focus (tilt is a pointer affordance).
 *  - **No scroll-coupled BACKGROUND parallax** — motion sickness. `useHeroParallax` exposes a scroll
 *    value, but drive only foreground/decorative depth with pointer + gyro; never the page backdrop.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useSpring, type MotionValue } from "framer-motion";
import { useAnimationPreference } from "./motion";

type ReactPointer = ReactPointerEvent<HTMLElement>;

const TILT_SPRING = { stiffness: 220, damping: 18, mass: 0.4 } as const;
const MAGNET_SPRING = { stiffness: 240, damping: 16, mass: 0.4 } as const;
const PARALLAX_SPRING = { stiffness: 90, damping: 22, mass: 0.6 } as const;

/**
 * 3D parallax tilt driven by pointer position over the element. Spread the returned `rotateX`/`rotateY`
 * onto an `m.div` style (with `transformPerspective`) and bind the handlers. See the no-tilt-on-CTA caveat.
 */
export function useTilt(maxDeg = 7) {
  const { shouldAnimate } = useAnimationPreference();
  const rotateX = useSpring(0, TILT_SPRING);
  const rotateY = useSpring(0, TILT_SPRING);

  function onPointerMove(e: ReactPointer) {
    if (!shouldAnimate) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    rotateY.set(px * maxDeg * 2);
    rotateX.set(-py * maxDeg * 2);
  }
  function onPointerLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return { rotateX, rotateY, onPointerMove, onPointerLeave, enabled: shouldAnimate };
}

/**
 * Magnetic pull — the element leans toward the pointer while hovered. Spread `x`/`y` onto an `m.*`
 * style and bind the handlers.
 */
export function useMagnetic(strength = 0.35) {
  const { shouldAnimate } = useAnimationPreference();
  const x = useSpring(0, MAGNET_SPRING);
  const y = useSpring(0, MAGNET_SPRING);

  function onPointerMove(e: ReactPointer) {
    if (!shouldAnimate) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  function onPointerLeave() {
    x.set(0);
    y.set(0);
  }

  return { x, y, onPointerMove, onPointerLeave, enabled: shouldAnimate };
}

/**
 * Pointer/gyro parallax source: normalized (-0.5..0.5) offsets from pointer position over `ref` plus
 * device orientation (gyro) on mobile, and a scroll value (decorative FOREGROUND depth only — never the
 * page background). Listens only while `ref` is on screen (window-listener perf). rAF-throttled.
 */
export function useHeroParallax(
  ref: React.RefObject<HTMLElement | null>,
  // `enabled` lets a caller skip the window listeners entirely (not just zero the output) — e.g. a
  // device-tier gate so a low-end phone pays no listener/spring cost. Re-attaches when it flips true.
  enabled = true,
): {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scrollY: MotionValue<number>;
} {
  const { shouldAnimate } = useAnimationPreference();
  const x = useSpring(0, PARALLAX_SPRING);
  const y = useSpring(0, PARALLAX_SPRING);
  const scrollY = useSpring(0, PARALLAX_SPRING);
  const frame = useRef(0);
  const scrollFrame = useRef(0);

  useEffect(() => {
    if (!shouldAnimate || !enabled) return;
    const el = ref.current;
    if (!el) return;

    // Clamp to the documented -0.5..0.5 envelope: the listener is on `window` but we normalize against the
    // ref box, so an off-element pointer (a narrow, centered hero on a wide desktop) would otherwise blow
    // past ±0.5 and over-drive the consumer's transform. Matches the gyro (onOrient) clamp below.
    const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));
    const onPointer = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        x.set(clamp((e.clientX - (r.left + r.width / 2)) / r.width));
        y.set(clamp((e.clientY - (r.top + r.height / 2)) / r.height));
      });
    };
    // rAF-throttle the scroll read too (parity with onPointer) — the raw handler forced a synchronous
    // layout (getBoundingClientRect) per scroll event.
    const onScroll = () => {
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = requestAnimationFrame(() => scrollY.set(-el.getBoundingClientRect().top));
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      x.set(Math.max(-0.5, Math.min(0.5, e.gamma / 45)));
      y.set(Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 45)));
    };

    // Only listen while the element is on screen (perf — these are window listeners).
    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("deviceorientation", onOrient, { passive: true });
      onScroll();
    };
    const detach = () => {
      if (!attached) return;
      attached = false;
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("deviceorientation", onOrient);
    };

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => (entries[0]?.isIntersecting ? attach() : detach()),
        { rootMargin: "120px" },
      );
      io.observe(el);
    } else {
      attach();
    }

    return () => {
      cancelAnimationFrame(frame.current);
      cancelAnimationFrame(scrollFrame.current);
      detach();
      io?.disconnect();
    };
  }, [ref, x, y, scrollY, shouldAnimate, enabled]);

  return { x, y, scrollY };
}

export interface Ripple {
  id: number;
  x: number;
  y: number;
}

/**
 * Tap/click ripple (framer-free — pure state). Bind `onPointerDown` to the target; render `ripples` as
 * absolutely-positioned expanding spans (e.g. the `.mms-ripple` utility). Works on touch + mouse. The
 * caller should gate on its own reduced-motion check before binding if the surface needs it.
 */
export function useRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  const onPointerDown = useCallback((e: ReactPointer) => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = nextId.current++;
    setRipples((prev) => [...prev, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
    // 650ms > the .mms-ripple 0.6s animation — the 50ms slack keeps the span mounted until its
    // bloom finishes (removing at exactly 600ms could clip the last frame).
    const t = window.setTimeout(() => {
      setRipples((prev) => prev.filter((rp) => rp.id !== id));
    }, 650);
    timers.current.push(t);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return { ripples, onPointerDown };
}
