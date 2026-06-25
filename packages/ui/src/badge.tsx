import type { CSSProperties, ReactNode } from "react";

/**
 * Badge — a small status/role chip (P5.4). Pure presentational (no hooks → renders in Server
 * Components, like its callers `RoleBadge`/`FloorStatusChip`). Token-pure: pass token `var(--…)`
 * values for `color`/`background`/`dot`; the consumer keeps its own semantic→token map so colors are
 * preserved exactly (no fixed variant enum — QR's badges use genuinely different palettes).
 *
 * a11y: the label (children) carries the meaning; the dot is decorative (`aria-hidden`) — never
 * color-alone. Keep the children to a short word or two.
 */
export function Badge({
  children,
  color,
  background,
  dot,
  bordered = false,
}: {
  children: ReactNode;
  /** Text color — a token `var(--…)`. On a tinted fill use the `-strong` variant to clear AA. */
  color: string;
  /** Fill color — a token `var(--…)`. */
  background: string;
  /** When set, render a decorative dot in this color (typically the vivid hue or the text color). */
  dot?: string;
  /** Add a 1px `--bd` hairline (the floor-status "outlined" look). */
  bordered?: boolean;
}) {
  return (
    <span
      style={{
        ...chip,
        color,
        background,
        ...(bordered ? { border: "1px solid var(--bd)" } : null),
      }}
    >
      {dot ? <span aria-hidden style={{ ...dotStyle, background: dot }} /> : null}
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
