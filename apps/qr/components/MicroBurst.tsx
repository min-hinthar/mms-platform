"use client";

/**
 * W13 — the v7.2 `microGems` moment: five ✦/◆ particles bursting from the add control on success.
 * The Confetti idiom, miniaturized: DETERMINISTIC offsets (no Math.random — SSR/replay-safe),
 * token colors, transform/opacity only, and the `--dur-slow` token duration so the reduced-motion
 * token collapse freezes it at its final (invisible) frame. Re-keyed by `burstKey` so every add replays
 * the animation; `aria-hidden` — pure celebration, the toast is the announcement.
 */
const GEMS: { glyph: string; x: number; y: number; d: number }[] = [
  { glyph: "✦", x: -26, y: -30, d: 0 },
  { glyph: "◆", x: 24, y: -34, d: 40 },
  { glyph: "✦", x: -34, y: 6, d: 80 },
  { glyph: "◆", x: 32, y: 2, d: 20 },
  { glyph: "✦", x: 2, y: -42, d: 60 },
];

export function MicroBurst({ burstKey }: { burstKey: number }) {
  if (burstKey === 0) return null;
  return (
    <span key={burstKey} className="mms-burst" aria-hidden="true">
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
