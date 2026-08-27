"use client";

import { useEffect, useState } from "react";

/**
 * M126 — the JS half of the page atmosphere (`.paper-ambient`, globals.css § THE ROOM).
 *
 * Two jobs, and nothing else:
 *  1. On a FINE pointer, write `--pa-px`/`--pa-py` (unitless −1…1) so the far and mid planes sway
 *     under the cursor. rAF-throttled to one style write per frame, and it writes only custom
 *     properties that drive `translate`, so it never triggers layout or paint.
 *  2. On a COARSE pointer — where there is no cursor and the planes drift on a clock instead —
 *     render the visible pause control WCAG 2.2.2 requires. Desktop never sees it, because there
 *     the ambient moves only under the user's own hand, which is not auto-motion.
 *
 * Under reduced motion neither happens: no listener is attached, `--pa-px`/`--pa-py` are never
 * written (so the CSS defaults of 0 hold even if the RM block were somehow missed), and the control
 * does not render. The media queries are re-read on `change`, so a user who turns reduced motion on
 * mid-session gets the listener torn down and the button unmounted rather than a frozen animation
 * and a dead control.
 *
 * NO GYRO, deliberately: DeviceOrientation needs a permission prompt on iOS 13+, and a modal
 * permission dialog for a decorative layer is a bad trade. NO SCROLL COUPLING: the repo's ban on
 * scroll-driven background parallax (motion sickness) stands, and nothing here reads scrollTop.
 */
export function AmbientMotion() {
  // True only when the coarse-pointer drift can actually run — i.e. when there IS something to
  // stop. Mirrors `.start-here-pause`: a stop button for still content is noise, not compliance.
  const [drift, setDrift] = useState(false);
  const [paused, setPaused] = useState(false);

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
      const motionOk = !rm.matches;
      setDrift(motionOk && !fine.matches);
      if (motionOk && fine.matches) {
        window.addEventListener("pointermove", onPointer, { passive: true });
      }
    };

    apply();
    rm.addEventListener("change", apply);
    fine.addEventListener("change", apply);
    return () => {
      rm.removeEventListener("change", apply);
      fine.removeEventListener("change", apply);
      window.removeEventListener("pointermove", onPointer);
      if (raf) cancelAnimationFrame(raf);
      root.style.removeProperty("--pa-px");
      root.style.removeProperty("--pa-py");
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (paused) root.dataset.ambient = "paused";
    else delete root.dataset.ambient;
    return () => {
      delete root.dataset.ambient;
    };
  }, [paused]);

  if (!drift) return null;
  return (
    <button
      type="button"
      className="pa-pause"
      aria-pressed={paused}
      aria-label={paused ? "Play the background motion" : "Pause the background motion"}
      onClick={() => setPaused((p) => !p)}
    >
      <span aria-hidden>{paused ? "▶︎" : "❙❙"}</span>
    </button>
  );
}
