"use client";
import { useEffect, useRef, useState } from "react";
import { useAnimationPreference, useDeviceTier } from "@mms/ui";
import { Confetti } from "./Confetti";
import { haptic } from "@/lib/haptics";
import { chime } from "@/lib/diner-sound";
import { rewardJustUnlocked } from "@/lib/rewards-progress";
import { hasCelebrated, markCelebrated, safeSessionStorage } from "@/lib/celebration-latch";

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
 *
 * Phase 1c · account-star — A RESUME IS NOT AN ARRIVAL (§15), now for the browser's own Back too.
 * Every link the app builds to /track carries `resume=1`, but the Stripe return URL IS the history
 * entry, so /track → /account (to save the Stars) → Back remounted this and replayed the confetti,
 * the haptic and the chime for a payment that moved no money this time. `celebrationKey` (the
 * PaymentIntent, or the split order id) latches the celebration per payment in sessionStorage
 * (lib/celebration-latch.ts); a remount of the same payment skips all three. Storage that throws
 * celebrates as before. The 1.05s thermal print still replays — its class is SSR'd, and reading a
 * latch there would be a hydration mismatch.
 */
export function PaySuccess({
  starsEarned,
  ordersToNext = null,
  stars = null,
  milestoneStep = null,
  isUpgraded = false,
  awaitingCapture = false,
  celebrationKey = null,
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
  /**
   * W23d — the payment is AUTHORIZED, not captured, and the order has not landed yet.
   *
   * Under W23c's manual capture a pickup PI reaches `requires_capture` when the diner confirms, and
   * Stripe still sends them here with `redirect_status=succeeded` — so this component's whole
   * premise ("this IS the success moment") is a beat early. The tap succeeded and the celebration
   * is earned; the SENTENCE is not, because no money has moved and no Star has been counted.
   *
   * So the checkmark and the confetti stay (they mark the order going through, not the charge) and
   * the two CLAIMS come off: the headline stops saying "Paid" and the Stars pill waits for a Star
   * that is issued at fulfillment. Both come back on their own the moment the order lands — the
   * caller passes `awaitingCapture && !order`.
   *
   * False for every automatic-capture payment, which is all of them until PICKUP_MANUAL_CAPTURE is
   * on, so today's celebration is untouched.
   */
  awaitingCapture?: boolean;
  /** Phase 1c — the payment this celebration belongs to (PaymentIntent, else the split order id);
   *  null = no latch (celebrates on every mount, as before). */
  celebrationKey?: string | null;
}) {
  const { shouldAnimate } = useAnimationPreference();
  const tier = useDeviceTier();
  const celebrate = shouldAnimate && tier !== "low";
  const [confettiDone, setConfettiDone] = useState(false);
  const hapticDone = useRef(false);
  // Phase 1c — has THIS payment already celebrated in this tab (a reload, or Back from /account to the
  // Stripe return URL)? Read once, in an initializer. SSR reads no storage (false) while the client may
  // read true; that cannot mismatch, because the only thing it gates at render is the confetti, and
  // `celebrate` is false on the server AND at hydration (useDeviceTier starts "low").
  const [replay] = useState(
    () => celebrationKey != null && hasCelebrated(safeSessionStorage(), celebrationKey),
  );

  // One-shot success haptic — an external-system write (not React state), so it's effect-legal. Fires once
  // per mount, and (Phase 1c) once per PAYMENT per tab: the latch (recorded by the chime effect below,
  // once the money has moved) keeps a refresh or a Back to the Stripe return URL from re-buzzing — or
  // replaying the confetti or the chime.
  //
  // W22c — this used to inline its own `matchMedia` reduced-motion guard and call
  // `navigator.vibrate([10, 40, 18])` directly, a second copy of a rule `lib/haptics` already owned.
  // Two implementations of one guard is how a reduced-motion user eventually gets buzzed by exactly
  // one of them. `celebrate` IS this pattern, and this is its only caller.
  useEffect(() => {
    if (hapticDone.current || replay) return;
    hapticDone.current = true;
    haptic("celebrate");
  }, [replay]);

  // W22f — the same beat, the other channel. Silent unless the diner asked for it; the confetti and
  // the receipt carry this moment on their own for everyone else (rule 2 — sound is never the only
  // feedback), which is what lets it be best-effort.
  //
  // Its own latch, NOT the haptic's. `awaitingCapture` is live — the caller passes
  // `awaitingCapture && !order`, so it flips false the moment the order lands — and the bell must
  // wait for that flip rather than be swallowed by a latch that already fired. While the flag is up
  // this component deliberately drops the word "Paid" because no money has moved, and the `paid`
  // chime's whole documented meaning is "the payment resolved home"; ringing it under a headline
  // softened for exactly that reason would put two contradicting claims on one screen — and the
  // audible one is the one no reviewer sees.
  //
  // Phase 1c (blind review) — the celebration LATCH is recorded HERE, when the moment completes, not
  // at mount: on the manual-capture path a mount-time latch meant a reload before the capture landed
  // read `replay` and this chime — which waits for the capture — never rang for that payment at all.
  // A reload while still awaiting replays the confetti and the buzz once more; the moment has not
  // happened yet, so that is the honest direction.
  const chimeDone = useRef(false);
  useEffect(() => {
    if (chimeDone.current || awaitingCapture || replay) return;
    chimeDone.current = true;
    if (celebrationKey != null) markCelebrated(safeSessionStorage(), celebrationKey);
    chime("paid");
  }, [awaitingCapture, replay, celebrationKey]);

  // Unmount the confetti overlay once the particles have fallen, so a fixed full-screen layer doesn't linger
  // for the page's life. setState in the timeout callback is async (not a synchronous setState-in-effect).
  useEffect(() => {
    if (!celebrate || replay) return;
    const t = setTimeout(() => setConfettiDone(true), CONFETTI_MS);
    return () => clearTimeout(t);
  }, [celebrate, replay]);

  // The milestone caption is gated on THIS viewer having actually earned the Star (starsEarned > 0) — a
  // split-tender non-host (who earns nothing; only the host does) gets no progress claim, just the pill-less
  // "Paid — thank you!". When this order completed a cycle (stars is a multiple of the step), the reward was
  // issued server-side → acknowledge it instead of the deflating "{step} orders to your next reward".
  // Phase 1c — the rule lives in lib/rewards-progress (moved verbatim): the save-your-Stars card quotes
  // "the reward you just unlocked" from the SAME binding, so the two claims cannot disagree.
  const earned = starsEarned > 0;
  const justUnlocked = rewardJustUnlocked({ earned, stars, milestoneStep });

  return (
    <div className="pay-success">
      {celebrate && !replay && !confettiDone && <Confetti />}
      {/* CSS-animated checkmark (ring scale-in + stroke draw). CSS — not framer — so the reduced-motion
          off-switch is a pure `@media (prefers-reduced-motion)` rule with no first-render shouldAnimate race
          and no SSR/hydration concern; framer's reducedMotion doesn't disable SVG pathLength anyway. */}
      <svg className="pay-success-check" viewBox="0 0 52 52" role="img" aria-hidden>
        <circle className="pay-success-check-ring" cx="26" cy="26" r="24" />
        <path className="pay-success-check-mark" d="M15 27 l7.5 7.5 L37.5 19" />
      </svg>
      <h1 className="pay-success-title">
        {awaitingCapture ? "Order sent — thank you!" : "Paid — thank you!"}
      </h1>
      {awaitingCapture && (
        <p className="pay-success-progress">
          Your card is authorized — we take the payment as we confirm the order.
        </p>
      )}
      {!awaitingCapture && earned && (
        <span className="pay-success-stars">
          <span aria-hidden>✦ </span>+{starsEarned} {starsEarned === 1 ? "Star" : "Stars"} earned
        </span>
      )}
      {/* Caption only for the actual earner (gated on `earned`), so a split non-host sees no progress claim.
          K3a: "saved to your account" only when upgraded — an anonymous diner's reward is device-bound, so
          the claim would be false (the header/account still nudge them to save it). */}
      {!awaitingCapture && earned && justUnlocked ? (
        <p className="pay-success-progress">
          {isUpgraded ? "Reward unlocked — saved to your account." : "Reward unlocked!"}
        </p>
      ) : !awaitingCapture && earned && ordersToNext != null && ordersToNext > 0 ? (
        <p className="pay-success-progress">
          {ordersToNext === 1
            ? "1 order to your next reward"
            : `${ordersToNext} orders to your next reward`}
        </p>
      ) : null}
    </div>
  );
}
