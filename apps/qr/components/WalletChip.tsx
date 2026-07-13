"use client";
import type { CSSProperties } from "react";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import type { RewardsBadge } from "@/lib/rewards";
import { tierMeta, tierTint } from "@/lib/rewards-tiers";

/**
 * K3a — the persistent Stars wallet chip for a SIGNED-IN diner: the tier glyph + a tier tint + the
 * live Stars balance, tapping through to /account. **Recognition, not a pitch** — it renders NOTHING
 * for an anonymous diner (they keep the quiet header treatment / no checkout chip). Presentation only:
 * the balance is the server-derived `getRewardsBadge` value; the client never computes a balance.
 * Used in the menu header (AppHeader) and the checkout review so a returning diner sees their standing
 * at the two moments that matter.
 */
export function WalletChip({
  badge,
  className,
}: {
  badge: RewardsBadge | null;
  className?: string;
}) {
  if (!badge || !badge.isUpgraded) return null; // anon → quiet (the caller decides its own fallback)
  const tier = tierMeta(badge.tierId);
  const tint = tierTint(badge.tierId);
  const stars = badge.stars;
  return (
    <Link
      href="/account"
      className={`wallet-chip${className ? ` ${className}` : ""}`}
      style={
        {
          "--chip-tint": tint.fill,
          "--chip-tint-text": tint.text,
        } as CSSProperties
      }
      aria-label={`Rewards — ${stars} ${stars === 1 ? "Star" : "Stars"}, ${tier.english} tier`}
    >
      <span className="wallet-chip-glyph" aria-hidden>
        {tier.emoji}
      </span>
      <span className="wallet-chip-count" aria-hidden>
        {stars}
      </span>
      <span className="wallet-chip-star" aria-hidden>
        ✦
      </span>
    </Link>
  );
}
