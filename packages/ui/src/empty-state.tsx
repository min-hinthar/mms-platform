import type { CSSProperties, ReactNode } from "react";

/**
 * EmptyState — the "nothing here yet" card (P5.4). Pure presentational (no hooks → Server-Component
 * safe). Renders the standard empty card surface from shared tokens (matches the app `.card` look) +
 * a bold title, optional muted subtitle, optional decorative icon, and an optional action slot.
 *
 * a11y: the icon is decorative (`aria-hidden`); the title carries the meaning. For a board whose
 * heading already names the region, keep the title a short status line (e.g. "Nothing to approve").
 */
export function EmptyState({
  title,
  subtitle,
  icon,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Decorative glyph/emoji — rendered `aria-hidden`. */
  icon?: ReactNode;
  /** Optional CTA (e.g. a retry button) rendered below the copy. */
  action?: ReactNode;
}) {
  return (
    <div style={surface}>
      {icon ? (
        <div aria-hidden style={iconRow}>
          {icon}
        </div>
      ) : null}
      <p style={titleStyle}>{title}</p>
      {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      {action ? <div style={{ marginTop: "var(--s4)" }}>{action}</div> : null}
    </div>
  );
}

const surface: CSSProperties = {
  background: "var(--cd)",
  border: "1px solid var(--bd)",
  borderRadius: "var(--r-card)",
  boxShadow: "var(--sh)",
  padding: "var(--s6)",
};
const iconRow: CSSProperties = { fontSize: 28, marginBottom: "var(--s2)", lineHeight: 1 };
const titleStyle: CSSProperties = { margin: 0, fontWeight: 600 };
const subtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 14,
  color: "var(--t2)",
  lineHeight: 1.5,
};
