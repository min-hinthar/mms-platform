"use client";
import { useEffect, type RefObject } from "react";

/**
 * M126 — publish a fixed bottom dock's height as `--cta-dock-h`, so anything anchored above it can
 * clear it without hard-coding a number that the user's base font size can invalidate.
 *
 * One consumer today: the shared `@mms/ui` Toast (`.ui-toast-region`, primitives.css), which floats
 * every diner confirmation above the dock. (Its first consumer, the ambient's pause coin, retired
 * with the phone drift in Phase 0.) Two docks publish: `CartBar` on /menu and /cart, and the grocery
 * CTA band on /grocery. Both are `position: fixed` at the bottom of the page column, so a toast that
 * does not clear them is painted over the very button it is confirming.
 *
 * This lives in one place rather than in each dock because the second caller is where a hand-copied
 * version starts to drift, and the third is where it silently stops matching. Callers pass a ref to
 * the docked element and a boolean for whether it is currently rendered; when it is not, the token
 * is REMOVED rather than zeroed, so the consumer's own CSS fallback owns the empty case (the toast's
 * is 72px — the 56px band + this hook's 16px gap — pinned by responsive-contract.test.ts).
 *
 * Not a layout effect: a frame of the toast sitting low is invisible, and `useLayoutEffect` warns
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
