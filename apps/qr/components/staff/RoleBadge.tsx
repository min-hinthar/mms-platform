import type { StaffRole } from "@/lib/staff";
import { Badge } from "@mms/ui";

/**
 * Role chip (S1.1a) — owner / manager / server, color-coded from tokens (never hardcoded). Pure
 * presentational (renders inside server components). The role name is the accessible text; the dot is
 * decorative. Built on the shared `@mms/ui` Badge (P5.4).
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
    <Badge color={s.fg} background={s.bg} dot={s.dot}>
      {s.label}
    </Badge>
  );
}
