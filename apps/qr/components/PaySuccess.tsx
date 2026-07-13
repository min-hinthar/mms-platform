"use client";
import { useEffect, useRef, useState } from "react";
import { useAnimationPreference, useDeviceTier } from "@mms/ui";
import { Confetti } from "./Confetti";

// Longest particle fall (Confetti: max dur 1700+6·160=2660ms + max delay 270ms) + buffer → unmount after.
const CONFETTI_MS = 3200;

/**
 * Pay-success celebration (R7a · R8) — the "one celebratory thunk" on `/track` arrival after a successful
 * payment (the Payment Element hard-redirects, so this IS the success moment, not an in-checkout one). A
 * draw-on checkmark + "Paid — thank you!" + a "✦ +N Stars earned" pill, with a one-shot confetti burst + a
 * success haptic.
 *
 * R8: the pill shows the REAL loyalty earn — `starsEarned` is the honest per-order constant (1 paid order =
 * 1 Star; see `mms_rewards_summary`), NOT R7a's old `gems = round(total)` display rule. When the milestone
 * progress resolves (the order has landed → the webhook counted it), an optional caption shows how many
 * orders remain to the next reward; if the summary isn't available (no session on /track), the pill stands
 * alone — still fully truthful.
 *
 * Gating: confetti only when `shouldAnimate` (reduced-motion off-switch) AND `useDeviceTier()!=="low"`
 * (mobile GPU budget) — computed at render, so no setState-in-effect. The haptic is a one-shot
 * external-system write (ref-guarded, all tiers). No live region here — the tracker's single `role="status"`
 * carries the spoken confirmation.
 */
export function PaySuccess({
  starsEarned,
  ordersToNext = null,
  stars = null,
  milestoneStep = null,
  isUpgraded = false,
}: {
  /** Stars earned by this order — the honest constant (1 per paid order), 0 if the viewer isn't the earner. */
  starsEarned: number;
  /** Orders remaining to the next reward, once the milestone summary resolves; null = not (yet) available. */
  ordersToNext?: number | null;
  /** The viewer's total Stars after this order (for the just-unlocked check); null = summary unavailable. */
  stars?: number | null;
  /** Reward cadence (Stars per reward); null = summary unavailable. */
  milestoneStep?: number | null;
  /** K3a: a confirmed account — only then is the reward "saved to your account"; an anonymous diner's
   *  is device-bound (the copy must not over-claim). */
  isUpgraded?: boolean;
}) {
  const { shouldAnimate } = useAnimationPreference();
  const tier = useDeviceTier();
  const celebrate = shouldAnimate && tier !== "low";
  const [confettiDone, setConfettiDone] = useState(false);
  const hapticDone = useRef(false);

  // One-shot success haptic — an external-system write (not React state), so it's effect-legal. Fires once
  // per mount; a page refresh re-mounts and may re-buzz (acceptable, same as the confetti). Read the
  // reduced-motion preference SYNCHRONOUSLY here: `useAnimationPreference()` seeds `shouldAnimate=true` until
  // its own media-query effect resolves, so trusting it on the first-mount pass would buzz a reduced-motion
  // user once before the off-switch flips. `matchMedia` is authoritative + race-free on the client.
  useEffect(() => {
    if (hapticDone.current) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    hapticDone.current = true;
    try {
      navigator.vibrate?.([10, 40, 18]);
    } catch {
      /* unsupported */
    }
  }, []);

  // Unmount the confetti overlay once the particles have fallen, so a fixed full-screen layer doesn't linger
  // for the page's life. setState in the timeout callback is async (not a synchronous setState-in-effect).
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setConfettiDone(true), CONFETTI_MS);
    return () => clearTimeout(t);
  }, [celebrate]);

  // The milestone caption is gated on THIS viewer having actually earned the Star (starsEarned > 0) — a
  // split-tender non-host (who earns nothing; only the host does) gets no progress claim, just the pill-less
  // "Paid — thank you!". When this order completed a cycle (stars is a multiple of the step), the reward was
  // issued server-side → acknowledge it instead of the deflating "{step} orders to your next reward".
  const earned = starsEarned > 0;
  const justUnlocked =
    earned && stars != null && milestoneStep != null && stars > 0 && stars % milestoneStep === 0;

  return (
    <div className="pay-success">
      {celebrate && !confettiDone && <Confetti />}
      {/* CSS-animated checkmark (ring scale-in + stroke draw). CSS — not framer — so the reduced-motion
          off-switch is a pure `@media (prefers-reduced-motion)` rule with no first-render shouldAnimate race
          and no SSR/hydration concern; framer's reducedMotion doesn't disable SVG pathLength anyway. */}
      <svg className="pay-success-check" viewBox="0 0 52 52" role="img" aria-hidden>
        <circle className="pay-success-check-ring" cx="26" cy="26" r="24" />
        <path className="pay-success-check-mark" d="M15 27 l7.5 7.5 L37.5 19" />
      </svg>
      <h1 className="pay-success-title">Paid — thank you!</h1>
      {earned && (
        <span className="pay-success-stars">
          <span aria-hidden>✦ </span>+{starsEarned} {starsEarned === 1 ? "Star" : "Stars"} earned
        </span>
      )}
      {/* Caption only for the actual earner (gated on `earned`), so a split non-host sees no progress claim.
          K3a: "saved to your account" only when upgraded — an anonymous diner's reward is device-bound, so
          the claim would be false (the header/account still nudge them to save it). */}
      {earned && justUnlocked ? (
        <p className="pay-success-progress">
          {isUpgraded ? "Reward unlocked — saved to your account." : "Reward unlocked!"}
        </p>
      ) : earned && ordersToNext != null && ordersToNext > 0 ? (
        <p className="pay-success-progress">
          {ordersToNext === 1
            ? "1 order to your next reward"
            : `${ordersToNext} orders to your next reward`}
        </p>
      ) : null}
    </div>
  );
}
