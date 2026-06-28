import type { CSSProperties } from "react";

/**
 * Avatar — a static initial-in-a-circle (P5.4). Pure presentational (Server-Component safe). The
 * caller supplies the resolved `initial` + `color` (QR derives these per-seat via `lib/avatars`
 * `seatInitial`/`seatColor`, which stay app-side — the color hash isn't a design-system concern).
 *
 * Decorative by default (`aria-hidden`) — pass `aria-label` (e.g. the guest's name) when the circle
 * is the only thing naming the person. `#fff` initial is intentional: `color` is always a vivid
 * fixed seat hue (theme-independent), so white is the legible choice in both themes. (The initial is
 * a redundant cue — every caller also names the person via `aria-label` or adjacent text — so the two
 * lightest seat hues sitting just under AA on white is a known, tracked nit, not a load-bearing gap.)
 */
const SIZES = { sm: { box: 22, font: 10 }, md: { box: 30, font: 12 } } as const;

export function Avatar({
  initial,
  color,
  size = "md",
  ring = false,
  "aria-label": ariaLabel,
}: {
  initial: string;
  /** Background fill — a resolved color (e.g. `seatColor(seat)`). */
  color: string;
  size?: keyof typeof SIZES;
  /** A 2px `--pg` ring — used to separate overlapping avatars in a group. */
  ring?: boolean;
  /** Accessible name; when omitted the circle is `aria-hidden` (decorative). */
  "aria-label"?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      style={{
        width: s.box,
        height: s.box,
        flex: "none",
        borderRadius: "var(--r-full)",
        background: color,
        display: "grid",
        placeItems: "center",
        color: "#fff",
        fontWeight: 800,
        fontSize: s.font,
        ...(ring ? { border: "2px solid var(--pg)" } : null),
      }}
    >
      {initial}
    </span>
  );
}
