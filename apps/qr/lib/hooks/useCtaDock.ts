"use client";
import { useEffect, type RefObject } from "react";

/**
 * M126 — publish a fixed bottom dock's height as `--cta-dock-h`, so anything anchored above it can
 * clear it without hard-coding a number that the user's base font size can invalidate.
 *
 * One consumer today: the page ambient's pause coin (`.pa-pause`), which is the WCAG 2.2.2 stop
 * control for the coarse-pointer drift. Two docks publish: `CartBar` on /menu and /cart, and the
 * grocery CTA band on /grocery. Both are `position: fixed`, both span the page column at the bottom
 * left, and both sit at `--z-toolbar` — so a coin that does not clear them is painted over AND has
 * its taps swallowed, which removes the only way to stop the motion.
 *
 * This lives in one place rather than in each dock because the second caller is where a hand-copied
 * version starts to drift, and the third is where it silently stops matching. Callers pass a ref to
 * the docked element and a boolean for whether it is currently rendered; when it is not, the token
 * is REMOVED rather than zeroed, so the CSS `var(--cta-dock-h, 0px)` fallback owns the empty case.
 *
 * Not a layout effect: a frame of the coin sitting low is invisible, and `useLayoutEffect` warns
 * during SSR. `ResizeObserver` keeps it correct when the dock's own content reflows (a longer
 * total, a wrapped label, a larger system font).
 */
export function useCtaDock(ref: RefObject<HTMLElement | null>, active: boolean, gap = 16) {
  useEffect(() => {
    const root = document.documentElement;
    const el = active ? ref.current : null;
    if (!el) {
      root.style.removeProperty("--cta-dock-h");
      return;
    }
    const measure = () => root.style.setProperty("--cta-dock-h", `${el.offsetHeight + gap}px`);
    measure();
    // Feature-detected, matching MenuBrowser.tsx: iOS Safari before 13.4 has no ResizeObserver, and
    // a bare `new ResizeObserver` there throws a ReferenceError the moment the dock mounts — i.e.
    // right after an item is added — which would swap the ordering flow for its error boundary. The
    // initial measurement above is the part that matters; the observer only keeps it true when the
    // dock reflows, so losing it costs a stale offset and nothing else.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--cta-dock-h");
    };
  }, [ref, active, gap]);
}
