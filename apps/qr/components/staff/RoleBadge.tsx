import { type CSSProperties } from "react";
import type { StaffRole } from "@/lib/staff";

/**
 * Role chip (S1.1a) — owner / manager / server, color-coded from tokens (never hardcoded). Pure
 * presentational, so it renders inside server components. The role name is the accessible text;
 * the dot is decorative (aria-hidden).
 *
 * Contrast (S1-audit B3): the TEXT uses the `-strong` token (plain --gold/--ac on their ~14–16% tint
 * measure sub-AA — bright gold-as-text is a hard fail); the decorative dot keeps the vivid hue for the
 * color identity (it's aria-hidden, so its contrast doesn't gate AA).
 */
const STYLES: Record<StaffRole, { fg: string; dot: string; bg: string; label: string }> = {
  owner: {
    fg: "var(--gold-strong)",
    dot: "var(--gold)",
    bg: "color-mix(in srgb, var(--gold) 16%, transparent)",
    label: "Owner",
  },
  manager: {
    fg: "var(--jade-strong)",
    dot: "var(--jade)",
    bg: "color-mix(in srgb, var(--jade) 16%, transparent)",
    label: "Manager",
  },
  server: {
    fg: "var(--ac-strong)",
    dot: "var(--ac)",
    bg: "color-mix(in srgb, var(--ac) 14%, transparent)",
    label: "Server",
  },
};

export function RoleBadge({ role }: { role: StaffRole }) {
  const s = STYLES[role];
  return (
    <span style={{ ...chip, color: s.fg, background: s.bg }}>
      <span aria-hidden style={{ ...dot, background: s.dot }} />
      {s.label}
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
};
const dot: CSSProperties = { width: 7, height: 7, borderRadius: "var(--r-full)" };
