import type { CSSProperties, ReactNode } from "react";

/**
 * Badge — a small status/role chip (P5.4). Pure presentational (no hooks → renders in Server
 * Components, like its callers `RoleBadge`/`FloorStatusChip`).
 *
 * Prefer a semantic **`tone`** — it carries the AA-correct mapping (text uses the `-strong` token on a
 * tinted fill so it clears 4.5:1; the decorative dot keeps the vivid hue). That rule lives HERE, once,
 * instead of in every call site. For a bespoke palette the presets don't cover (e.g. flat fill on
 * `--cd` with a border), pass explicit `color`/`background`/`dot` instead (they override the tone).
 *
 * a11y: the label (children) carries the meaning — pass a **text** label (color is never the only
 * signal). For a purely decorative chip (a dupe of an existing accessible name) pass `decorative`
 * (→ `aria-hidden`); for an icon-only chip pass `aria-label`.
 */
export type BadgeTone = "neutral" | "accent" | "ok" | "warn" | "gold" | "jade";

const TONES: Record<BadgeTone, { color: string; background: string; dot: string }> = {
  // Tinted tones: `-strong` text on a low-% fill (AA), vivid dot (aria-hidden, identity only).
  accent: { color: "var(--ac-strong)", background: "color-mix(in srgb, var(--ac) 14%, transparent)", dot: "var(--ac)" }, // prettier-ignore
  gold: { color: "var(--gold-strong)", background: "color-mix(in srgb, var(--gold) 16%, transparent)", dot: "var(--gold)" }, // prettier-ignore
  jade: { color: "var(--jade-strong)", background: "color-mix(in srgb, var(--jade) 16%, transparent)", dot: "var(--jade)" }, // prettier-ignore
  // Solid status tones: text on its paired surface token; dot matches the text.
  ok: { color: "var(--ok)", background: "var(--okb)", dot: "var(--ok)" },
  warn: { color: "var(--warn)", background: "var(--warnb)", dot: "var(--warn)" },
  neutral: { color: "var(--t2)", background: "var(--cd)", dot: "var(--t2)" },
};

export function Badge({
  children,
  tone,
  color,
  background,
  dot,
  bordered = false,
  decorative = false,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  /** Semantic preset (AA-correct). Omit and pass `color`/`background` for a bespoke palette. */
  tone?: BadgeTone;
  /** Explicit text color (token `var(--…)`) — overrides `tone`. On a tint, use the `-strong` variant. */
  color?: string;
  /** Explicit fill color (token `var(--…)`) — overrides `tone`. */
  background?: string;
  /** Decorative dot color; defaults to the tone's dot when a `tone` is set. */
  dot?: string;
  /** Add a 1px `--bd` hairline (the floor-status "outlined" look). */
  bordered?: boolean;
  /** Hide the whole chip from assistive tech (use when it merely dupes an existing accessible name). */
  decorative?: boolean;
  /** Accessible name for an icon-only chip (when children carry no text). */
  "aria-label"?: string;
}) {
  const preset = tone ? TONES[tone] : null;
  const fg = color ?? preset?.color ?? "var(--tx)";
  const bg = background ?? preset?.background ?? "transparent";
  const dotColor = dot ?? preset?.dot;
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={ariaLabel}
      style={{
        ...chip,
        color: fg,
        background: bg,
        ...(bordered ? { border: "1px solid var(--bd)" } : null),
      }}
    >
      {dotColor ? <span aria-hidden style={{ ...dotStyle, background: dotColor }} /> : null}
      {children}
    </span>
  );
}

const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px",
  borderRadius: "var(--r-full)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
};
const dotStyle: CSSProperties = {
  width: 7,
  height: 7,
  flex: "none",
  borderRadius: "var(--r-full)",
};
