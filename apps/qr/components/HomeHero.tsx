"use client";
import { useRef } from "react";
import { m, useTransform } from "framer-motion";
import { useAnimationPreference, useDeviceTier, useHeroParallax, useInView } from "@mms/ui";

/**
 * Homepage hero (R9b · maximal) — the "morning coffee" signature moment behind the mode picker. A ☕ glyph
 * over a warm radial glow (radial-gradient, NOT blur — mobile GPU budget) + a draw-on SVG ring + rising
 * steam wisps, with multi-layer pointer/gyro PARALLAX (the glyph leads, the glow/ring trail) for depth.
 *
 * Guardrails: parallax uses the shared `useHeroParallax` (rAF-throttled, passive, IntersectionObserver-gated
 * window listeners, gyro on mobile) and is device-tier-gated — the transform output is zeroed on `low` (no
 * GPU churn) — and `shouldAnimate`-gated (the hook self-disables under reduced motion). The steam loop is
 * `useInView`-gated so it pauses when scrolled offscreen. The draw-on ring + steam + stagger each have a CSS
 * `@media (prefers-reduced-motion)` off-switch. Every decorative layer is `aria-hidden`; the real accessible
 * content is the heading + copy.
 */
export function HomeHero() {
  const { shouldAnimate } = useAnimationPreference();
  const tier = useDeviceTier();
  const on = shouldAnimate && tier !== "low"; // heavy GPU parallax only off the low tier
  const heroRef = useRef<HTMLDivElement>(null);
  // `on` gates the hook's listeners too (not just the output) — a low-tier phone pays no listener cost.
  const { x, y } = useHeroParallax(heroRef, on);
  const { ref: badgeRef, inView } = useInView<HTMLDivElement>();
  const glyphX = useTransform(x, (v) => v * 18); // x/y stay 0 when the hook is disabled → no movement
  const glyphY = useTransform(y, (v) => v * 18);
  const backX = useTransform(x, (v) => v * 8);
  const backY = useTransform(y, (v) => v * 8);
  const steamOn = shouldAnimate && inView; // pause the loop offscreen

  return (
    <div ref={heroRef} className="home-hero">
      <div ref={badgeRef} className="home-hero-badge">
        {/* Glow + draw-on ring — the slower parallax layer (trails the glyph for depth). */}
        <m.span className="home-hero-back" aria-hidden style={{ x: backX, y: backY }}>
          <span className="home-hero-glow" />
          <svg className="home-hero-ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" />
          </svg>
        </m.span>
        {steamOn && (
          <span className="home-hero-steam" aria-hidden>
            <span
              className="mms-steam hero-steam-wisp"
              style={{ left: "42%", animationDelay: "0ms" }}
            />
            <span
              className="mms-steam hero-steam-wisp"
              style={{ left: "50%", animationDelay: "700ms" }}
            />
            <span
              className="mms-steam hero-steam-wisp"
              style={{ left: "58%", animationDelay: "1400ms" }}
            />
          </span>
        )}
        {/* The ✦ Morning Star mark — the leading parallax layer + QR's identity (replaces the ☕ emoji).
            `currentColor` = brand gold; the same geometry ships as the favicon (public/icon.svg). */}
        <m.span className="home-hero-mark" aria-hidden style={{ x: glyphX, y: glyphY }}>
          <svg viewBox="0 0 64 64" width="52" height="52" focusable="false">
            <path d="M32 8 C34 21,43 30,56 32 C43 34,34 43,32 56 C30 43,21 34,8 32 C21 30,30 21,32 8 Z" />
          </svg>
        </m.span>
      </div>
      {/* The wordmark IS the hero — Fraunces display, the brand rendered with real editorial character
          (was a tiny uppercase eyebrow). Verbatim strings; type-scale tokens, no inline magic sizes. */}
      <h1 className="home-wordmark mms-stagger" style={{ animationDelay: "90ms" }}>
        Mandalay Morning Star
      </h1>
      <p className="home-greeting mms-stagger" style={{ animationDelay: "150ms" }}>
        Good morning — how would you like to order?
      </p>
    </div>
  );
}
