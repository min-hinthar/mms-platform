"use client";
import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import { useAnimationPreference, useDeviceTier } from "@mms/ui";
import { Confetti } from "./Confetti";

// Longest particle fall (Confetti: max dur 1700+6·160=2660ms + max delay 270ms) + buffer → unmount after.
const CONFETTI_MS = 3200;

/**
 * Pay-success celebration (R7a) — the "one celebratory thunk" on `/track` arrival after a successful payment
 * (the Payment Element hard-redirects, so this IS the success moment, not an in-checkout one). A draw-on
 * checkmark + "Paid — thank you!" + a "✦ +N gems earned" pill, with a one-shot confetti burst + a success
 * haptic.
 *
 * Gating: confetti only when `shouldAnimate` (reduced-motion off-switch) AND `useDeviceTier()!=="low"` (mobile
 * GPU budget) — computed at render, so no setState-in-effect. The haptic is a one-shot external-system write
 * (ref-guarded, all tiers). No live region here — the tracker's single `role="status"` carries the spoken
 * confirmation. Gems = round(total): a REAL value (the amount paid) via a deterministic display rule (≈1/$),
 * never a fabricated balance.
 */
export function PaySuccess({ gems }: { gems: number | null }) {
  const { shouldAnimate } = useAnimationPreference();
  const tier = useDeviceTier();
  const celebrate = shouldAnimate && tier !== "low";
  const [confettiDone, setConfettiDone] = useState(false);
  const hapticDone = useRef(false);

  // One-shot success haptic — an external-system write (not React state), so it's effect-legal. Fires once
  // per mount; a page refresh re-mounts and may re-buzz (acceptable, same as the confetti).
  useEffect(() => {
    if (hapticDone.current || !shouldAnimate) return;
    hapticDone.current = true;
    try {
      navigator.vibrate?.([10, 40, 18]);
    } catch {
      /* unsupported */
    }
  }, [shouldAnimate]);

  // Unmount the confetti overlay once the particles have fallen, so a fixed full-screen layer doesn't linger
  // for the page's life. setState in the timeout callback is async (not a synchronous setState-in-effect).
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setConfettiDone(true), CONFETTI_MS);
    return () => clearTimeout(t);
  }, [celebrate]);

  return (
    <div className="pay-success">
      {celebrate && !confettiDone && <Confetti />}
      <svg className="pay-success-check" viewBox="0 0 52 52" role="img" aria-hidden>
        <m.circle
          className="pay-success-check-ring"
          cx="26"
          cy="26"
          r="24"
          initial={shouldAnimate ? { scale: 0 } : false}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 16 }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <m.path
          className="pay-success-check-mark"
          d="M15 27 l7.5 7.5 L37.5 19"
          initial={shouldAnimate ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.18, ease: "easeOut" }}
        />
      </svg>
      <h1 className="pay-success-title">Paid — thank you!</h1>
      {gems != null && gems > 0 && (
        <span className="pay-success-gems">
          <span aria-hidden>✦ </span>+{gems} gems earned
        </span>
      )}
    </div>
  );
}
