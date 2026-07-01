"use client";
import type { CSSProperties } from "react";
import { NumberFlow } from "@mms/ui";

// Geometry — the v7.2 prototype ring (r=66, stroke 11) on a 148px box.
const SIZE = 148;
const R = 66;
const STROKE = 11;
const C = 2 * Math.PI * R; // circumference (full dasharray)
const CX = SIZE / 2; // 74 — center

// Arc stroke tinted by tier (currentColor on the arc). Tokens only — never hex. Ruby has no own QR token,
// so it borrows the accent; jade/gold use their *-strong (text-grade saturation) so the thin arc stays visible.
const TIER_COLOR: Record<string, string> = {
  new: "var(--ac)",
  jade: "var(--jade-strong)",
  ruby: "var(--ac)",
  gold: "var(--gold-strong)",
};

/**
 * Stars progress ring (R8) — an SVG stroke-dashoffset arc over the REAL milestone cycle (the prototype's
 * conic look, built as an SVG stroke since QR has no conic-gradient). The draw-on is pure CSS (a
 * `@media (prefers-reduced-motion)` off-switch — no `shouldAnimate` first-render race, SSR-safe; see
 * `.claude/LEARNINGS.md`), and the center ✦{stars} rolls via NumberFlow (which self-gates reduced motion).
 *
 * a11y: the SVG + center glyph/number are purely decorative (`aria-hidden`); the wrapper carries the ONE
 * composed `role="img"` label that states the real count + the milestone caption — so AT announces it once.
 * Progress is honest cycle-fill (`(milestoneStep − ordersToNext) % milestoneStep`); `ordersToNext` is
 * strictly ≥1, so a freshly-earned cycle correctly resets the arc to empty.
 */
export function StarsRing({
  stars,
  milestoneStep,
  ordersToNext,
  tierId = "new",
  caption,
}: {
  stars: number;
  milestoneStep: number;
  ordersToNext: number;
  tierId?: string;
  /** The visible + announced milestone line, e.g. "3 orders to your next reward". */
  caption: string;
}) {
  const step = milestoneStep > 0 ? milestoneStep : 5;
  const inCycle = Math.max(0, step - ordersToNext) % step; // 0..step-1 filled toward the next reward
  const pct = inCycle / step;
  const target = C * (1 - pct); // resting dashoffset; CSS draws from C (empty) → target
  const arcColor = TIER_COLOR[tierId] ?? "var(--ac)";

  return (
    <div
      className="stars-ring"
      role="img"
      aria-label={`${stars} ${stars === 1 ? "Star" : "Stars"}. ${caption}`}
      style={{ color: arcColor } as CSSProperties}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <circle cx={CX} cy={CX} r={R} fill="none" stroke="var(--bd)" strokeWidth={STROKE} />
        <circle
          className="stars-ring-arc"
          cx={CX}
          cy={CX}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          transform={`rotate(-90 ${CX} ${CX})`}
          style={
            {
              strokeDasharray: C,
              strokeDashoffset: target,
              // Unitless to match the resting `strokeDashoffset` (user units), so the @keyframes
              // `from: var(--ring-c)` → resting target interpolates as numbers (a px↔number mix won't animate).
              ["--ring-c" as string]: `${C}`,
            } as CSSProperties
          }
        />
      </svg>
      <div className="stars-ring-center" aria-hidden>
        <span className="stars-ring-glyph">✦</span>
        <span className="stars-ring-count">
          <NumberFlow value={stars} />
        </span>
      </div>
    </div>
  );
}
