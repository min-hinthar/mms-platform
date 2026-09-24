"use client";
import { useRef, useState } from "react";

/**
 * W13 — the v7.2 `microGems` moment: five ✦/◆ particles bursting from the add control.
 * The Confetti idiom, miniaturized: DETERMINISTIC offsets (no Math.random — SSR/replay-safe),
 * token colors, transform/opacity only, and the `--dur-slow` token duration so the reduced-motion
 * token collapse freezes it at its final (invisible) frame. Re-keyed by `burstKey`.
 *
 * Phase 1c — it acknowledges INTENT, like the morph: it fires on the Add pill's 0→1 TAP (v7.2
 * quickAdd), not per stepper step (v7.2 `bump()` has no gems) and not on confirmation. It ends ≤560ms
 * after the tap, long before a non-landing can arrive, which is retracted by the "+" glyph's settle cue
 * and the named correction. `aria-hidden` — pure celebration; the one live region is the announcement.
 */
const GEMS: { glyph: string; x: number; y: number; d: number }[] = [
  { glyph: "✦", x: -26, y: -30, d: 0 },
  { glyph: "◆", x: 24, y: -34, d: 40 },
  { glyph: "✦", x: -34, y: 6, d: 80 },
  { glyph: "◆", x: 32, y: 2, d: 20 },
  { glyph: "✦", x: 2, y: -42, d: 60 },
];

export function MicroBurst({ burstKey }: { burstKey: number }) {
  // Unmount once every gem has finished (review LOW — the plan's "unmount on animationend"):
  // animationend BUBBLES from the gems to this wrapper; count per burstKey (a re-key mid-flight
  // starts a fresh count). Under reduced motion the collapsed animations still fire animationend.
  const ended = useRef({ key: 0, n: 0 });
  const [doneKey, setDoneKey] = useState(0);
  if (burstKey === 0 || doneKey >= burstKey) return null;
  return (
    <span
      key={burstKey}
      className="mms-burst"
      aria-hidden="true"
      onAnimationEnd={() => {
        if (ended.current.key !== burstKey) ended.current = { key: burstKey, n: 0 };
        ended.current.n += 1;
        if (ended.current.n >= GEMS.length) setDoneKey(burstKey);
      }}
    >
      {GEMS.map((g, i) => (
        <span
          key={i}
          className="mms-burst-gem"
          style={
            {
              "--bx": `${g.x}px`,
              "--by": `${g.y}px`,
              "--bdelay": `${g.d}ms`,
            } as React.CSSProperties
          }
        >
          {g.glyph}
        </span>
      ))}
    </span>
  );
}
