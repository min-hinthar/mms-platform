"use client";

import { useEffect } from "react";

/**
 * M126 — the JS half of the page atmosphere (`.paper-ambient`, globals.css § THE ROOM).
 *
 * One job: on a FINE pointer, write `--pa-px`/`--pa-py` (unitless −1…1) so the far and mid planes
 * sway under the cursor. rAF-throttled to one style write per frame, and it writes only custom
 * properties that drive `translate`, so it never triggers layout or paint.
 *
 * Phase 0 retired the second job — the clock-driven drift on phones and the fixed pause coin WCAG
 * 2.2.2 then required. The coin sat over dish photos and section headings at ordinary scroll
 * positions (OPEN-ITEMS F11), and a background that moves on its own is the least useful motion on
 * a screen whose job is ordering food. Motion under the diner's own hand is not auto-motion, so no
 * stop control is owed; if a clock-driven drift ever returns, its pause control returns with it.
 *
 * Under reduced motion no listener is attached and `--pa-px`/`--pa-py` are never written (so the
 * CSS defaults of 0 hold even if the RM block were somehow missed). The media queries are re-read on `change`, so a user who turns reduced motion on
 * mid-session gets the listener torn down.
 *
 * NO GYRO, deliberately: DeviceOrientation needs a permission prompt on iOS 13+, and a modal
 * permission dialog for a decorative layer is a bad trade. NO SCROLL COUPLING: the repo's ban on
 * scroll-driven background parallax (motion sickness) stands, and nothing here reads scrollTop.
 */
export function AmbientMotion() {
  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)");
    const root = document.documentElement;
    let raf = 0;

    const onPointer = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.style.setProperty("--pa-px", String((e.clientX / window.innerWidth) * 2 - 1));
        root.style.setProperty("--pa-py", String((e.clientY / window.innerHeight) * 2 - 1));
      });
    };

    const apply = () => {
      window.removeEventListener("pointermove", onPointer);
      root.style.removeProperty("--pa-px");
      root.style.removeProperty("--pa-py");
      // M146 (Codex P2 on #238) — the dial is part of the motion decision, not just a CSS selector.
      // This listener used to read `prefers-reduced-motion` and pointer type ONLY, so a desktop
      // diner who set the dial to `off` still had `--pa-px`/`--pa-py` written every frame and both
      // planes translating. `off` is an explicit "still the room", so it belongs here beside the OS
      // preference; the CSS block mirrors it as a belt.
      const motionOk = !rm.matches && root.dataset.fx !== "off";
      if (motionOk && fine.matches) {
        window.addEventListener("pointermove", onPointer, { passive: true });
      }
    };

    apply();
    // The dial WRITES `data-fx` at runtime (`FxDial.tsx` sets/deletes `root.dataset.fx`), so
    // reading it once at mount would leave the listener attached for the rest of the session on a
    // diner who turns effects off. A MutationObserver on the one attribute is the cheapest thing
    // that reacts, and it is symmetrical with the media-query listeners below.
    const fx = new MutationObserver(apply);
    fx.observe(root, { attributes: true, attributeFilter: ["data-fx"] });
    // Legacy MediaQueryList (Safari/iOS <14, still targeted here — cf. the <15.4 dvh sheet
    // fallback) lacks addEventListener, and calling it would THROW at mount and trip the page's
    // error boundary over a decorative layer. The repo already holds this line in three places
    // (ThemeSync, StartHereBand, packages/ui motion.ts); this is the same shape, not a new one.
    const listen = (mq: MediaQueryList) => {
      if (mq.addEventListener) {
        mq.addEventListener("change", apply);
        return () => mq.removeEventListener("change", apply);
      }
      mq.addListener(apply);
      return () => mq.removeListener(apply);
    };
    const unlisten = [listen(rm), listen(fine)];
    return () => {
      fx.disconnect();
      for (const off of unlisten) off();
      window.removeEventListener("pointermove", onPointer);
      if (raf) cancelAnimationFrame(raf);
      root.style.removeProperty("--pa-px");
      root.style.removeProperty("--pa-py");
    };
  }, []);

  return null;
}
