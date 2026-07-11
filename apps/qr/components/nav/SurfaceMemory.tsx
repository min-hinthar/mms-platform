"use client";
import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * J1 — entrance staggers fire once per SESSION per surface, not once per mount. Returning to the menu
 * mid-meal should feel like turning back to your table, not a re-premiere: with route transitions now
 * carrying the continuity, a replayed `.mms-stagger` cascade on every visit reads as the app forgetting
 * you were just here.
 *
 * Mechanism: on each route, remember the path in sessionStorage; when the path has been seen this
 * session, stamp `data-seen-surface` on <html> and globals.css zeroes the stagger animation (content
 * simply present — the reduced-motion-equivalent presentation, so nothing is hidden and a11y is
 * unaffected). useLayoutEffect so the stamp lands before paint — the first frame of a revisit never
 * flashes the cascade. sessionStorage (not local) so a fresh visit tomorrow gets the premiere again.
 */
export function SurfaceMemory() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    try {
      const key = `mms.seen:${pathname}`;
      const seen = window.sessionStorage.getItem(key) === "1";
      document.documentElement.toggleAttribute("data-seen-surface", seen);
      if (!seen) window.sessionStorage.setItem(key, "1");
    } catch {
      // Storage unavailable (private mode quota etc.) → staggers just replay; purely cosmetic.
    }
  }, [pathname]);
  return null;
}
