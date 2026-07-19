"use client";
import { useEffect, useState } from "react";

/**
 * W4f — returns `true` when a pinned bar should tuck away: the shopper is scrolling DOWN (reading)
 * past a small threshold; `false` again the moment they scroll UP (reaching for navigation). Lets a
 * sticky rail cost zero space while browsing and reappear on demand — the premium mobile pattern.
 *
 * Passive listener, rAF-throttled (one read per frame max); state is set only inside the rAF
 * callback (never synchronously in the effect body). Honors reduced-motion by staying VISIBLE — a
 * user who opted out of motion shouldn't have chrome vanish/reappear under them.
 *
 * @param threshold  px scrolled from the top before hiding is allowed (keep the bar while near top).
 */
export function useHideOnScrollDown(threshold = 72): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // stay visible

    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY;
        // Ignore sub-6px jitter / rubber-band; hide only while scrolling down past the threshold,
        // reveal on any upward move.
        if (Math.abs(dy) > 6) {
          if (dy > 0 && y > threshold) setHidden(true);
          else if (dy < 0) setHidden(false);
          lastY = y;
        } else if (y <= threshold) {
          setHidden(false); // always shown near the top
          lastY = y;
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
