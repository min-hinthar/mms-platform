"use client";
import { useEffect, useRef, useState } from "react";
import { useAnimationPreference, useDeviceTier } from "@mms/ui";
import { Confetti } from "./Confetti";
import { tierMeta } from "@/lib/rewards-tiers";

// Tier ladder rank (ascending). localStorage remembers the last tier the diner has SEEN celebrated, so the
// moment only fires on a genuine climb — never on first sight, a revisit, or a (refund) downgrade.
const RANK: Record<string, number> = { new: 0, jade: 1, ruby: 2, gold: 3 };
const SEEN_KEY = "mms_qr_seen_tier";
const DISMISS_MS = 5200;

/**
 * Tier-up celebration (R8) — a one-shot "you climbed a tier" moment on /account, ported from the delivery
 * app's pattern onto QR tokens. Fires ONLY on a strict upgrade vs the localStorage-remembered last-seen
 * rank (so a first-ever visit just records the baseline, and a revisit at the same tier stays silent);
 * one evaluation per mount (ref-guarded). Storage blocked (private mode) → it silently skips, never throws.
 *
 * The reveal is deferred to the next frame (rAF) so the setState is async (not a synchronous
 * setState-in-effect — lint-safe, matches the codebase's effect pattern) and the page paints before the
 * card animates in. Confetti is gated on `shouldAnimate && useDeviceTier() !== "low"` (mirrors PaySuccess —
 * the mobile GPU budget for the particle field) plus Confetti's own CSS reduced-motion off-switch; the
 * `.tier-up-card` enters with a `@media`-gated transform. a11y: `role="status"` announces it, the tier emoji
 * is `aria-hidden`, the dismiss button's visible "Nice!" is its accessible name (tap anywhere also dismisses).
 */
export function TierUpCelebration({ tierId }: { tierId: string }) {
  const { shouldAnimate } = useAnimationPreference();
  const tier = useDeviceTier();
  const celebrate = shouldAnimate && tier !== "low";
  const [show, setShow] = useState(false);
  const evaluated = useRef(false);

  useEffect(() => {
    if (evaluated.current) return;
    evaluated.current = true;
    const now = RANK[tierId] ?? 0;
    let seen: number | null;
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      seen = raw == null ? null : Number(raw);
      localStorage.setItem(SEEN_KEY, String(now)); // record the new baseline once, regardless of outcome
    } catch {
      return; // storage unavailable → skip the celebration entirely (never block the hub)
    }
    if (seen != null && Number.isFinite(seen) && now > seen) {
      // Defer to the next frame: async setState (lint-safe) + lets the hub paint before the card animates in.
      const id = requestAnimationFrame(() => setShow(true));
      return () => cancelAnimationFrame(id);
    }
  }, [tierId]);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), DISMISS_MS);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;
  const meta = tierMeta(tierId);

  return (
    <div className="tier-up" role="status" onClick={() => setShow(false)}>
      {celebrate && <Confetti count={48} />}
      <div className="tier-up-card">
        <span className="tier-up-emoji" aria-hidden>
          {meta.emoji}
        </span>
        <div className="tier-up-kicker">Tier unlocked</div>
        <div className="tier-up-name">
          {meta.name} <span style={{ color: "var(--t2)", fontWeight: 600 }}>· {meta.english}</span>
        </div>
        <p className="tier-up-sub">You’ve climbed the gem tiers — kyay-zu tin ba deh.</p>
        <button
          type="button"
          className="tier-up-dismiss"
          onClick={(e) => {
            e.stopPropagation();
            setShow(false);
          }}
        >
          Nice!
        </button>
      </div>
    </div>
  );
}
