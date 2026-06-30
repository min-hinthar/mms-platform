"use client";
import type { CSSProperties } from "react";

// Triad palette (gold/jade/clay) — tokens, not hex.
const COLORS = ["var(--gold)", "var(--jade)", "var(--ac)", "var(--gold-strong)"];

/**
 * One-shot confetti field (R7a). ≤90 CSS-animated spans (transform/opacity only — cheaper than 90 framer
 * nodes and runs off the main thread), token-colored, deterministic spread (no Math.random → no hydration
 * concern; it only mounts client-side on the success beat anyway). Purely decorative: a fixed overlay,
 * pointer-events-none, aria-hidden. The CALLER (`PaySuccess`) gates on reduced-motion + device tier and
 * unmounts it after the fall; `.mms-confetti` is also `display:none` under reduced-motion as a backstop.
 */
export function Confetti({ count = 80 }: { count?: number }) {
  return (
    <div className="mms-confetti" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const size = 6 + (i % 4) * 2;
        const style: CSSProperties = {
          left: `${(i * 37) % 100}%`,
          width: size,
          height: size * 1.6,
          background: COLORS[i % COLORS.length],
          // Per-particle variation via custom props consumed by the @keyframes (globals.css).
          ["--cf-drift" as string]: `${((i % 11) - 5) * 14}px`,
          ["--cf-rot" as string]: `${(i % 2 ? 1 : -1) * (180 + (i % 5) * 90)}deg`,
          ["--cf-dur" as string]: `${1700 + (i % 7) * 160}ms`,
          ["--cf-delay" as string]: `${(i % 10) * 30}ms`,
        } as CSSProperties;
        return <span key={i} className="mms-confetti-pc" style={style} />;
      })}
    </div>
  );
}
