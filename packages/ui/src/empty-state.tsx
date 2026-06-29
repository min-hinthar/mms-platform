import type { CSSProperties, ReactNode } from "react";
import { Card } from "./card";

/**
 * EmptyState — the "nothing here yet" card (P5.4). Pure presentational (no hooks → Server-Component
 * safe). Composes the shared `<Card>` surface (single source of truth — no re-inlined `.card` recipe)
 * + a bold title, optional muted subtitle, optional decorative icon, and an optional action slot.
 *
 * a11y: the icon is decorative (`aria-hidden`); the title carries the meaning. Default `titleAs="p"`
 * is right when the EmptyState sits INSIDE a region a heading already names (e.g. a board `<h2>`). For a
 * STANDALONE empty region (no surrounding heading), pass `titleAs="h2"`/`"h3"` so screen-reader users
 * get a discoverable heading. For content that *becomes* empty dynamically, pair with a live region
 * (the staff boards already own a polite `role="status"` that announces "All clear").
 */
export function EmptyState({
  title,
  subtitle,
  icon,
  action,
  titleAs: TitleTag = "p",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Decorative glyph/emoji — rendered `aria-hidden`. */
  icon?: ReactNode;
  /** Optional CTA (e.g. a retry button) rendered below the copy. */
  action?: ReactNode;
  /** Title element — `"p"` (default) when inside an already-named region; a heading when standalone. */
  titleAs?: "p" | "h2" | "h3";
}) {
  return (
    <Card style={{ padding: "var(--s6)" }}>
      {icon ? (
        <div aria-hidden style={iconRow}>
          {icon}
        </div>
      ) : null}
      <TitleTag style={titleStyle}>{title}</TitleTag>
      {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      {action ? <div style={{ marginTop: "var(--s4)" }}>{action}</div> : null}
    </Card>
  );
}

const iconRow: CSSProperties = { fontSize: 28, marginBottom: "var(--s2)", lineHeight: 1 };
// Body font + weight 600 regardless of element, so a heading `titleAs` doesn't pull the display serif.
const titleStyle: CSSProperties = { margin: 0, fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 16 };
const subtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 14,
  color: "var(--t2)",
  lineHeight: 1.5,
};
